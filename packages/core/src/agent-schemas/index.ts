import { certificateV1Schema } from './certificate_v1';
import { leaseV1Schema } from './lease_v1';
import { utilityBillV1Schema } from './utility_bill_v1';

export { certificateV1Schema, type CertificateV1 } from './certificate_v1';
export { leaseV1Schema, type LeaseV1 } from './lease_v1';
export { reduceNationalIds } from './reduce-national-ids';
export { utilityBillV1Schema, type UtilityBillV1 } from './utility_bill_v1';

/**
 * Every extraction schema the worker validates against, by the name `document_extractions.schema_name` stores. The
 * version is part of the replay input hash (AGENT.md §8), so a schema change that bumps it needs new recordings.
 */
export const AGENT_SCHEMAS = {
  certificate_v1: { schema: certificateV1Schema, version: 1 },
  utility_bill_v1: { schema: utilityBillV1Schema, version: 1 },
  lease_v1: { schema: leaseV1Schema, version: 1 },
} as const;

export type AgentSchemaName = keyof typeof AGENT_SCHEMAS;

export function isAgentSchemaName(name: string): name is AgentSchemaName {
  return Object.hasOwn(AGENT_SCHEMAS, name);
}
