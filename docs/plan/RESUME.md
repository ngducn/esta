# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom: 2026-10-30 retro, 2026-10-27 merge-and-stop);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-07 08:30 +07)

**Production is live** at https://esta-five.vercel.app (Ryan: "Yes, go live", 2026-11-07, which deferred the quality pass to later releases). Ryan is signed in; his household exists (he is admin and operator; one pending invite as `member`). Week 97%, resets 2026-11-07 11:00 +07: no agents until then.

**Cloud state.** Vercel project `esta` (ngducns-projects, Hobby): Root Directory `apps/web`, Node 24.x, function region `sin1` (project setting `resourceConfig.functionDefaultRegions`), no Git connection yet, 4 crons registered. Production deployment `dpl_ACas94xq9dxuBFTzAVJtRCN4CEcA` built from #517's head `0bc09766` (app code = main 21bd7dc8); `pnpm smoke https://esta-five.vercel.app` ok. Preview env holds esta-preview values; production env holds esta-prod values; both secrets typed by Ryan through scratch scripts. Supabase: `esta-preview` `qqrhsuhatxlabgansyhu` and `esta-prod` `labtkrcyedhavcwguotl` (both ap-southeast-1, free, 98 migrations each). esta-prod auth: site_url and callback for esta-five, otp 6, password 8, secure_password_change, MFA off; no email templates and no session timebox (free tier refuses both). esta-preview: no auth config push, no seed. One failed production deployment record `dpl_GCiHEXBAFWGSZKoAag2FAnCf46e4` from a bare `vercel deploy` (never served; deleting it is Ryan's call).

**Found while deploying (codify in a follow-up PR):** (1) Supabase CLI 2.90 does not expand `env(...)` in `[remotes.*] project_id`, so the remote blocks never match and the push shows 127.0.0.1; pushed from a scratch copy with literal refs. (2) A free project with the default sender rejects email templates (400) and `[auth.sessions]` (402); without templates every email carries a link and no code, and the app signs in, signs up and recovers only by code, so nobody can sign in by email until custom SMTP exists. Ryan's password was set through the SQL editor. (3) CLI deploys from the repo root ignored `vercel.json` `regions` until the project setting changed (in #517: smoke now checks the function region). (4) A bare `vercel deploy` targeted production (in #517: DEPLOY.md rule).

**Not working yet:** email codes (needs a sender: Gmail app password, Resend or Postmark, Ryan's choice; then push the templates), Trợ lý and nightly backups (the worker on Ryan's Mac, DEPLOY.md section 6, needs `claude setup-token`), the denied-function probe (section 12), each cron run once from the dashboard. Ryan asked why legacy JWT keys: switch both projects to `sb_publishable_`/`sb_secret_` keys, preview first, then disable legacy keys.

**Local app for Ryan:** slot 0, `pnpm dev` in Terminal tab c1 (localhost:3000), live worker in tab c3 (`ESTA_SLOT=0 ESTA_ENV=development ESTA_AGENT_SCHEDULE=off ESTA_MODEL_ROUTINE=claude-sonnet-5-5 ESTA_MODEL_DEEP=claude-opus-5-5 pnpm agent:dev`). Ryan's own pid 56207 is a 12-day-old replay worker on slot 5; leave it.

## Open items (state at 08:30 2026-11-07 +07)

- **#517 Vercel config** draft at 0bc09766 (moves vercel.json to apps/web, smoke checks the function region, DEPLOY.md rules); production runs this head. After the reset: independent reader, `gh pr ready 517`, wait-ci, merge.sh, then tag main and record the release. Then connect GitHub to the Vercel project (`git.deploymentEnabled.main` false keeps main from deploying itself).
- **Follow-up PR for the config-push findings** above: a script that renders the remote blocks with literal refs (or another fix), DEPLOY.md: custom SMTP before any sign-in on a free project, sessions need Pro.
- **#499 Q-03** draft at ff9cda93 (round 1 + root's two merges of main: filter moved to extraction-ops.ts:130 red/green on slot 8, migration renamed 20261007651200, TRASH_READERS un-exported). After the reset: scoped reader over round 1 and both merges, then `gh pr ready 499`, wait-ci, merge.sh.
- **#481 Q-17b** ready at 06818f33, ci green including db (root fixed #515 on its branch: cron test reads only CALLED_JOBS, red/green on slot 9). After the reset: scoped reader, update-branch, wait-ci, merge.sh.
- **#482 Q-12b** draft at e789d9e2 (r2: 6 e2e jobs, weighted shards, slowest 605 s; root merged main and re-recorded the direct-write raise 55->56). After the reset: Opus audit + lane (must explain the account-menu desktop flake on retry), ready, merge.
- **#464** Dependabot, unreviewed.
- **Flakes to fix first after the reset:** #513 (lease race 4-hex labels) and #508 (payments integration) both hit #500's db job.
- **Queue after the reset:** Q-04 legal tab (#202, #398, #189), Q-10b and lows #488-#516, Q-06, Q-07, Q-18, rest of Q-20, Q-14 squash, Q-15 docs, Q-02 formatter; [low] "no hint when no worker serves the slot" (Trợ lý waits forever). Then a live smoke on main, then production deploy with Ryan.
- **Merge path, slots, migrations:** merge.sh only; slots 3, 7, 8, 9, 14; next migration from bin/next-migration.sh (651200 taken by #499). `bin/ci-state.jq` reports PENDING while a ready run has not created its ci yet.

## Waiting for Ryan (defaults apply)

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

- The root merges on a clean independent verdict plus green ci at the exact head. Call `gh pr merge` directly. At most 2 reviewed PRs wait above main.
- Prototype first, live checks for each assistant slice, and Mẹ's session before more assistant features. Repeat findings become checks (owner-brief "Known defect classes"). The redesign's prototype is Ryan's artifact.
- Fix rounds are capped at 2. A language-rule change needs live English and Vietnamese probes that name real seed records.
- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject. Revised 2026-11-06 after #471: the guard never passes a number word through an idiom or phrase table, because three adversarial readers in a row found real counts passing each allowlist tried. False rejects are fixed on the model side (prompt style rule, a repair turn that names the rejected words), never by loosening the guard. Any guard change that rejects less gets an adversarial Opus reader.
- Each member reads only her own conversations and their audit rows. The operator does not either.

- 2026-11-06 evening: a new check is proven by putting back main's exact replaced lines and watching it fail (#500, #503). A closing test enters where the app enters, never through a helper fed an input the real caller cannot produce (#502 #326). A security definer function derives every row it writes from stored rows; its pgTAP names another household's id for every id parameter (#497). Owners never pick a migration number; root assigns one from `bin/next-migration.sh`. Owners may not add CI jobs or shards (main's job count is the ceiling).
- Root never pushes to a branch an agent writes. An Auto-fix conflict or CI event on such a PR goes to that agent by SendMessage.

## Budget

Week at 96% at 22:10 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard (raised by Ryan's x3 request): stop spawns at 96% (reached), pause owners at 98%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` reads the 5-hour window. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- Every PR that appends an item to the review checklist in verification-tiers.md conflicts with the next one that does (three times on 2026-11-06). Root resolves it docs-only by renumbering; whether GitHub honours `merge=union` in .gitattributes is unchecked.
- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
