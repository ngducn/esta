'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { QR_QUIET_MODULES, type QrMatrix } from '@/lib/qr';
import { saveBlob } from '@/lib/save-blob';
import type { InvoiceQrView } from '@/server/invoices/qr';

const MODULE_PX = 12;
const LINE_PX = 52;

/** The code over the amount, memo and account, in the page's typeface and the QR tokens, as a PNG. */
async function drawQrImage(qr: InvoiceQrView, matrix: QrMatrix): Promise<Blob> {
  await document.fonts.ready;
  const style = getComputedStyle(document.documentElement);
  const [paper, ink, family] = [style.getPropertyValue('--qr-paper'), style.getPropertyValue('--qr-ink'), getComputedStyle(document.body).fontFamily];
  const side = (matrix.size + QR_QUIET_MODULES * 2) * MODULE_PX;
  const lines = [
    { text: qr.amountText, weight: 700, px: 40 },
    { text: qr.memo, weight: 700, px: 34 },
    { text: `${qr.bankName} · ${qr.accountNo}`, weight: 500, px: 28 },
    { text: qr.accountName, weight: 500, px: 28 },
    { text: qr.number, weight: 400, px: 24 },
  ];
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side + lines.length * LINE_PX + MODULE_PX * 2;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas gave no 2d context');
  context.fillStyle = paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = ink;
  context.save();
  context.scale(MODULE_PX, MODULE_PX);
  context.translate(QR_QUIET_MODULES, QR_QUIET_MODULES);
  context.fill(new Path2D(matrix.path));
  context.restore();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach(({ text, weight, px }, index) => {
    context.font = `${weight} ${px}px ${family}`;
    context.fillText(text, side / 2, side + LINE_PX * (index + 0.5), side - MODULE_PX * 4);
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob === null ? reject(new Error('Canvas gave no PNG')) : resolve(blob)), 'image/png'));
}

/** `Lưu ảnh`: the picture Mẹ sends in Zalo, named after the bill. */
export function SaveQrImage({ qr, matrix, labels }: { qr: InvoiceQrView; matrix: QrMatrix; labels: { save: string; failed: string } }) {
  const [failed, setFailed] = useState(false);
  async function save() {
    setFailed(false);
    try {
      saveBlob(await drawQrImage(qr, matrix), `hoa-don-${qr.number}.png`);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" data-testid="qr-save" onClick={() => void save()} className={buttonVariants({ variant: 'outline' })}>
        <Download aria-hidden="true" />
        {labels.save}
      </button>
      {failed ? (
        <p role="alert" className="text-small text-overdue">
          {labels.failed}
        </p>
      ) : null}
    </div>
  );
}
