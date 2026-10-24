import { LatLng, Serviceability, serviceabilityAt } from './booking';
import { Zone, fetchZones } from './markets';

/**
 * Where to point the homepage at.
 *
 * THE CITIES COME FROM THE SERVER. `/pricing/zones/` is the only thing that
 * decides where SaaradhiGo operates, and this module never adds to that list
 * -- a zone the dispatcher does not know about cannot appear on the site, and
 * a new one appears without a deploy.
 *
 * WHAT IS HARDCODED, AND WHY IT HAS TO BE. The homepage needs a coordinate
 * for two honest reasons: to centre a real map on the city, and to ask
 * `/pricing/vehicle-types/` which categories are actually sold there -- that
 * endpoint requires a lat/lng and there is no "list every category" route.
 * The zones endpoint does not return a centroid, so the city centres are
 * below, keyed by the server's own zone code.
 *
 * These are geographic facts about the cities, not product claims: they
 * decide only where a map is centred and which zone gets asked for prices.
 * A zone whose code is not listed is simply skipped for those two purposes
 * and still appears in the coverage list, so an unknown zone degrades to
 * "named but not illustrated" rather than to a wrong map.
 *
 * TODO(zones): return a centroid from `/pricing/zones/` and delete this
 * table. It is the one thing here that a new city would need a deploy for.
 */
const CITY_CENTRES: Record<string, LatLng> = {
  'IN-TG-HYD': { lat: 17.385, lng: 78.4867 }, // Hyderabad
  'IN-AP-VJA': { lat: 16.5062, lng: 80.648 }, // Vijayawada
  'IN-AP-VTZ': { lat: 17.6868, lng: 83.2185 }, // Visakhapatnam
  'IN-TG-WGL': { lat: 17.9689, lng: 79.5941 }, // Warangal
};

export type ServiceArea = {
  zone: Zone;
  /** The city centre, when one is known for this zone's code. */
  centre: LatLng | null;
};

/** Every live service area, in the order the server returned them. */
export async function fetchServiceAreas(): Promise<ServiceArea[]> {
  const zones = await fetchZones();
  return zones.map((zone) => ({
    zone,
    centre: CITY_CENTRES[zone.code] ?? null,
  }));
}

/**
 * The vehicle categories actually sold in a city.
 *
 * Returned straight from `/pricing/vehicle-types/`, which reads the zone's
 * active rate cards. If a category has no rate card it is not sold and does
 * not appear; nothing here adds a class the pricing service does not price.
 */
export async function fetchCategoriesAt(point: LatLng): Promise<Serviceability> {
  return serviceabilityAt(point);
}

/**
 * The first service area the homepage can illustrate.
 *
 * "First with a centre" rather than "first": a zone this build has no
 * coordinate for cannot centre a map or price a category list, so the page
 * falls through to one that can instead of rendering an empty section.
 */
export function primaryArea(areas: ServiceArea[]): ServiceArea | null {
  return areas.find((a) => a.centre !== null) ?? areas[0] ?? null;
}
