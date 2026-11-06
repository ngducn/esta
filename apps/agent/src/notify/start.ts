import type { Clock } from '@esta/core';
import type { AgentDb } from '../supabase';
import { deliverPending } from './deliver';
import { smtpMailer, type DeliveryConfig, type Mailer } from './smtp';

export const DELIVERY_INTERVAL_MS = 60_000;

export type Delivery = {
  /** Asks for a delivery run and returns at once; a request made during a run triggers one more run when it ends. */
  nudge(): void;
  /** Resolves when no run is in flight (for tests). */
  settled(): Promise<void>;
  stop(): void;
};

/**
 * Runs `deliverPending` on its own schedule: every tick, and again when a job's end nudges it. The caller never waits on
 * a run, so a slow mail host cannot hold up the jobs.
 */
export function startDelivery(db: AgentDb, config: DeliveryConfig, clock: () => Promise<Clock>, onError: (error: unknown) => void, mailer: Mailer = smtpMailer(config.smtpUrl)): Delivery {
  let inFlight: Promise<void> | null = null;
  let again = false;
  const nudge = () => {
    if (inFlight !== null) {
      again = true;
      return;
    }
    inFlight = clock()
      .then((current) => deliverPending(db, mailer, config, current))
      .then((sent) => {
        if (sent > 0) console.log(`[agent] sent ${sent} notices`);
      })
      .catch(onError)
      .finally(() => {
        inFlight = null;
        if (again) {
          again = false;
          nudge();
        }
      });
  };
  nudge();
  const timer = setInterval(() => {
    if (inFlight === null) nudge();
  }, DELIVERY_INTERVAL_MS);
  return { nudge, settled: async () => { while (inFlight !== null) await inFlight; }, stop: () => clearInterval(timer) };
}
