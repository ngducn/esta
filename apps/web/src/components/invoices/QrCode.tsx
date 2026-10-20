import { QR_QUIET_MODULES, type QrMatrix } from '@/lib/qr';
import { cn } from '@/lib/utils';

/** The code on its fixed light tile, crisp at any size; the quiet zone is part of the tile. */
export function QrCode({ matrix, label, className }: { matrix: QrMatrix; label: string; className?: string }) {
  const side = matrix.size + QR_QUIET_MODULES * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="qr-code"
      viewBox={`${-QR_QUIET_MODULES} ${-QR_QUIET_MODULES} ${side} ${side}`}
      shapeRendering="crispEdges"
      className={cn('block aspect-square w-full rounded-md bg-qr-paper', className)}
    >
      <path d={matrix.path} className="fill-qr-ink" />
    </svg>
  );
}
