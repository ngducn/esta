#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
F=fonts
exec node coverage.mjs --text-file glyph-test-string.txt --require-features tnum,lnum \
  $F/BeVietnamPro-Regular.ttf $F/BeVietnamPro-Medium.ttf $F/BeVietnamPro-SemiBold.ttf $F/BeVietnamPro-Bold.ttf \
  "$F/Newsreader[opsz,wght].ttf@wght=400,opsz=16" "$F/Newsreader[opsz,wght].ttf@wght=500,opsz=16" "$F/Newsreader[opsz,wght].ttf@wght=600,opsz=16" \
  "$F/Newsreader[opsz,wght].ttf@wght=400,opsz=72" "$F/Newsreader[opsz,wght].ttf@wght=600,opsz=72" \
  "$F/SourceSerif4[opsz,wght].ttf@wght=400,opsz=16" "$F/SourceSerif4[opsz,wght].ttf@wght=500,opsz=16" "$F/SourceSerif4[opsz,wght].ttf@wght=600,opsz=16" \
  "$F/SourceSerif4[opsz,wght].ttf@wght=400,opsz=60" "$F/SourceSerif4[opsz,wght].ttf@wght=600,opsz=60" \
  "$F/Fraunces[SOFT,WONK,opsz,wght].ttf@wght=400,opsz=14" "$F/Fraunces[SOFT,WONK,opsz,wght].ttf@wght=500,opsz=14" "$F/Fraunces[SOFT,WONK,opsz,wght].ttf@wght=600,opsz=14" \
  "$F/Fraunces[SOFT,WONK,opsz,wght].ttf@wght=400,opsz=144" "$F/Fraunces[SOFT,WONK,opsz,wght].ttf@wght=600,opsz=144" \
  "$F/SourceSans3[wght].ttf@wght=400" "$F/SourceSans3[wght].ttf@wght=500" "$F/SourceSans3[wght].ttf@wght=600" "$F/SourceSans3[wght].ttf@wght=700" \
  "$F/PublicSans[wght].ttf@wght=400" "$F/PublicSans[wght].ttf@wght=500" "$F/PublicSans[wght].ttf@wght=600" "$F/PublicSans[wght].ttf@wght=700"
