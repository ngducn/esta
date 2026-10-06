#!/bin/sh
OUT=../out
npx next start -p 3917 > /dev/null 2>&1 &
PID=$!
sleep 4
for r in receipt receipt-reactpdf; do
  for f in pdf png pdf png; do
    t=$(curl -s -o "$OUT/next-$r-$f.out" -D - "http://localhost:3917/api/$r/abc?format=$f" | grep -i server-timing | tr -d '\r')
    echo "$r $f $t"
  done
done
kill $PID
mv $OUT/next-receipt-pdf.out $OUT/next-route.pdf
mv $OUT/next-receipt-png.out $OUT/next-route.png
mv $OUT/next-receipt-reactpdf-pdf.out $OUT/next-route-reactpdf.pdf
rm -f $OUT/next-receipt-reactpdf-png.out
