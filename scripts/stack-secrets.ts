// Usage: ESTA_SLOT=<n> node scripts/stack-secrets.ts. Prints the secret keys of the slot's local stack, one per line, so
// CI can mask them in the job log; exits 1 when the stack is not running. tools/ci/stack-keys.sh calls it.
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { secretValues, stackStatus } from './slot-env.ts';

const status = stackStatus(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
if (status === undefined) process.exit(1);
for (const value of secretValues(status)) console.log(value);
