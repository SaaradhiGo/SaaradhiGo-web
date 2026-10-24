/**
 * The SaaradhiGo basemap.
 *
 * Google's default map is a general-purpose map of the world. This turns it
 * into the surface the design system draws: a near-black ground with warm
 * charcoal roads in three weights, dark water, darker parks, and labels in a
 * muted gold-grey. In the light theme the same style array resolves to ivory
 * ground and white arterials, because every colour below is read from the
 * `--map-*` custom properties at call time rather than written here.
 *
 * SEVEN COLOURS, AND NOT ONE MORE. `map-ground`, `map-street`,
 * `map-arterial`, `map-highway`, `map-water`, `map-park` and `map-label` are
 * the whole palette the map is allowed. Anything Google would otherwise tint
 * from its own palette -- business pins, transit lines, parcel boundaries --
 * is turned off rather than recoloured, which is also what keeps the route
 * and the two journey markers the only saturated things on the surface.
 *
 * WHY READ THE TOKENS AT RUNTIME. The Maps JavaScript API takes colour
 * strings, not CSS variables, so something has to resolve them. Reading the
 * computed custom properties off <html> means this file holds no colour of
 * its own, the light theme needs no second style array, and a token edit in
 * `tokens.css` reaches the map with nothing else to update.
 */

/** The tokens the map style and the markers need, resolved for the current theme. */
export type MapPalette = {
  ground: string;
  street: string;
  arterial: string;
  highway: string;
  water: string;
  park: string;
  label: string;
  gold: string;
  pickup: string;
  noir: string;
  surface: string;
};

function token(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Reads the live palette off the document.
 *
 * The fallbacks are the dark theme's values and exist for one case: being
 * called before the stylesheet has applied, where an empty string would
 * make Google reject the whole style array and fall back to its own map.
 * They are the only colour literals outside `tokens.css`, which is why they
 * are written as the token names' own values and not as new choices --
 * `src/styles/tokens.css` is the source, and the no-hex check excludes this
 * block by name rather than by accident.
 */
export function readMapPalette(): MapPalette {
  const styles = getComputedStyle(document.documentElement);
  return {
    ground: token(styles, '--map-ground', 'rgb(15,13,11)'),
    street: token(styles, '--map-street', 'rgb(29,25,20)'),
    arterial: token(styles, '--map-arterial', 'rgb(43,38,30)'),
    highway: token(styles, '--map-highway', 'rgb(58,48,33)'),
    water: token(styles, '--map-water', 'rgb(11,19,21)'),
    park: token(styles, '--map-park', 'rgb(17,20,15)'),
    label: token(styles, '--map-label', 'rgb(143,131,109)'),
    gold: token(styles, '--gold-500', 'rgb(214,168,62)'),
    pickup: token(styles, '--pickup', 'rgb(70,201,139)'),
    noir: token(styles, '--noir', 'rgb(9,7,8)'),
    surface: token(styles, '--bg-100', 'rgb(19,17,16)'),
  };
}

/**
 * The style array for the Maps JavaScript API.
 *
 * ONE KNOWN LIMITATION, STATED HERE RATHER THAN HIDDEN. The design system
 * sets basemap place names in Cinzel, uppercase, at .28em tracking. The Maps
 * JavaScript API exposes no typography control at all -- `styles` can set a
 * label's fill, stroke and visibility and nothing else -- so place names take
 * the `map-label` colour with a `map-ground` halo and keep Google's own face.
 * The design's Cinzel label treatment is applied where this app does control
 * the type: the map's eyebrow, and the floating `MapLabel` pills.
 */
/**
 * One entry of a Maps JavaScript API `styles` array.
 *
 * Declared here rather than taken from `@types/google.maps`: this app loads
 * the Maps library at runtime from a <script> tag and has no compile-time
 * dependency on it, and adding 400KB of ambient types to describe a
 * three-field object would be the larger change.
 */
export type MapTypeStyle = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

export function mapStyles(p: MapPalette): MapTypeStyle[] {
  return [
    // The ground, and the default for anything not named below.
    { elementType: 'geometry', stylers: [{ color: p.ground }] },

    // Labels: muted, with a halo in the ground colour so they stay legible
    // over a road without needing a second colour.
    { elementType: 'labels.text.fill', stylers: [{ color: p.label }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: p.ground }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

    // Roads, in the three weights the design system names.
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: p.street }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: p.street }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: p.arterial }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: p.highway }] },
    { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: p.highway }] },

    // Water and green space.
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: p.water }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: p.label }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: p.park }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: p.park }] },

    // Everything Google would tint from its own palette, off. A ride-hailing
    // map is about one journey; a hundred business pins compete with the
    // route for the only thing the rider is looking for.
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];
}

/**
 * A rounded square, for the destination marker.
 *
 * The pickup is a CIRCLE and the destination is a SQUARE, in the design
 * system and therefore here: the two ends of a journey are distinguished by
 * shape as well as by colour, on the map exactly as in the location fields,
 * so a rider who cannot separate green from gold can still read which pin is
 * which. `SymbolPath` offers no square, so this is the path, with a 3px
 * corner radius on a 22px box to match `.sg-field__marker--drop`.
 */
export const DESTINATION_SQUARE =
  'M -8 -11 L 8 -11 Q 11 -11 11 -8 L 11 8 Q 11 11 8 11 L -8 11 '
  + 'Q -11 11 -11 8 L -11 -8 Q -11 -11 -8 -11 Z';
