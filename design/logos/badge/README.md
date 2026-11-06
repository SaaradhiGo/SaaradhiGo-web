# Badge

**DRAFT, to be redrawn by the illustrator with the full logo.**

The small mark taken from Srini's logo: the ring, the road rising into a sail, the pin and the ground line. The horse, rider and wheel stay in the full logo (`../svg/saaradhigo-logo-*.svg`); at small sizes they turn to noise.

Never add a bevel, gradient or glow to the badge.

## Cuts

| Cut | Use at | What changes |
|---|---|---|
| `full` | 96px and above | Everything: road dashes and ground line |
| `small` | 33-95px | No dashes, no ground line, heavier ring |
| `favicon` | 17-32px | Solid sail |
| `favicon16` (PNG only) | 16px | Solid sail, pin dropped |

## Colours

| File suffix | Colour | For |
|---|---|---|
| `gold` | #FFD700 | Screens, on black |
| `classic-gold` | #D6A83E | Print, on black |
| `deep-gold` | #7A6000 | White and light pages, letters |
| `black` | #000000 | Receipts, stamps, one-colour print |
| `white` | #FFFFFF | Over photos and dark vehicles |

`svg/badge-<cut>-<colour>.svg` are transparent. `svg/tile-<cut>-<pair>.svg` sit on a ground: `gold-on-black` (rider app icon), `black-on-classic-gold` (driver app icon), `deep-gold-on-light`, `classic-gold-on-black`. `svg/map-marker-driver.svg` is the driver's car on the rider's map (favicon cut, gold on black, white ring).

## PNGs

`png/rider/` and `png/driver/`: icon-1024 down to icon-16 (each from the right cut), maskable 512 and 192, Android launcher, adaptive foreground and notification icons. `png/marker/`: the map marker at 1x, 2x, 3x.

Regenerate with `node generate.mjs <dir containing node_modules/sharp>`.
