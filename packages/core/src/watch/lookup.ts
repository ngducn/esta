import type { WatchSnapshot } from './types';

/** The snapshot without archived properties and what hangs off them; a document or reading of no property stays. */
export function liveSnapshot(snapshot: WatchSnapshot): WatchSnapshot {
  const live = new Set(snapshot.properties.flatMap((property) => (property.archived ? [] : [property.id])));
  const units = snapshot.units.filter((unit) => live.has(unit.propertyId));
  const unitIds = new Set(units.map((unit) => unit.id));
  const leases = snapshot.leases.filter((lease) => live.has(lease.propertyId));
  const leaseIds = new Set(leases.map((lease) => lease.id));
  const onLive = (propertyId: string | null) => propertyId === null || live.has(propertyId);
  return {
    ...snapshot,
    properties: snapshot.properties.filter((property) => live.has(property.id)),
    units,
    leases,
    invoices: snapshot.invoices.filter((invoice) => leaseIds.has(invoice.leaseId)),
    documents: snapshot.documents.filter((document) => onLive(document.propertyId)),
    meters: snapshot.meters.filter((meter) => unitIds.has(meter.unitId)),
    extractions: snapshot.extractions.filter((extraction) => onLive(extraction.propertyId)),
  };
}
