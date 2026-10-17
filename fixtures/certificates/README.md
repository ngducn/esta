# Synthetic certificate fixtures

Sixteen synthetic land certificates with known truth, for spike S5 (`docs/plan/spikes/s5-extraction.md`), the P2-03 golden tests and the P2-08 end-to-end test. Every name contains "Demo" and every ID number is invented. No real family data belongs here.

## Regenerate

```sh
pnpm fixtures:certificates
```

A run that changes nothing prints `16 fixtures, manifest unchanged`. `manifest.json` holds the SHA-256 of every generated file, and `generate.test.ts` fails when two fixtures render different bytes from the committed manifest.

## Layout

Each `<form>-<variant>/` folder holds the pages and a `truth.json`:

- `scan` is a clean PDF, `document.pdf`.
- `photo` is one JPEG per page at quality 70, turned 4 to 8 degrees, leaning back, with a glare band.
- `low-light` is the photo, darker, with a 1.2 px blur and sensor noise.
- `northstar-di-an` is the north-star sổ hồng for Dãy trọ Dĩ An, a `gcn_2009_2024` in the `photo` variant.

`truth.json` holds the `certificate_v1` truth (confidence 1, the page each value is printed on, and page null for an absent value), the full ID numbers printed on the page (`printed_id_numbers`, so P2-03 can prove it keeps only `id_last4`), the QR payload of the `gcn_2024` pages and, for `paper_only`, the paths of the handwritten fields.

The data lives in `generator/facts.ts`, one template per DOMAIN-VN §2 form in `generator/templates/`, and the camera effects in `generator/degrade.ts`. The degradation draws from a seeded RNG, so a rerun is byte-identical.

## Fonts

Satori needs TrueType files, and the web app ships only subset WOFF2, so the generator carries its own fonts under `generator/fonts/`. Both are under the SIL Open Font License 1.1; the license texts sit next to the files.

| File | Source | SHA-256 |
| --- | --- | --- |
| `BeVietnamPro-Regular.ttf` | `spike/s7-receipt` at `8548686`, `spikes/s7-receipt/fonts/` | `cd1ef6e9d7db28ad5cdb88a65ccbe693870e60d340b791f349d248342b4fe4c3` |
| `BeVietnamPro-Bold.ttf` | `spike/s7-receipt` at `8548686`, `spikes/s7-receipt/fonts/` | `7f738fe5c43c8872807b20e2d30d42163618de8a4daf7f48a939adac32c16847` |
| `PatrickHand-Regular.ttf` | google/fonts at `7085eb89a950e85db5b166b7a58d414544b4140c` (the commit `scripts/fonts-build.sh` pins), `ofl/patrickhand/` | `0f173b3e6cb6d1af25babf7f0057c5ac4ee11f9992b0469bb817e967ef4ad0fc` |

Patrick Hand is the handwriting-style face for `paper_only`. It covers Vietnamese.
