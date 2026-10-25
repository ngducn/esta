'use client';

import type { NewParty } from '@esta/core/schemas/party';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { saveLegalItem } from '@/app/(app)/properties/[id]/legal/actions';
import { useFocusAnchor } from '@/components/completeness/use-focus-anchor';
import { FormAlert } from '@/components/form-alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAction } from '@/components/use-action';
import { useHydrated } from '@/lib/use-hydrated';
import type { LegalKind } from '@esta/ops';

export type LegalSubmit = () => Record<string, unknown> | null;

/**
 * Submits through `saveLegalItem`, which parses the input again with the kind's schema, and returns to the tab.
 * Controlled fields would drop what is typed before React hydrates, so nothing takes input until then.
 */
export function LegalFormShell({
  propertyId,
  kind,
  itemId,
  read,
  newParties,
  children,
}: {
  propertyId: string;
  kind: LegalKind;
  itemId: string | null;
  read: LegalSubmit;
  /** The quick-added parties the read input names, created in the same request as the save. */
  newParties?: () => readonly NewParty[];
  children: ReactNode;
}) {
  const t = useTranslations('propertyLegal');
  const router = useRouter();
  const hydrated = useHydrated();
  useFocusAnchor(hydrated);
  const { pending, run } = useAction();
  const [error, setError] = useState<'invalid' | 'network' | null>(null);
  const tabHref = `/properties/${propertyId}/legal`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = read();
    if (input === null) {
      setError('invalid');
      return;
    }
    setError(null);
    run(
      () => saveLegalItem(propertyId, kind, itemId, input, newParties?.() ?? []),
      (result) => {
        if (result.ok) {
          router.push(tabHref);
          return;
        }
        setError(result.reason === 'invalid' ? 'invalid' : 'network');
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-5" data-testid={`${kind}-form`}>
      <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-5">
        {hydrated ? null : (
          <p role="status" data-testid="form-loading" className="text-body text-ink-muted">
            {t('formLoading')}
          </p>
        )}
        {children}
        <div className="flex flex-col gap-3">
          <FormAlert message={error === null ? null : error === 'invalid' ? t('errorInvalid') : t('errorNetwork')} data-testid="form-error" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending} data-testid="save-legal-item">
              {pending ? t('saving') : t('save')}
            </Button>
            <Link href={tabHref} className={buttonVariants({ variant: 'outline' })}>
              {t('cancel')}
            </Link>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
