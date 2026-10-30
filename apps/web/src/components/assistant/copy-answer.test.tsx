import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { UndoToastProvider } from '../undo-toast-provider';
import { CopyAnswer } from './copy-answer';

const labels = { copy: 'Sao chép', copyLabel: 'Sao chép câu trả lời lúc 09:00', copied: 'Đã sao chép câu trả lời.', failed: 'Chưa sao chép được.' };

describe('Sao chép (#351)', () => {
  afterEach(() => Reflect.deleteProperty(navigator, 'clipboard'));

  it('leaves the answer it wraps selected when the clipboard refuses, so Mẹ can copy it with a long press', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
    renderInLocale(
      <UndoToastProvider>
        <article>
          <p>Một câu trả lời khác.</p>
          <CopyAnswer text="Chào anh Em." labels={labels}>
            <p>Chào anh Em.</p>
          </CopyAnswer>
        </article>
      </UndoToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: labels.copyLabel }));
    await screen.findByText(labels.failed);
    await waitFor(() => expect(window.getSelection()?.toString()).toBe('Chào anh Em.'));
  });
});
