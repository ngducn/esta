# Seed photo attribution

Demo cover photos for the seeded properties. `scripts/seed-photos.ts` uploads each one to the private `property-photos` bucket at the `cover_photo_path` the seed gives it. They never ship in the web bundle.

Every photo here comes from Pexels under the Pexels License (https://www.pexels.com/license/): free use, editing allowed, attribution optional. Not allowed: reselling unaltered copies, redistributing on competing stock sites, or implying that a person or brand endorses a product. Each photo page showed "Free" with no editorial or sponsored label when checked on 2026-10-16.

Each file started as the 1280 px wide WebP made from the Pexels download `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=1600` with `cwebp` at quality 72. P1-04 resized each to 800 px wide with `cwebp -q 72 -resize 800 0 -metadata none`, because a signed storage URL skips the image optimizer and a phone card should cost about 60 KB.

| File | Shows | Author | Source page | Edits |
| --- | --- | --- | --- | --- |
| `nha-pho.webp` | Teal three-storey tube house with balcony laundry, Ho Chi Minh City | Markus Winkler | https://www.pexels.com/photo/facade-of-a-residential-building-with-laundry-on-the-balcony-in-city-2827124/ | Cropped the top 80 px to remove a signboard with a house number |
| `day-tro.webp` | Low-rise block with long balconies and many doors | Tuan Vy | https://www.pexels.com/photo/urban-apartment-building-in-southeast-asian-city-31220026/ | None |
| `can-ho.webp` | High-rise apartment towers with balconies, Ho Chi Minh City | J-Steve Pham | https://www.pexels.com/photo/high-rise-apartment-buildings-under-clear-sky-31681835/ | None |
| `dat.webp` | Dirt track beside a fenced field in the Vietnamese countryside | Hong Son | https://www.pexels.com/photo/rural-dirt-road-with-power-lines-in-countryside-37405749/ | None |
