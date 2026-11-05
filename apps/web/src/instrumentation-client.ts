import { config } from 'zod/v4/core';

// Next runs this file in the browser before any other client module, so it is the one place that precedes every schema
// the bundle builds. zod's compiled fast path probes `new Function("")`, which the CSP refuses: the probe is caught but
// raises a violation report on every page open. The server has no CSP and keeps the fast path.
config({ jitless: true });
