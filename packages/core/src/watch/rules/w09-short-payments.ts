import { defineRule } from '../types';

/** A tenant whose last few invoices already due were each paid short of the share that counts as paid. */
export const w09ShortPayments = defineRule({
  id: 'W9',
  name: 'short payments',
  thresholds: { invoices: 2, paidBelowBp: 9_000 },
  repeat: 'daily',
  find: ({ asOf, leases, invoices }, { invoices: count, paidBelowBp }) => {
    const tenantOf = new Map(leases.flatMap((lease) => (lease.tenantId === null ? [] : [[lease.id, lease.tenantId] as const])));
    const byTenant = new Map<string, (typeof invoices)[number][]>();
    for (const invoice of invoices) {
      const tenantId = tenantOf.get(invoice.leaseId);
      if (tenantId !== undefined && invoice.dueDate < asOf) byTenant.set(tenantId, [...(byTenant.get(tenantId) ?? []), invoice]);
    }
    return [...byTenant].flatMap(([tenantId, due]) => {
      const last = due.toSorted((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, count);
      const short = last.every((invoice) => invoice.allocatedVnd * 10_000 < invoice.totalVnd * paidBelowBp);
      if (last.length < count || !short) return [];
      return [{ subjectKey: `party:${tenantId}`, severity: 'watch', numbers: { invoices: last.length, latest_due_date: last[0]?.dueDate ?? null } }];
    });
  },
});
