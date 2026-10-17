# Seed photo attribution

Demo cover photos for the seeded properties. `scripts/seed-photos.ts` uploads each one to the private `property-photos` bucket at the `cover_photo_path` the seed gives it. They never ship in the web bundle.

Every photo here comes from Pexels under the Pexels License (https://www.pexels.com/license/): free use, editing allowed, attribution optional. Not allowed: reselling unaltered copies, redistributing on competing stock sites, or implying that a person or brand endorses a product. Each photo page showed "Free" with no editorial or sponsored label when checked on 2026-10-16.

Each source in `source/` started as the 1280 px wide WebP made from the Pexels download `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=1600` with `cwebp` at quality 72, then re-encoded by P1-04 to 640 px wide with `cwebp -q 60 -resize 640 0 -metadata none`.

The covers uploaded by the seed are the `.avif` files beside this one, built from those sources by `scripts/seed-covers.sh` (ffmpeg 9.0.2 with SVT-AV1 4.2.0): a centre crop to the card's 16:10, then AVIF at CRF 42 on one thread, so a rerun writes the same bytes. A signed storage URL skips the image optimizer, and the card shows the cover at most about 380 CSS px wide. The two first-screen covers on a phone weigh about 34 KB together, down from 92 KB as WebP, which moved the Lighthouse mobile LCP on Tài sản by about 240 ms (#68).

| File | Shows | Author | Source page | Edits |
| --- | --- | --- | --- | --- |
| `nha-pho` | Teal three-storey tube house with balcony laundry, Ho Chi Minh City | Markus Winkler | https://www.pexels.com/photo/facade-of-a-residential-building-with-laundry-on-the-balcony-in-city-2827124/ | Cropped the top 80 px to remove a signboard with a house number |
| `day-tro` | Low-rise block with long balconies and many doors | Tuan Vy | https://www.pexels.com/photo/urban-apartment-building-in-southeast-asian-city-31220026/ | None |
| `can-ho` | High-rise apartment towers with balconies, Ho Chi Minh City | J-Steve Pham | https://www.pexels.com/photo/high-rise-apartment-buildings-under-clear-sky-31681835/ | None |
| `dat` | Dirt track beside a fenced field in the Vietnamese countryside | Hong Son | https://www.pexels.com/photo/rural-dirt-road-with-power-lines-in-countryside-37405749/ | None |
