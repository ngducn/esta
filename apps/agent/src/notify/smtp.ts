import { createTransport } from 'nodemailer';

export type OutgoingMail = { readonly from: string; readonly to: string; readonly subject: string; readonly html: string; readonly text: string };
export type Mailer = { send(mail: OutgoingMail): Promise<void> };

/** How long a mail host may take to connect, greet or answer before a send fails, so a dead host costs seconds, not minutes. */
export const SMTP_TIMEOUT_MS = 10_000;

export function smtpMailer(smtpUrl: string, timeoutMs: number = SMTP_TIMEOUT_MS): Mailer {
  const transport = createTransport({ url: smtpUrl, connectionTimeout: timeoutMs, greetingTimeout: timeoutMs, socketTimeout: timeoutMs });
  return {
    async send(mail) {
      await transport.sendMail({ ...mail, encoding: 'utf-8' });
    },
  };
}

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

export type DeliveryConfig = { readonly smtpUrl: string; readonly appUrl: string; readonly from: string };

type DeliveryEnv = {
  readonly EMAIL_TRANSPORT: 'smtp';
  readonly SMTP_URL?: string | undefined;
  readonly ESTA_APP_URL?: string | undefined;
  readonly ESTA_EMAIL_FROM?: string | undefined;
  readonly ESTA_ENV?: string | undefined;
};

/**
 * Where notices go, or null when no sender is configured (the worker then sends none). Outside production only a local
 * SMTP host is accepted, so development mail reaches Inbucket and never a real address.
 */
export function deliveryConfig(env: DeliveryEnv): DeliveryConfig | null {
  if (env.SMTP_URL === undefined) return null;
  const production = env.ESTA_ENV === 'production';
  if (!production && !LOCAL_HOSTS.has(new URL(env.SMTP_URL).hostname)) {
    throw new Error(`Refusing to start delivery: SMTP_URL points at ${new URL(env.SMTP_URL).hostname}, and outside production only a local mailbox is allowed`);
  }
  if (env.ESTA_APP_URL === undefined) throw new Error('Refusing to start delivery: SMTP_URL is set but ESTA_APP_URL is not, so a notice would have no link');
  if (production && env.ESTA_EMAIL_FROM === undefined) throw new Error('Refusing to start delivery: production needs ESTA_EMAIL_FROM');
  return { smtpUrl: env.SMTP_URL, appUrl: env.ESTA_APP_URL, from: env.ESTA_EMAIL_FROM ?? 'Esta <esta@esta.localhost>' };
}
