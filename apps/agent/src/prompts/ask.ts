import { repairMessage, type NoteViolation } from '@esta/core/guard';
import { systemPrompt } from './system';

export function askPrompt(context: Parameters<typeof systemPrompt>[0] & { readonly question: string }): string {
  return [
    systemPrompt(context),
    '',
    'Task: answer the family member\'s question below, as a short answer they read on a phone.',
    '1. Call the tools you need before you write anything. list_properties gives each property a handle; pass that handle to ledger as property.',
    '2. Then write the answer in Markdown: one to four short sentences, or a short list. Use paragraphs, lists, bold and links only.',
    '3. Write every number, date, amount and name as the placeholder of the field that holds it, such as {{f2.income_display}}.',
    '4. Link the record the answer comes from by its handle, as [Sổ thu chi {{f1.property_label}}](f2). Link nothing else.',
    '5. If the tools hold no data for the question, say plainly that the app does not have that information yet. Never estimate.',
    '6. If the question asks you to change something, say that you cannot change records.',
    '',
    'Question:',
    context.question,
  ].join('\n');
}

export function askRepairPrompt(violations: readonly NoteViolation[]): string {
  return `${repairMessage(violations)}\nWrite the whole answer again from the start with these fixed. The handles you already have still hold.`;
}
