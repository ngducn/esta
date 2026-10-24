import { w01Overdue } from './rules/w01-overdue';
import { w02DueSoon } from './rules/w02-due-soon';
import { w03LeaseEnding } from './rules/w03-lease-ending';
import { w04Vacancy } from './rules/w04-vacancy';
import { w05DocumentExpiry } from './rules/w05-document-expiry';
import { w06DepositUnsettled } from './rules/w06-deposit-unsettled';
import { w07TaxThreshold } from './rules/w07-tax-threshold';
import { w08MeterReadingsMissing } from './rules/w08-meter-readings-missing';
import { w09ShortPayments } from './rules/w09-short-payments';
import { w10ExtractionWaiting } from './rules/w10-extraction-waiting';
import { w11LowCompleteness } from './rules/w11-low-completeness';
import type { WatchFact, WatchRule, WatchSnapshot } from './types';

/** AGENT.md §5.3, in rule order. */
export const WATCH_RULES: readonly WatchRule[] = [
  w01Overdue,
  w02DueSoon,
  w03LeaseEnding,
  w04Vacancy,
  w05DocumentExpiry,
  w06DepositUnsettled,
  w07TaxThreshold,
  w08MeterReadingsMissing,
  w09ShortPayments,
  w10ExtractionWaiting,
  w11LowCompleteness,
];

/** Every rule's facts on the snapshot's date, in rule order and then by subject, so two runs list them alike. */
export function evaluateWatch(snapshot: WatchSnapshot): WatchFact[] {
  return WATCH_RULES.flatMap((rule) => rule.evaluate(snapshot).toSorted((a, b) => a.subjectKey.localeCompare(b.subjectKey)));
}

/**
 * The key that keeps an `action` fact to one item per period: the day for most rules, the tax year for W7, so the owner
 * hears that the threshold is reached once a year and not every morning after.
 */
export function watchDedupeKey(fact: Pick<WatchFact, 'ruleId' | 'subjectKey'>, asOf: WatchSnapshot['asOf']): string {
  const rule = WATCH_RULES.find((entry) => entry.id === fact.ruleId);
  return `watch:${fact.ruleId}:${fact.subjectKey}:${rule?.repeat === 'yearly' ? asOf.slice(0, 4) : asOf}`;
}
