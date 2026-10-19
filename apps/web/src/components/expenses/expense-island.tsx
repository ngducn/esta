'use client';

import { PropertyIntl } from '@/components/properties/property-intl';
import type { ExpenseRequest, ExpenseScope } from './expense-host';
import { ExpenseSheet } from './expense-sheet';

export default function ExpenseIsland({
  scope,
  sheetKey,
  request,
  open,
  onOpenChange,
}: {
  scope: ExpenseScope;
  sheetKey: number;
  request: ExpenseRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <PropertyIntl locale={scope.locale} messages={scope.messages}>
      <ExpenseSheet key={sheetKey} scope={scope} request={request} open={open} onOpenChange={onOpenChange} />
    </PropertyIntl>
  );
}
