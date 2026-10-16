'use client';

import { useEffect, useRef, useState } from 'react';

type ScanState = 'pending' | 'match' | 'mismatch';

type Labels = Record<ScanState, string> & { scan: string };

export function VietQrScan({ id, payload, labels }: { id: string; payload: string; labels: Labels }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanned, setScanned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const [{ default: QRCode }, { default: jsQR }] = await Promise.all([import('qrcode'), import('jsqr')]);
      await QRCode.toCanvas(canvas, payload, { errorCorrectionLevel: 'M', margin: 4, scale: 6 });
      const context = canvas.getContext('2d');
      if (!context) return;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height);
      if (!cancelled) setScanned(found?.data ?? '');
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const state: ScanState = scanned === null ? 'pending' : scanned === payload ? 'match' : 'mismatch';

  return (
    <figure className="flex flex-col items-start gap-2">
      <canvas ref={canvasRef} data-testid={`${id}-canvas`} className="max-w-full rounded border bg-white" />
      <figcaption data-testid={`${id}-scan`} data-match={state} className="text-small">
        {labels.scan}: {labels[state]}
      </figcaption>
    </figure>
  );
}
