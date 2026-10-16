import { publicTable, type HouseholdSeed } from './context.ts';
import { householdId, userId } from './households.ts';
import { seedId } from './ids.ts';

const pingJobId = (household: HouseholdSeed) => seedId(`seed:agent-job:ping-${household.key}`);

/** One finished replay ping per household, so Ryan's run table is not empty. No heartbeat: a fresh reset reads `never`. */
export const agentJobs = publicTable('agent_jobs', ({ household, asOf }) => [
  {
    id: pingJobId(household),
    household_id: householdId(household),
    kind: 'ping',
    status: 'done',
    run_after: asOf,
    attempts: 1,
    locked_by: 'seed',
    locked_at: asOf,
    started_at: asOf,
    finished_at: asOf,
    result: { reply: `Kết nối với Esta hoạt động bình thường cho hộ gia đình "${household.name}".` },
    requested_by: userId('ryan', household),
  },
]);

export const agentRuns = publicTable('agent_runs', ({ household, asOf }) => [
  {
    id: seedId(`seed:agent-run:ping-${household.key}`),
    household_id: householdId(household),
    job_id: pingJobId(household),
    auth_mode: 'none',
    agent_mode: 'replay',
    model: 'claude-sonnet-5-5',
    num_turns: 2,
    cost_estimate_usd: 0,
    tool_calls: { mcp__esta__household_info: 1 },
    started_at: asOf,
    finished_at: asOf,
  },
]);
