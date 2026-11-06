export type WebCaps = { readonly WebSearch: number; readonly WebFetch: number };

/**
 * The most searches and fetches one run of each kind may make, and the one place these numbers live: the prompts
 * state them, the policy enforces them, and a retried run spends what the earlier attempts left (AGENT.md §5.2, §5.6).
 * `research_scan` holds the ceiling that `household_settings.agent` may lower.
 */
export const WEB_CAPS = {
  ask: { WebSearch: 4, WebFetch: 4 },
  weekly_review: { WebSearch: 6, WebFetch: 4 },
  research_scan: { WebSearch: 12, WebFetch: 8 },
} as const satisfies Record<string, WebCaps>;

/** What is left of `caps` once the earlier attempts of the same job spent `spent` (the run rows' tool call counts). */
export function remainingWebCaps(caps: WebCaps, spent: Readonly<Record<string, unknown>>): WebCaps {
  const used = (tool: keyof WebCaps) => (typeof spent[tool] === 'number' && Number.isFinite(spent[tool]) ? Math.max(0, spent[tool]) : 0);
  return { WebSearch: Math.max(0, caps.WebSearch - used('WebSearch')), WebFetch: Math.max(0, caps.WebFetch - used('WebFetch')) };
}
