import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { monthsUntil } from './dates';
import { roundHalfUpToMultiple } from './rounding';
import type { Escalation } from './types';

export const DEFAULT_ESCALATION_ROUNDING_VND: Vnd = vnd(100_000);

const BPS_PER_UNIT = 10_000;

/** How many escalation steps fall between the lease start and a period start. */
export function escalationSteps(escalation: Escalation, leaseStart: IsoDate, periodStart: IsoDate): number {
  if (escalation.kind === 'none') return 0;
  return Math.floor(monthsUntil(leaseStart, periodStart) / escalation.everyMonths);
}

/** Compounds `steps` escalation steps onto `rentVnd`, rounding half up to `roundingVnd` after each step. */
export function escalate(rentVnd: Vnd, escalation: Escalation, steps: number): Vnd {
  let rent = rentVnd;
  for (let step = 0; step < steps; step += 1) {
    switch (escalation.kind) {
      case 'none':
        return rent;
      case 'percent':
        rent = roundHalfUpToMultiple(rent * (BPS_PER_UNIT + escalation.valueBps), BPS_PER_UNIT, escalation.roundingVnd);
        break;
      case 'fixed':
        rent = roundHalfUpToMultiple(rent + escalation.valueVnd, 1, escalation.roundingVnd);
        break;
    }
  }
  return rent;
}

export function applyEscalation(rentVnd: Vnd, escalation: Escalation, periodStart: IsoDate, leaseStart: IsoDate): Vnd {
  return escalate(rentVnd, escalation, escalationSteps(escalation, leaseStart, periodStart));
}
