import { describe, expect, it } from 'vitest';
import { isOfficialHost, officialSourcesText } from './official-sources';

describe('isOfficialHost (#346)', () => {
  it.each(['gov.vn', 'mof.gov.vn', 'binhduong.gov.vn', 'Chinhphu.vn', 'vpcp.chinhphu.vn', 'baochinhphu.vn'])('trusts %s', (host) => {
    expect(isOfficialHost(host)).toBe(true);
  });

  it.each(['notgov.vn', 'gov.vn.evil.example', 'xchinhphu.vn', 'gov.vn.', 'example.com', ''])('does not trust %s, because only the host itself and its subdomains match', (host) => {
    expect(isOfficialHost(host)).toBe(false);
  });

  it('names every trusted source in the text the prompts show the model', () => {
    expect(officialSourcesText()).toContain('*.gov.vn');
  });
});
