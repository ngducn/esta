import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:3000/dev/glyphs');
await p.evaluate(() => document.fonts.ready);
const r = await p.evaluate(() => {
  const s = (a) => document.querySelector(`[data-amount="${a}"] span`);
  const cs = getComputedStyle(s(1111111));
  return {
    w1: s(1111111).getBoundingClientRect().width, w8: s(8888888).getBoundingClientRect().width,
    family: cs.fontFamily, fvn: cs.fontVariantNumeric, ffs: cs.fontFeatureSettings, size: cs.fontSize,
    faces: [...document.fonts].map((f) => `${f.family}|${f.status}|${f.weight}`),
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
