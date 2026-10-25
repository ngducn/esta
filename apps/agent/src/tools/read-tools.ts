import type { AgentDb } from '../supabase';
import type { ReadToolContext } from './ask-reads';
import { collectionsTool, portfolioOverviewTool } from './collections';
import { ledgerTool } from './ledger';
import { listLeasesTool, paymentBehaviorTool } from './leases';
import { listPropertiesTool } from './list-properties';
import { getPropertyTool, propertyMetricsTool } from './property-facts';
import { estaTool, type EstaTool } from './server';
import { taxPositionTool } from './tax-position';

/** The read tools of ask and weekly_review (AGENT.md §4), each bound to the household and citing into the run's sheet. */
export function readTools(db: AgentDb, householdId: string, { reads, locale, asOf, cite }: Omit<ReadToolContext, 'properties'>): Array<readonly [string, EstaTool]> {
  const properties = listPropertiesTool(db, householdId, cite);
  const context: ReadToolContext = { reads, locale, asOf, cite, properties: properties.records };
  return [
    estaTool('list_properties', properties.run),
    estaTool('portfolio_overview', portfolioOverviewTool(context)),
    estaTool('get_property', getPropertyTool(context)),
    estaTool('property_metrics', propertyMetricsTool(context)),
    estaTool('list_leases', listLeasesTool(context)),
    estaTool('collections', collectionsTool(context)),
    estaTool('ledger', ledgerTool(db, householdId, locale, properties.records, cite)),
    estaTool('tax_position', taxPositionTool(context)),
    estaTool('payment_behavior', paymentBehaviorTool(context)),
  ];
}
