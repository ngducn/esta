import type { Clock } from '@esta/core';
import type { AgentDb } from '../supabase';
import { deliverPending } from './deliver';
import { smtpMailer, type DeliveryConfig } from './smtp';

export const DELIVERY_INTERVAL_MS = 60_000;

export type Delivery = { run(): Promise<void>; stop(): void };

/** Runs `deliverPending` on every tick and on demand; a run that starts while another is in flight joins it. */
export function startDelivery(db: AgentDb, config: DeliveryConfig, clock: () => Promise<Clock>, onError: (error: unknown) => void): Delivery {
  const mailer = smtpMailer(config.smtpUrl);
  let inFlight: Promise<void> | null = null;
  const run = () => {
    inFlight ??= clock()
      .then((current) => deliverPending(db, mailer, config, current))
      .then((sent) => {
        if (sent > 0) console.log(`[agent] sent ${sent} notices`);
      })
      .catch(onError)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  void run();
  const timer = setInterval(() => void run(), DELIVERY_INTERVAL_MS);
  return { run, stop: () => clearInterval(timer) };
}
