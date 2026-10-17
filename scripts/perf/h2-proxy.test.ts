import { describe, expect, it } from 'vitest';
import { proxyPort, renderPerfCaddyfile } from './h2-proxy.ts';

describe('renderPerfCaddyfile', () => {
  it('terminates TLS on loopback and proxies to the upstream', () => {
    const text = renderPerfCaddyfile({ port: 4917, upstream: 'localhost:3917', certFile: '/c.pem', keyFile: '/k.pem' });
    expect(text).toContain('https://localhost:4917 {');
    expect(text).toContain('bind 127.0.0.1');
    expect(text).toContain('reverse_proxy localhost:3917');
  });

  it('keeps slots apart', () => {
    expect(proxyPort(3)).toBe(proxyPort(0) + 300);
  });
});
