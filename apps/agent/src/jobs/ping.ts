/** Carries no date, id or household name, so one recording replays at any clock for every household (AGENT.md §8). */
export const PING_PROMPT = [
  'This is a connection check for Esta, a family property app.',
  'Call the household_info tool once.',
  "Then reply with exactly one sentence in the household's locale (vi means Vietnamese) that says the connection works and names the household exactly as the tool returned it.",
  'Write nothing else: no numbers, no lists, no emoji.',
].join('\n');

export type PingResult = { readonly reply: string };

export const pingResult = (reply: string): PingResult => ({ reply });
