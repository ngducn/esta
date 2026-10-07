# Resume notes for the Esta v1 run

Paused 2026-10-07 about 08:50 +07 on the operator's order (Claude usage running out). Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` (including its 08:40 update), `owner-brief.md`, `lane-brief.md` and the tail of `decisions.tsv` first.

## Where the stack is

- `main` holds P0-01 to P0-11, one squash commit per PR, each built from its verified head (P0-11's verified head 893d81a is byte-identical outside `docs/plan/`). Tip after the trail commit is `a468970` or later.
- P0-12 (base components) is PR #29, base `main`, branch `esta/p0-12-base-components`, paused at pushed head `d774bfa`. Done: lint fixes for #14 and #22, all base components, restyled primitives, the /dev/components registry, typecheck, 11 MoneyInput tests. Left: tests for DateInput, StatusMark, AddressBlock, DataTable, UndoToast; the six #27 token items with red tests; e2e/dev-components.spec.ts with axe; verify-skill lanes on slot 16; then design:detect, critique, perf, deslop, no-comments and ci-local. Worktree `.claude/worktrees/agent-ad05b1a4586edfa13`, trail `decisions.tsv` there (copy at /tmp/owner-p0-12/decisions.tsv).
- P0-11's round 1 swarm was stopped mid-run. Its design audit findings are filed as #27 (for P0-12) and #28 (for P0-14). Its lane worker did not finish; nothing else is pending for P0-11.
- Next PRs in order: finish P0-12, then P0-13 (domain composites), P0-14 (app shell), P0-15 (agent worker skeleton, uses spike S1), P0-16 (Phase 0 exit).

## How to work now

- GitHub Actions is disabled for the repo. CI is `tools/ci-local.sh <worktree> <pr> <slot>`, which posts `local-ci/*` statuses and a summary comment. Re-enable Actions with `gh api -X PUT repos/ngducn/esta/actions/permissions -F enabled=true` when minutes allow.
- Every new PR targets `main` once its parent is on `main`. The operator merges only PRs whose base is `main`.
- Round 1 per PR is one Sonnet worker (lanes, local CI, perf) plus one audit lane (Opus for security, money and data PRs). Later rounds are one Sonnet lane.
- Open follow-up issues carry the owning PR id in the title (`gh issue list --state open`).

## Rules learned during the run

- Migration versions `20261007<phase><two-digit PR><seq>00`, increasing in stack order.
- Docker has 8 GB shared with the `ekh-*` project; about 1 GB per Supabase stack; never touch `ekh-*`.
- Stop processes by recorded PID only, never `pkill` by pattern.
- Isolated gstack browse per lane via `BROWSE_STATE_FILE` and `BROWSE_PORT`.
- After a `supabase/config.toml` or `supabase/templates` change, or when switching a slot between checkouts, do a full `db:stop` then `db:start`.
- Temporary files go under `/tmp/owner-<pr>/`, not a shared scratchpad.

## Waiting for Ryan

See `docs/plan/STATUS.md` on `main`: the Supabase LAN exposure (security; macOS firewall recommended), the 500,000,000 VND transfer cap, the `Sổ cái` tagline wording, trusting the dev:lan CA on Mac and phone, and the PIT effective date that needs a professional.
