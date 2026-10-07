#!/usr/bin/env bash
set -euo pipefail

google_fonts_commit=7085eb89a950e85db5b166b7a58d414544b4140c
base="https://raw.githubusercontent.com/google/fonts/$google_fonts_commit/ofl"
out="$(cd "$(dirname "$0")/.." && pwd)/apps/web/src/fonts"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

latin_and_vietnamese='U+0000-00FF,U+0102-0103,U+0110-0111,U+0128-0129,U+0131,U+0152-0153,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0309,U+0323,U+0329,U+1EA0-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+2044,U+20AB-20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD'
fonttools() { uvx --quiet --from 'fonttools[woff]==4.60.1' "$@"; }

build() {
  local dir=$1 source=$2 axes=$3 name=$4
  curl -fsSL -o "$work/$name.ttf" "$base/$dir/$source"
  fonttools fonttools varLib.instancer --quiet "$work/$name.ttf" $axes -o "$work/$name.instanced.ttf"
  fonttools pyftsubset "$work/$name.instanced.ttf" --unicodes="$latin_and_vietnamese" --layout-features+=tnum,lnum,onum,pnum,case \
    --name-IDs='*' --no-hinting --flavor=woff2 --output-file="$out/$name.woff2"
}

mkdir -p "$out"
build sourcesans3 'SourceSans3%5Bwght%5D.ttf' 'wght=400:600' SourceSans3-Variable
build sourceserif4 'SourceSerif4%5Bopsz,wght%5D.ttf' 'wght=400:600 opsz=20:60' SourceSerif4-Variable
{
  curl -fsSL "$base/sourcesans3/OFL.txt"
  printf '\n\n'
  curl -fsSL "$base/sourceserif4/OFL.txt"
} > "$out/LICENSE-OFL.txt"
(cd "$out" && shasum -a 256 ./*.woff2)
