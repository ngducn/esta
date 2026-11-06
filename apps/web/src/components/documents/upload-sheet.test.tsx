import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';

const upload = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('./use-document-upload', () => ({
  useDocumentUpload: () => ({
    upload: { step: 'ready', prepared: { file: new File(['x'], 'giay.pdf', { type: 'application/pdf' }), sha256: 'a'.repeat(64), previews: { thumb: null, pageCount: 1 }, captured: false } },
    pick: vi.fn(),
    capture: vi.fn(),
    send: upload.send,
    proceed: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock('@/server/documents/actions', () => ({ registerDocument: vi.fn() }));
vi.mock('@/lib/use-object-url', () => ({ useObjectUrl: () => null }));

const { default: UploadSheet } = await import('./upload-sheet');

const open = () => renderInLocale(<UploadSheet open onOpenChange={() => undefined} finalFocus={{ current: null }} propertyId="p1" nickname="Nhà thử Demo" initialFile={null} onSaved={() => undefined} />);
const typeExpiry = (text: string) => fireEvent.change(screen.getByLabelText('Ngày hết hạn (nếu có)'), { target: { value: text } });

describe('upload sheet: expires on', () => {
  beforeEach(() => upload.send.mockReset());

  it('refuses to send while the date is not on the calendar, and sends once it is', () => {
    open();
    typeExpiry('31/09/2026');
    fireEvent.submit(screen.getByTestId('upload-sheet').querySelector('form') as HTMLFormElement);
    expect(upload.send).not.toHaveBeenCalled();
    typeExpiry('30/09/2026');
    fireEvent.submit(screen.getByTestId('upload-sheet').querySelector('form') as HTMLFormElement);
    expect(upload.send).toHaveBeenCalledTimes(1);
  });

  it('sends an empty date as no date', () => {
    open();
    fireEvent.submit(screen.getByTestId('upload-sheet').querySelector('form') as HTMLFormElement);
    expect(upload.send).toHaveBeenCalledTimes(1);
  });
});
