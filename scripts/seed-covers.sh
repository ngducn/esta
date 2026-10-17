#!/usr/bin/env bash
set -euo pipefail

# Rebuilds the seed covers in supabase/seed/photos/ from the 640 px WebP sources in source/. Each is cropped to the
# card's 16:10 at the centre and encoded as AVIF on one thread, so the pinned ffmpeg build gives the same bytes on every run.
photos="$(cd "$(dirname "$0")/.." && pwd)/supabase/seed/photos"
want_ffmpeg='ffmpeg version 9.0.2'

ffmpeg -version | head -1 | grep -qF "$want_ffmpeg" || { echo "seed-covers: needs $want_ffmpeg" >&2; exit 1; }

for source in "$photos"/source/*.webp; do
  name=$(basename "$source" .webp)
  ffmpeg -hide_banner -nostdin -loglevel error -y -i "$source" \
    -vf "crop='trunc(min(iw,ih*16/10)/2)*2':'trunc(min(ih,iw*10/16)/2)*2'" \
    -frames:v 1 -c:v libsvtav1 -crf 42 -preset 4 -pix_fmt yuv420p -svtav1-params lp=1 \
    -map_metadata -1 -fflags +bitexact "$photos/$name.avif" 2> >(grep -v '^Svt\[info\]' >&2)
done
echo "seed-covers: $(ls "$photos"/*.avif | wc -l | tr -d ' ') covers"
