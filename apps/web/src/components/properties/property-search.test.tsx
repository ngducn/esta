import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertySearch } from './property-search';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(),
}));

function setup() {
  render(
    <>
      <PropertySearch label="Tìm" placeholder="Tìm tài sản" />
      <a href="/properties/abc">Đất Bảo Lộc</a>
      <a href="/properties/abc" target="_blank">Tab mới</a>
      <a href="/properties/abc" download>Tải về</a>
      <a href="/properties?kind=land">Đất</a>
      <a href="#top">Đầu trang</a>
      <a href="https://example.com/properties/abc">Ngoài</a>
    </>,
  );
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bao loc' } });
}

describe('PropertySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
    window.history.replaceState(null, '', '/properties');
  });
  afterEach(() => vi.useRealTimers());

  it('puts the query in the URL once typing pauses', () => {
    setup();
    act(() => vi.advanceTimersByTime(200));
    expect(replace).toHaveBeenCalledWith('/properties?q=bao+loc', { scroll: false });
  });

  it('drops the pending replace when a link is clicked, so it cannot pull the user back from the page they chose', () => {
    setup();
    fireEvent.click(screen.getByRole('link', { name: 'Đất Bảo Lộc' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(replace).not.toHaveBeenCalled();
  });

  describe('keeps the pending replace when the page stays', () => {
    function expectReplaceStillFires() {
      act(() => vi.advanceTimersByTime(200));
      expect(replace).toHaveBeenCalledWith('/properties?q=bao+loc', { scroll: false });
    }

    it.each([['ctrlKey'], ['metaKey'], ['shiftKey'], ['altKey']])('on a %s click', (modifier) => {
      setup();
      fireEvent.click(screen.getByRole('link', { name: 'Đất Bảo Lộc' }), { [modifier]: true });
      expectReplaceStillFires();
    });

    it('on a middle click', () => {
      setup();
      fireEvent.click(screen.getByRole('link', { name: 'Đất Bảo Lộc' }), { button: 1 });
      expectReplaceStillFires();
    });

    it.each([['Tab mới'], ['Tải về'], ['Đất'], ['Đầu trang'], ['Ngoài']])('on a click to "%s"', (name) => {
      setup();
      fireEvent.click(screen.getByRole('link', { name }));
      expectReplaceStillFires();
    });
  });

  it('drops the pending replace on unmount', () => {
    setup();
    cleanup();
    act(() => vi.advanceTimersByTime(1000));
    expect(replace).not.toHaveBeenCalled();
  });
});
