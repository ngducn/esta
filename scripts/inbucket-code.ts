import { parseArgs } from 'node:util';
import { z } from 'zod';
import { parseSlot, slotPorts } from './slot.ts';

export type Mailbox = { readonly api: string; readonly fetch?: typeof fetch; readonly timeoutMs?: number };

const searchResult = z.object({ messages: z.array(z.object({ ID: z.string(), Created: z.string() })) });
const message = z.object({ Subject: z.string(), Text: z.string(), HTML: z.string() });

export type Mail = z.infer<typeof message>;

const POLL_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;

export function slotMailbox(slot: number): Mailbox {
  return { api: `http://127.0.0.1:${slotPorts(slot).inbucket}/api/v1` };
}

function search(email: string): string {
  return new URLSearchParams({ query: `to:"${email}"` }).toString();
}

export function codeFromText(text: string, email: string): string {
  const codes = text.match(/\b\d{6}\b/g) ?? [];
  if (codes.length !== 1 || codes[0] === undefined) {
    throw new Error(`Expected one 6-digit code in the mail to ${email}, found ${codes.length}`);
  }
  return codes[0];
}

export async function clearMailbox(email: string, mailbox: Mailbox): Promise<void> {
  const response = await (mailbox.fetch ?? fetch)(`${mailbox.api}/search?${search(email)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Clearing the mailbox of ${email} failed: ${response.status}`);
}

async function newestId(email: string, mailbox: Mailbox): Promise<string | undefined> {
  const response = await (mailbox.fetch ?? fetch)(`${mailbox.api}/search?${search(email)}`);
  if (!response.ok) throw new Error(`Searching the mailbox of ${email} failed: ${response.status}`);
  const { messages } = searchResult.parse(await response.json());
  return messages.toSorted((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]?.ID;
}

export async function latestMail(email: string, mailbox: Mailbox): Promise<Mail> {
  const timeoutMs = mailbox.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let id = await newestId(email, mailbox);
  while (id === undefined) {
    if (Date.now() >= deadline) throw new Error(`No mail reached ${email} at ${mailbox.api} within ${timeoutMs / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    id = await newestId(email, mailbox);
  }
  const response = await (mailbox.fetch ?? fetch)(`${mailbox.api}/message/${id}`);
  return message.parse(await response.json());
}

export async function latestCode(email: string, mailbox: Mailbox): Promise<string> {
  return codeFromText((await latestMail(email, mailbox)).Text, email);
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { clear: { type: 'boolean' } } });
  const [email] = positionals;
  if (email === undefined || positionals.length !== 1) {
    console.error('Usage: node scripts/inbucket-code.ts <email> [--clear]');
    process.exit(2);
  }
  const mailbox = slotMailbox(parseSlot(process.env.ESTA_SLOT));
  try {
    if (values.clear) await clearMailbox(email, mailbox);
    else console.log(await latestCode(email, mailbox));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
