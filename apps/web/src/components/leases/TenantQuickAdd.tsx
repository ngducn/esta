'use client';

import { normalizePhone } from '@esta/core/phone';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { createTenant } from '@/server/actions/leases';
import type { Tenant } from '@/server/leases/load';
import { TextField } from '@/components/form-parts';
import { Button } from '@/components/ui/button';
import { FromContractMark } from './from-contract-mark';

type Invalid = 'name' | 'phone' | null;

/**
 * LSE-1: name and phone only, inside the lease form, so Mẹ never leaves the lease to add who rents. A tenant read from a
 * scanned contract opens it filled in, marked, and still waits for Mẹ to save it.
 */
export function TenantQuickAdd({
  onAdded,
  initial = null,
  mark = '',
}: {
  onAdded: (tenant: Tenant) => void;
  initial?: { readonly fullName: string; readonly phone: string | null } | null;
  mark?: string;
}) {
  const t = useTranslations('leases');
  const [open, setOpen] = useState(initial !== null);
  const [name, setName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [invalid, setInvalid] = useState<Invalid>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="outline" data-testid="add-tenant" className="self-start" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" />
        {t('addTenant')}
      </Button>
    );
  }

  const save = () => {
    setFailed(false);
    const wrong: Invalid = name.trim() === '' ? 'name' : normalizePhone(phone).ok ? null : 'phone';
    setInvalid(wrong);
    if (wrong !== null) return;
    startTransition(async () => {
      const result = await createTenant({ full_name: name, phone }).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (result.ok) {
        onAdded(result.tenant);
        setOpen(false);
        setName('');
        setPhone('');
        return;
      }
      if (result.reason === 'failed') setFailed(true);
      else setInvalid(result.reason);
    });
  };

  return (
    <div data-testid="tenant-quick-add" className="flex flex-col gap-4 rounded-md border border-rule bg-surface-2 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t('tenantName')} inputId="tenant-name" value={name} maxLength={200} error={invalid === 'name' ? t('tenantNameRequired') : null} onChange={setName} />
        <TextField
          label={t('tenantPhone')}
          hint={t('tenantPhoneHint')}
          inputId="tenant-phone"
          value={phone}
          maxLength={20}
          inputMode="numeric"
          className="figures"
          error={invalid === 'phone' ? t('tenantPhoneInvalid') : null}
          onChange={setPhone}
        />
      </div>
      {initial !== null && name === initial.fullName && phone === (initial.phone ?? '') ? <FromContractMark label={mark} /> : null}
      {failed ? (
        <p role="alert" className="text-small text-overdue">
          {t('tenantFailed')}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
        <Button type="button" variant="outline" disabled={pending} data-testid="save-tenant" onClick={save}>
          {pending ? t('savingTenant') : t('saveTenant')}
        </Button>
      </div>
    </div>
  );
}
