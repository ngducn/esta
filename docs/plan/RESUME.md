# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom: 2026-10-30 retro, 2026-10-27 merge-and-stop);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-06 21:35 +07)

The quality pass before the first production deploy, run by root with owners, fix rounds, Opus audits, Sonnet lanes and scoped readers. Every PR merges through merge.sh on an independent verdict plus green ci.

**Since the 20:30 handoff:** #486 (cron runs, operator stale/failed line, production deploys only from a tag) and #498 (a lease change cannot start inside a voided bill) merged. Lows filed: #508 (payments integration flake), #509 (guard rejects link text that repeats its address), #510 (type-aware untyped-action lint), #511 (Trợ lý tells Mẹ about its tool retry), #512 (assistant-limits spec leaves a notice), #513 (lease race test label collision, ~1.2% a run), #514 (diagnostics table cut off at 390). #364 got the #501 audit's cases and a decision for Ryan.

## Open items (state at 21:35 2026-11-06 +07; week 95%, resets 2026-11-07 11:00 +07)

- **Ryan 2026-11-06:** "merge them and finish the project"; "push it through the last bit"; "i want the code quality so high and pristine that follow up AI agents can pickup the practice"; "everything you find as issue, be sure to codify it in some way"; "yeah" to finishing the quality pass before the first production deploy; "we need to at least x3 the throughput to go through the usage before tmr reset"; "option 1 and 2 to maximize CI savings pls" (#506). Guard: stop spawns at 96% of the week, pause owners at 98%. He ran /pstack:automate-me, skipped its questions, then said "lets just discuss what u would have made with out actually make it": the ryan-mode draft was shown in chat only; nothing was written.
- **Merge path:** `~/.claude/orchestrate/esta/bin/merge.sh <pr> <full sha> "<squash subject for the final head>"`. It refuses a wrong head, a draft, ci not SUCCESS (read through `bin/ci-state.jq`: the newest ci at the head that was not cancelled), no `## Codified`, a migration not sorting after main's newest, and a PR whose ci started before main gained code (then `gh pr update-branch <pr>` only when no agent writes the branch).
- **#506 CI speed-up:** reader CLEAN; updated to db824818 after #498; root's wait-ci runs in the background, then merge.sh. After it merges: owner briefs say draft while working, `gh pr ready <n>` before wait-ci, `gh pr ready --undo` at the start of a fix round; add a review-checklist line in verification-tiers.md (a merge needs ci=success, not "not failed") once no open PR touches that file (#497 and #502 do now).
- **#502 C19:** round 1 b1991c69 ci green (all 3 audit blockers fixed; lane confirmed #361 #317 #327 end to end). Scoped reader ac2cf6c1075549a2c (briefs/pr502-ff1-reader.md), then merge.sh.
- **#497 Q-05:** round 1 a44b9c6e2e53164e4 on slot 14 (briefs/q-05-ff1.md plus root's messages: cross-household cases for every id inside p_steps; CI db red at 86524502 on accept_extraction tests 5 and 13; merge main). Lane CLEAN at ffda08d6. Then a scoped reader on the security fix, then merge.sh.
- **#499 Q-03:** audit ISSUES (completeness view, utility bill acceptance and the wizard count trashed rows). First owner stopped; round 1 a9b801a1c3540d532 (briefs/q-03-ff1.md plus the label-taken undo message) with slot 8. It builds the `soft-delete-read` metric and carries the utility-bill filter (in SQL if #497 lands first). Lane no blocker. Then a scoped reader, then merge.sh. #202 and #398 go to Q-04.
- **#501 guard:** audit: guard CLEAN, language rule regressed English commands. Round 1 a30a49b08181cd7c3 (briefs/q-guard-496-ff1.md) ships the guard alone, reverts the language rule, corrects the live counts (at least 4 of 26 false rejects), links #509. Then a scoped reader, then merge.sh. #364 stays open for Ryan's decision.
- **#500 Q-10a:** round 1 a7fa605ebb815121c (briefs/q-10a-ff1.md: the two checks must fail on the code they replaced) plus merging main after #486. Then a scoped reader and a lane, then merge.sh.
- **#481 Q-17b:** round 2 a825a78695648e081 on slot 9 (generator in scripts/ with drift test, ID-label 9 to 12 digit rule, date-shaped fuzz family, Unicode 16 residual in STATUS.md and the PR body, migration renamed to 20261007650000). Then a scoped reader, then merge.sh.
- **#482 Q-12b:** round 2 a69bd7387c4aed5e6 on slot 3. morning-brief fails in clock-1 after fnd9-integration; reproduce in CI's shard order and fix the leaking side; rebalance (slowest 676 s against 675); migration renamed to 20261007649000; db red at 79bf87df was #513, not this PR. Then Opus audit + lane, then merge.sh.
- **Migration numbers in flight:** #499 647000, #497 648000, #482 649000, #481 650000. New ones come from `bin/next-migration.sh`.
- **#464**: Dependabot npm-weekly bump, unreviewed.
- **Queue:** Q-04 legal tab after Q-03 (reuses its undo home, takes #202 and #398, flips `direct-write` to a hard rule at 0); Q-10b rule-copy issues and the low backlog (#488 to #514); Q-06, Q-07, Q-18, rest of Q-20, Q-14 squash (last before the first db push), Q-15 docs, Q-02 formatter last; #477 label. Pre-deploy: one live smoke on merged main (re-measure T7 50.2 s). Then the deploy plan with options for Ryan.
- **Ryan deploy gate:** run `pnpm probe:denied-functions` against the preview project (DEPLOY.md section 12). #82 and #128 stay open until then.
- **Slots:** usable 3, 7, 8, 9, 14; never 1, 2, 4, 5, 6. Now 3 #482, 8 #499 r1, 9 #481, 14 #497, 7 free. Docker 7.8 GB holds about six stacks. Owners without a slot ask root and end their turn. A slot whose holder stopped its stack and sits in wait-ci goes to the next owner in line. pid 56207 is Ryan's. Machine load reaches about 45 with four stacks; tests with tight timeouts fail under it and pass alone.
- **Waiting agents:** "waiting on its own background work" is fine when the work is wait-ci.sh, heavy.sh, a stack start, a build or the guard probe; stop only a polling loop, by PID.

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

Week at 95% at 21:35 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard (raised by Ryan's x3 request): stop spawns at 96%, pause owners at 98%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` reads the 5-hour window. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
