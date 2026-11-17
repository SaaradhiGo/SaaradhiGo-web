"""Fetch the OpenStreetMap data and the road route for the home hero maps.

Run once by hand (network needed); the outputs in data/ are committed and
build_hero_maps.mjs draws the images from them. Data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, sys, time, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / 'data'
UA = {'User-Agent': 'hero-map-builder/1.0'}
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
CITIES = json.loads((HERE / 'cities.json').read_text())


def get(url, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def overpass(query):
    body = urllib.parse.urlencode({'data': query}).encode()
    for attempt in range(12):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            raw = get(url, body)
            if raw.lstrip().startswith(b'{'):
                return json.loads(raw)
            print('  not json from', url, raw[:80], file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - mirrors fail in many ways
            print('  ', url, type(e).__name__, str(e)[:80], file=sys.stderr)
        time.sleep(min(60, 5 * (attempt + 1)))
    raise SystemExit('overpass: all mirrors failed')


def osrm(a, b):
    url = ('https://router.project-osrm.org/route/v1/driving/'
           f"{a['lng']},{a['lat']};{b['lng']},{b['lat']}?overview=full&geometries=geojson")
    route = json.loads(get(url))['routes'][0]
    return {'distance_m': route['distance'], 'duration_s': route['duration'],
            'coords': route['geometry']['coordinates']}


def main(only=None):
    DATA.mkdir(exist_ok=True)
    for key, c in CITIES.items():
        if only and key != only:
            continue
        rpath = DATA / f'{key}-route.json'
        if not rpath.exists():
            rpath.write_text(json.dumps(osrm(c['from'], c['to'])))
            print(key, 'route ok')
        s, w, n, e = c['bbox']
        for layer, sel in c['layers'].items():
            path = DATA / f'{key}-{layer}.json'
            if path.exists():
                continue
            q = f'[out:json][timeout:170][bbox:{s},{w},{n},{e}];({sel});out geom qt;'
            print(key, layer, '...', flush=True)
            js = overpass(q)
            # Keep only what the renderer reads: tags it styles by, and rounded geometry.
            slim = []
            for el in js.get('elements', []):
                t = el.get('tags', {})
                keep = {k: t[k] for k in ('highway', 'natural', 'water', 'waterway', 'leisure', 'landuse', 'railway', 'name') if k in t}
                if el['type'] == 'way' and 'geometry' in el:
                    slim.append({'t': keep, 'g': [[round(p['lon'], 6), round(p['lat'], 6)] for p in el['geometry']]})
                elif el['type'] == 'relation':
                    for m in el.get('members', []):
                        if m.get('type') == 'way' and 'geometry' in m and m.get('role') in ('outer', ''):
                            slim.append({'t': keep, 'rel': el['id'], 'g': [[round(p['lon'], 6), round(p['lat'], 6)] for p in m['geometry']]})
            path.write_text(json.dumps(slim, separators=(',', ':')))
            print(key, layer, len(slim), 'ways')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
