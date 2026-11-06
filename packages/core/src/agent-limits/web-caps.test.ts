import { remainingWebCaps, WEB_CAPS } from './web-caps';

describe('remainingWebCaps', () => {
  it('leaves the whole cap to a first attempt', () => {
    expect(remainingWebCaps(WEB_CAPS.research_scan, {})).toEqual({ WebSearch: 12, WebFetch: 8 });
  });

  it('takes away what the earlier attempts used, never below zero', () => {
    expect(remainingWebCaps(WEB_CAPS.research_scan, { WebSearch: 5, WebFetch: 9, mcp__esta__add_research_item: 3 })).toEqual({ WebSearch: 7, WebFetch: 0 });
  });

  it('ignores a count that is not a number', () => {
    expect(remainingWebCaps(WEB_CAPS.ask, { WebSearch: 'many', WebFetch: -2 })).toEqual({ WebSearch: 4, WebFetch: 4 });
  });
});
