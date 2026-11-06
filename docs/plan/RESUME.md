# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom: 2026-10-30 retro, 2026-10-27 merge-and-stop);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-01 21:45 +07; open items refreshed 2026-11-06 16:45)

Ryan restarted the run with two asks on 2026-11-01: "https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg --> i redesigned Esta, please implement the UI revamp" and "also check current progress, please help continue the work".

**Since the last handoff:**
- #358 (P5-16a) and #360 (P5-16c) merged on 2026-10-30.
- The redesign is planned in `docs/plan/redesign-2026-11.md` (b2def8a7): six slices, RD-1 to RD-6, with its defaults listed under "Decisions taken as defaults".
- #365's fix round 1 had never pushed. The previous owner stopped after merging main locally (840b881e in `/tmp/owner-data-trust-a/wt`). A fresh owner took it over.

## Open items (state at 19:10 2026-11-06 +07; week 90%, resets 2026-11-07 11:00 +07)

- **Ryan 2026-11-06:** "merge them and finish the project"; "push it through the last bit"; "i want the code quality so high and pristine that follow up AI agents can pickup the practice"; "everything you find as issue, be sure to codify it in some way"; "yeah" to finishing the quality pass before the first production deploy; "Yes, convert it" (monthly rate to yearly); "we need to at least x3 the throughput to go through the usage before tmr reset, so spawn parallel agents and really rigorously complete the job". Guard: stop spawns at 96% of the week, pause owners at 98%.
- **Codify rule live:** CLAUDE.md "Codify every finding", owner-brief steps 3a, 6 and 7, verification-tiers checklist, standing orders 2026-11-06. Merge only with `~/.claude/orchestrate/esta/bin/merge.sh <pr> <full sha>`; it now also refuses a new migration that does not sort after main's newest and a PR whose ci started before main gained code (update with `gh pr update-branch <pr>` only when no agent writes the branch). Agents wait with `wait-ci.sh [--after-rerun] <pr> <sha>` in the foreground (one watcher per PR, a lock). Agents still leave polling loops (`pgrep -f wait-ci.sh` loops match other agents' watchers): on every "waiting on its own background work" notice, TaskStop and kill leftovers by PID; `_common-quality-owner.md` now forbids such loops.
- **Merged today:** #438, #434, #444, #446, #439, #448, #456, #449, #465, #458, #470, #450, #469, #455, #460, #451, then #479 (hotfix for red main after crossed merges), #467 (Q-20b function grants and probe), #475 (Q-09b allocation vectors), #453 (Q-19a lease and bill invariants). Lows filed through #485 (#480 probe lookalike hosts, #483 db reset gateway 502, #485 lint rule forms).
- **#471 P5-10d number guard**, root changed approach after three adversarial verdicts each found real counts passing an idiom allowlist: the guard no longer recognises idioms (judges every number word as main does); the prompt steers the model off `hai bên`, `ba mẹ`, `cả hai`; the repair turn names the rejected words. Round 3 live probe: 12 first-pass, 3 repair rejects, 2 false rejects left, pass bar not met (STATUS deviation; Ryan asked, default strict). Round 3 reader found one last loosening (the `phần trăm` noun pass, `một<br>phần trăm`); round 4 running (briefs/p5-10d-ff4.md) removes it and pins never-looser-than-main. Then a tiny reader, update-branch, merge.sh. db job at 0b4153d6 re-run for the export flake.
- **#481 Q-17b** (6b87c27f): Opus audit ISSUES (money rule copied into SQL lets IDs through; SQL fold order); lane clean (its typed-ID finding is D11 "Store as typed"). Round 1 running (briefs/q-17b-ff1.md), asks root for a slot for pgTAP. Then scoped reader, merge.sh.
- **#487 flaky db job** (owner on slot 9, briefs/flake-roundtrip.md): the export round trip's `order by id limit 1` sometimes picks a user-owned photo the connector test leaves; moving it trips `private.refuse_registered_document_write` (shown as an RLS error). Review on report; until it merges, re-run a `db` job that fails only there (`gh run rerun <id> --failed` once the run completes).
- **Owners running:** Q-12b #482 (slot 8, briefs/q-12b.md), Q-13 #486 (slot 3, briefs/q-13.md; will ask Ryan for the offsite backup destination), Q-08 #484 (no slot, asks root; briefs/q-08.md). Each gets an Opus audit plus lane if verify:tier says rigorous, else a review.
- **#468** (on main): voiding a bill then amending a lease to quarterly never bills December and January. Money; fix before deploy; owner not yet spawned (needs a slot).
- **#464**: Dependabot npm-weekly bump, unreviewed.
- **Queue:** #468; C19 golden cases and #364 after #471; #477 label; later waves Q-03/04/05, Q-06, Q-07, Q-10, Q-14 squash (last before the first db push), Q-18, rest of Q-20, Q-15 docs, Q-02 formatter last. Pre-deploy: one live smoke on merged main (re-measure T7 50.2 s).
- **Ryan deploy gate:** #467 merged, so run `pnpm probe:denied-functions` against the preview project (DEPLOY.md section 12). #82 and #128 stay open until then.
- **Slots:** usable 3, 7, 8, 9, 14; never 1, 2, 4, 5, 6 (1 and 2 run stacks of another session). Docker 7.8 GB holds about six stacks; check `docker stats` before adding one. pid 56207 is Ryan's. Owners without a slot ask root through SendMessage and end their turn.

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

## Budget

Week at 78% at 12:50 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard for "finish the project": stop spawns at 90%, pause owners at 95%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` under-reads. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
