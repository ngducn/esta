# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-07 16:40 +07)

**Production is live** at https://esta-five.vercel.app and in real use. Ryan is signed in (admin and operator); Mẹ's invite is still pending as `member`, and Ryan has not answered whether it should be admin. Email codes work: Gmail SMTP is saved in esta-prod and the otp and recovery templates are pushed (decisions.tsv `go-live-email-codes`).

**Family portfolio is loaded** through the esta-prod connector with Ryan's yes on each plan: properties, one owner_estimate valuation each as of 2026-11-07, and area cover photos (Wikimedia Commons, credit in each note) on all but a few. Real family data lives only in the session scratchpad and `~/.claude/orchestrate/esta/briefs/portfolio-load-prod.md`; never in the repo, the trail or a PR.

**Trợ lý runs on Ryan's Mac.** launchd job `vn.esta.agent`, clone `~/esta-worker` detached at tag `v2026-11-07-1` (a59c103a, #524), live mode, subscription auth, routine claude-sonnet-5-5, deep claude-opus-5-5, backups `~/Esta-backups`, log `~/Library/Logs/esta-agent.log`, heartbeat in `public.worker_heartbeats`. The worker moves only by `pnpm worker:update <tag>` in that clone, a production release that needs Ryan's yes (DEPLOY.md section 13). The 2026-11-08 06:00 scan is the first with the #524 window: check it kept news (research items dated 2026-11-08, no `research_scan_empty:2026-11-08`). The 07:00 brief is the first to cover the whole portfolio.

**Cloud state.** Vercel project `esta` (Hobby): Root Directory `apps/web`, region `sin1`, no Git connection, 4 crons. Web production is still `dpl_ACas94xq9dxuBFTzAVJtRCN4CEcA` from #517's head 0bc09766 (app code = 21bd7dc8). It lacks #518 and #520 (connector ops moved into `packages/ops`, no user-visible change) and #524 (agent only). Next web release after #517 merges. Supabase `esta-prod` `labtkrcyedhavcwguotl` and `esta-preview` `qqrhsuhatxlabgansyhu` (ap-southeast-1, free, 98 migrations; none since). `v2026-11-07-1` is the first release tag (worker only).

**Slowness check (11:35).** Ryan asked if free Supabase makes the app slow. Measured: no; page data loads in about 0.15 to 0.25 s from Singapore, and his connection was saturated by a game download. Signed-in page timing not done; offer it again if he raises speed.

**Found while deploying, still to codify (one follow-up PR):** (1) Supabase CLI 2.90 does not expand `env(...)` in `[remotes.*] project_id`, so config pushes need a scratch copy with literal refs. (2) A free project rejects email templates and `[auth.sessions]` without custom SMTP; DEPLOY.md must say SMTP comes before any sign-in. (3) and (4) are in #517.

## Open items (state at 16:40 2026-11-07 +07)

- **#517 Vercel config** draft at 0bc09766; production web runs this head. Next: independent reader, `gh pr ready 517`, `ci`, merge.sh, tag, web release with Ryan's yes, then connect GitHub to the Vercel project.
- **Config-push follow-up PR** for findings (1) and (2) above.
- **Keys:** move both Supabase projects to `sb_publishable_`/`sb_secret_` keys, preview first, then disable the legacy JWT keys (Ryan asked).
- **DEPLOY section 12** denied-function probe against esta-preview, and each cron run once from the dashboard.
- **#499 Q-03** draft at a7a23670 (conflict with #518's ops exports resolved). Next: scoped reader over round 1 and the merges, ready, `ci`, merge.sh.
- **#481 Q-17b** ready at 06818f33. Next: scoped reader, update-branch, `ci`, merge.sh.
- **#482 Q-12b** draft at e789d9e2. Next: Opus audit plus lane (explain the account-menu desktop flake), ready, merge.
- **#464** Dependabot, unreviewed.
- **Lows:** flakes #513 and #508 first, then #519, #521, #522; then the queue (Q-04 legal tab, Q-10b, Q-06, Q-07, Q-18, Q-20, Q-14, Q-15, Q-02).
- **Merge path, slots, migrations:** merge.sh only (third argument is the squash subject; it appends the PR number); slots 3, 7, 8, 9, 14; next migration from `bin/next-migration.sh`.

## Waiting for Ryan (defaults apply)

0. Mẹ's role: her invite is `member`; CLAUDE.md lists her as admin. Default: leave it until Ryan says.
1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Kept as built for now.
5. P5-13 chips come from open notes of any day, an [app rule].
6. Redesign questions with defaults: keep Inter Display on /sign-in despite ~150 ms LCP; logo twice on desktop sign-in (#379); "Cần chú ý" = rent overdue or due today on any property (alternatives: Tổng quan's list, or the design set with expiring contracts and overdue tax); Tài sản chip rows stay open on desktop (or fold behind "Bộ lọc").
7. The redesign defaults in `docs/plan/redesign-2026-11.md`: Esta blue, role-name codemod, Thoáng/Gọn, wordmark, icon-and-word status, the new shell. Ryan can overrule any in a sentence.

8. Retitle the 28 not-low issues in the quality ledger to `[pre-deploy]`? Root's `gh issue edit` is blocked by permissions; default: the ledger table in quality-2026-11.md is the list.
9. A bare percent with no period ("lãi 9%"): today Hỏi asks for the yearly rate. Default stays; Ryan can say "treat a bare percent as yearly".
11. After the connector signs out, a copied access token can still read data until it expires (default 3600 s); the refresh token and every connector tool call stop at once. Default: document the window. Options: a shorter JWT expiry on the cloud project (15 minutes, set at deploy), or an RLS check that the token's session still exists (a lookup per query).
10. Defaults adopted from the #450 audit for the Q-17b follow-up: #204 refuse a length written with dot or space grouping (ask to retype "4,5"); #364 a leading Vietnamese imperative (Gửi, Nhắc, Xem) decides the reply language and record names do not count.

12. #471 number guard: stay strict (default) with 2 false rejects left in the live probe (the model still writes "Hai bên mang theo" and "cả hai" despite the style rule; each costs Mẹ a repair turn), or accept a looser guard. Three adversarial readers found real counts passing every loosening tried.
13. Offsite backup copy (Q-13): which destination; no service is added until Ryan names one.
14. #364 reply language: answer in each member's app language and switch only when a whole message is clearly the other language (recommended), or keep guessing from each message (today). Asked 2026-11-06 21:00; no answer yet, so today's behaviour stays.

Ruled 2026-11-02: Thu tiền "Đã thu" counts payments toward this month's rent, as Tổng quan does (Ryan: "Yes, match Tổng quan").

## Rules added this session

- **Lean rules, 2026-11-02** (Ryan: "Yes, apply all"). Owners and fix rounds on Sonnet for every tier; Opus only for the rigorous audit. Owners read narrowly (no poteto-mode, playbooks or standing orders), prove with `pnpm check`, touched specs and two to four screenshots, wait for CI once and stop at code-ready. Rigorous review is the Opus audit plus a Sonnet live lane; one fix round, a second only for wrong money. Briefs follow `~/.claude/orchestrate/esta/briefs/_template-owner.md` and name the existing home of every figure. Root posts status only at verdicts, merges and blocks. Full text: standing orders 2026-11-02, verification-tiers.md.

- Briefs say "Spawn no subagents, except the comment-sicko that /no-comments runs". Three owners skipped or hand-ran /no-comments because the blanket ban covered the skill's own subagent.

- The root merges on a clean independent verdict plus green ci at the exact head. Merge only through `~/.claude/orchestrate/esta/bin/merge.sh`. At most 2 reviewed PRs wait above main.
- Prototype first, live checks for each assistant slice, and Mẹ's session before more assistant features. Repeat findings become checks (owner-brief "Known defect classes"). The redesign's prototype is Ryan's artifact.
- Fix rounds are capped at 2. A language-rule change needs live English and Vietnamese probes that name real seed records.
- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject. Revised 2026-11-06 after #471: the guard never passes a number word through an idiom or phrase table, because three adversarial readers in a row found real counts passing each allowlist tried. False rejects are fixed on the model side (prompt style rule, a repair turn that names the rejected words), never by loosening the guard. Any guard change that rejects less gets an adversarial Opus reader.
- Each member reads only her own conversations and their audit rows. The operator does not either.

- 2026-11-06 evening: a new check is proven by putting back main's exact replaced lines and watching it fail (#500, #503). A closing test enters where the app enters, never through a helper fed an input the real caller cannot produce (#502 #326). A security definer function derives every row it writes from stored rows; its pgTAP names another household's id for every id parameter (#497). Owners never pick a migration number; root assigns one from `bin/next-migration.sh`. Owners may not add CI jobs or shards (main's job count is the ceiling).
- Root never pushes to a branch an agent writes. An Auto-fix conflict or CI event on such a PR goes to that agent by SendMessage.
- 2026-11-07: a code-writing side session gets its own worktree (`use_worktree: true`). One that shared the root checkout fast-forwarded local `main` onto an unmerged branch while the prod connector ran from it.
- 2026-11-07: a production release is a tag on `main` plus Ryan's yes; the worker moves only by `pnpm worker:update <tag>`. Merging a PR does not reach the 06:00 jobs.
- 2026-11-07: before committing `decisions.tsv` or RESUME.md, read every new row for real family data (place names, counts, amounts, property codes) and rewrite it generically. Today's portfolio rows held all four and were scrubbed before the commit; the handoff skill's step 5 now says so.

## Budget

New week since 2026-11-07 11:00 +07: 2% used at 16:40, resets 2026-11-14 11:00 +07. Read it with `mcp__ccd_session_mgmt__get_usage`. The 08:43 trail row records Ryan's cap at 60% (stop spawns at 48%, pause at 55%); confirm with Ryan whether it holds this week before a large fan-out.

## Gotchas

- `agent_jobs` has `error`, not `last_error`. Supabase `execute_sql` returns only the last statement's rows.
- The scratch MCP client (`scratchpad/esta-mcp.mjs`) needs the 10-minute request timeout; at 60 s a long `apply_plan` kept running orphaned, and re-apply answered `already_applied`.
- A same-day rerun of a brief, digest or empty-scan note adds nothing (`agent_items` dedupe on `household_id,dedupe_key`); research_scan is capped at 2 runs a day.
- Every PR that appends to the review checklist in verification-tiers.md conflicts with the next one that does. Root resolves it docs-only by renumbering.
- zsh reads `$var:r` in a refspec as a modifier, and an unquoted `--include=*.ts` as a glob. Quote both.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 unless the shell sets it.
