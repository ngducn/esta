'use client';

import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/form-parts';
import { useBillAction } from '@/components/invoices/use-bill-action';
import { Button } from '@/components/ui/button';
import { renameHousehold, type MemberActionRefusal } from '@/server/actions/members';
import type { Refusals } from './member-refusals';

export type HouseholdNameLabels = { readonly name: string; readonly save: string; readonly saving: string; readonly refusals: Refusals };

export function HouseholdNameForm({ name, labels }: { name: string; labels: HouseholdNameLabels }) {
  const [text, setText] = useState(name);
  const { refusal, setRefusal, pending, run } = useBillAction<MemberActionRefusal>();
  const unchanged = text.trim() === name;
  return (
    <form
      className="flex max-w-prose flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => renameHousehold({ name: text }));
      }}
    >
      <TextField
        label={labels.name}
        value={text}
        onChange={(value) => {
          setText(value);
          setRefusal(null);
        }}
        error={null}
        testId="household-name"
        maxLength={120}
      />
      <FormAlert message={refusal === null ? null : labels.refusals[refusal]} data-testid="household-error" />
      <Button type="submit" variant="primary" className="self-start" data-testid="household-save" disabled={pending || unchanged || text.trim() === ''}>
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
