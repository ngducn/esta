#!/usr/bin/env bash
set -euo pipefail

google_fonts_commit=7085eb89a950e85db5b166b7a58d414544b4140c
base="https://raw.githubusercontent.com/google/fonts/$google_fonts_commit/ofl"
out="$(cd "$(dirname "$0")/.." && pwd)/apps/web/src/fonts"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

vietnamese_and_basic_latin='U+0020-007E,U+00A0,U+00A9,U+00AB,U+00B0,U+00B2,U+00B7,U+00BB,U+00BD,U+00D7,U+00C0-00C3,U+00C8-00CA,U+00CC-00CD,U+00D2-00D5,U+00D9-00DA,U+00DD,U+00E0-00E3,U+00E8-00EA,U+00EC-00ED,U+00F2-00F5,U+00F9-00FA,U+00FD,U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0303,U+0309,U+0323,U+1EA0-1EF9,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+20AB,U+2192,U+2212'
text_features=kern,liga,calt,ccmp,locl,mark,mkmk,rvrn
fonttools() { uvx --quiet --from 'fonttools[woff]==4.60.1' "$@"; }

build() {
  local dir=$1 source=$2 axes=$3 features=$4 name=$5
  curl -fsSL -o "$work/$name.ttf" "$base/$dir/$source"
  fonttools fonttools varLib.instancer --quiet "$work/$name.ttf" $axes -o "$work/$name.instanced.ttf"
  fonttools pyftsubset "$work/$name.instanced.ttf" --unicodes="$vietnamese_and_basic_latin" --layout-features="$features" \
    --name-IDs='*' --no-hinting --flavor=woff2 --output-file="$out/$name.woff2"
}

mkdir -p "$out"
build inter 'Inter%5Bopsz,wght%5D.ttf' 'wght=400:600' "$text_features,tnum" Inter-Variable
curl -fsSL "$base/inter/OFL.txt" > "$out/LICENSE-OFL.txt"
(cd "$out" && shasum -a 256 ./*.woff2)

# pdf-lib and satori embed static TrueType only, so the receipts get regular and semibold instances. Their subset adds
# Latin-1 Supplement to the web's, because a receipt prints what was typed: m³ on a water line, a name such as Müller.
receipts="$out/../server/receipts/fonts"
mkdir -p "$receipts"
cp "$out/LICENSE-OFL.txt" "$receipts/LICENSE-OFL.txt"
for weight in Regular:400 SemiBold:600; do
  fonttools fonttools varLib.instancer --quiet "$work/Inter-Variable.ttf" "wght=${weight#*:}" opsz=14 --update-name-table -o "$work/${weight%%:*}.ttf"
  fonttools pyftsubset "$work/${weight%%:*}.ttf" --unicodes="$vietnamese_and_basic_latin,U+00A0-00FF" --layout-features="$text_features,tnum" \
    --name-IDs='*' --no-hinting --output-file="$receipts/Inter-${weight%%:*}.ttf"
done
(cd "$receipts" && shasum -a 256 ./*.ttf)
