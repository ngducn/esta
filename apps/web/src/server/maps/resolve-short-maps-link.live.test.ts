import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { resolveShortMapsLink } = await import('./resolve-short-maps-link');

const SPIKE_LINKS = ['https://maps.app.goo.gl/5EGXC5WSBATiA4av8', 'https://maps.app.goo.gl/9dudihPmscBQ6Rp87'];
const links = process.env.ESTA_MAPS_LIVE_LINKS?.split(/[\s,]+/).filter(Boolean) ?? SPIKE_LINKS;

describe('resolveShortMapsLink against Google', () => {
  test.each(links)('%s', async (link) => {
    const info = vi.spyOn(console, 'info');
    const started = performance.now();

    const result = await resolveShortMapsLink(link);

    const elapsed = Math.round(performance.now() - started);
    const lines = info.mock.calls.map(([line]) => String(line));
    info.mockRestore();
    console.log(`maps.resolve.live link=${link} elapsed_ms=${elapsed} ${JSON.stringify(result)}`);
    expect(result).toMatchObject({ ok: true, value: { kind: 'point' } });
    expect(lines.filter((line) => line.includes(' hop=')).length).toBeLessThanOrEqual(5);
    expect(lines.at(-1)).toBe('maps.resolve result=ok');
    expect(elapsed).toBeLessThan(3000);
  });
});
