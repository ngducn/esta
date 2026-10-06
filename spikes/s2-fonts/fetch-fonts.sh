#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
REF=7085eb89a950e85db5b166b7a58d414544b4140c
BASE="https://raw.githubusercontent.com/google/fonts/$REF/ofl"
mkdir -p fonts
get() { curl -fsSL "$BASE/$1/$2" -o "fonts/$3"; }
for w in Regular Medium SemiBold Bold; do get bevietnampro "BeVietnamPro-$w.ttf" "BeVietnamPro-$w.ttf"; done
get bevietnampro OFL.txt OFL-BeVietnamPro.txt
get newsreader 'Newsreader%5Bopsz,wght%5D.ttf' 'Newsreader[opsz,wght].ttf'
get newsreader OFL.txt OFL-Newsreader.txt
get sourceserif4 'SourceSerif4%5Bopsz,wght%5D.ttf' 'SourceSerif4[opsz,wght].ttf'
get sourceserif4 OFL.txt OFL-SourceSerif4.txt
get fraunces 'Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf' 'Fraunces[SOFT,WONK,opsz,wght].ttf'
get fraunces OFL.txt OFL-Fraunces.txt
get sourcesans3 'SourceSans3%5Bwght%5D.ttf' 'SourceSans3[wght].ttf'
get sourcesans3 OFL.txt OFL-SourceSans3.txt
get publicsans 'PublicSans%5Bwght%5D.ttf' 'PublicSans[wght].ttf'
get publicsans OFL.txt OFL-PublicSans.txt
shasum -a 256 fonts/*
