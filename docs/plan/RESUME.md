# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom: 2026-10-30 retro, 2026-10-27 merge-and-stop);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-01 21:45 +07; open items refreshed 2026-11-06 20:30)

Ryan restarted the run with two asks on 2026-11-01: "https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg --> i redesigned Esta, please implement the UI revamp" and "also check current progress, please help continue the work".

**Since the last handoff:**
- #358 (P5-16a) and #360 (P5-16c) merged on 2026-10-30.
- The redesign is planned in `docs/plan/redesign-2026-11.md` (b2def8a7): six slices, RD-1 to RD-6, with its defaults listed under "Decisions taken as defaults".
- #365's fix round 1 had never pushed. The previous owner stopped after merging main locally (840b881e in `/tmp/owner-data-trust-a/wt`). A fresh owner took it over.

## Open items (state at 20:30 2026-11-06 +07; week 93%, resets 2026-11-07 11:00 +07)

- **Ryan 2026-11-06:** "merge them and finish the project"; "push it through the last bit"; "i want the code quality so high and pristine that follow up AI agents can pickup the practice"; "everything you find as issue, be sure to codify it in some way"; "yeah" to finishing the quality pass before the first production deploy; "Yes, convert it" (monthly rate to yearly); "we need to at least x3 the throughput to go through the usage before tmr reset, so spawn parallel agents and really rigorously complete the job". Guard: stop spawns at 96% of the week, pause owners at 98%.
- **Merge path:** `~/.claude/orchestrate/esta/bin/merge.sh <pr> <full sha> "<squash subject for the final head>"`. It refuses a wrong head, ci not SUCCESS, no `## Codified`, a migration not sorting after main's newest, and a PR whose ci started before main gained code (then `gh pr update-branch <pr>` only when no agent writes the branch). The subject argument exists because #471's squash (946a793d) kept its round 1 title, the opposite of the merged strict guard.
- **Merged today:** #438, #434, #444, #446, #439, #448, #456, #449, #465, #458, #470, #450, #469, #455, #460, #451, #479, #467, #475, #453, #487 (export round-trip flake), #471 (P5-10d number guard, strict, 2 false rejects recorded as a STATUS deviation). Lows filed through #496 (#488 to #491 from the #484 audit, #492 to #495 from the #486 audit, #496 the `là số` guard leak, being fixed in #501).
- **CI is the bottleneck:** one PR run is about 13 jobs against the account's concurrent-job cap, so about 3 runs move at once and a push waits 30 to 60 minutes. Owners may not add CI jobs (common owner brief). Bigger runners would be a paid service (Ryan only).
- **Fix rounds waiting on ci, then a scoped reader, then merge.sh:** #484 Q-08 access table (round 1 a88282c6251168790, briefs/q-08-ff1.md: encoded-path bypass; lane CLEAN), #486 Q-13 operations (round 1 a178a7e1bf27e3336, briefs/q-13-ff1.md: vercel git deploys, worker:update fetch order, backup:offsite refusals, non-operator pgTAP), #481 Q-17b (round 1 a825a78695648e081, briefs/q-17b-ff1.md).
- **#482 Q-12b** (round 2 a69bd7387c4aed5e6, slot 14, briefs/q-12b-ff2.md): the +430 s was the two extra shards' setup (about 190 s each before tests); dated specs folded back into 4 clock shards (6 e2e jobs, as main). Now reproducing assistant-limits on branch and main. Then Opus audit + lane.
- **New owners, each to Opus audit + lane (rigorous) or review:** #498 #468 void-then-quarterly (a074d13aa0d6575be, briefs/q-468.md, waiting ci), #497 Q-05 extraction accept (a2db1d214f7a5a6a9, slot 3, briefs/q-05.md; db job red at 5d059c74, forwarded), #499 Q-03 rental soft delete (a7033caec1e77917d, slot 8, briefs/q-03.md; builds the undo home Q-04 reuses), #500 Q-10a rules once (a3fc96eee42fc4ee0, no slot, briefs/q-10a.md), #501 guard #496 + #364 (aedc163f4208d963e, slot 9, briefs/q-guard-496.md; English function-word rule keeps Ryan's English sentences English; live probe run), #502 C19 assistant gaps (a46d92623e9dc7681, no slot, briefs/q-c19.md).
- **#464**: Dependabot npm-weekly bump, unreviewed.
- **Queue:** Q-04 legal tab after Q-03 (reuses its undo home, flips `direct-write` to a hard rule at 0); Q-10b rule-copy issues and the low backlog; Q-06, Q-07, Q-18, rest of Q-20, Q-14 squash (last before the first db push), Q-15 docs, Q-02 formatter last; #477 label. Pre-deploy: one live smoke on merged main (re-measure T7 50.2 s).
- **Ryan deploy gate:** #467 merged, so run `pnpm probe:denied-functions` against the preview project (DEPLOY.md section 12). #82 and #128 stay open until then.
- **Slots:** usable 3, 7, 8, 9, 14; never 1, 2, 4, 5, 6. Docker 7.8 GB holds about six stacks. Owners without a slot ask root through SendMessage and end their turn. A slot whose holder stopped its stack and sits in wait-ci goes to the next owner in line (tell the holder to ask again if ci fails). pid 56207 is Ryan's.
- **Waiting agents:** "waiting on its own background work" is fine when the work is wait-ci.sh, heavy.sh, a stack start, a build or the guard probe (check with `ps`); stop only a polling loop (pgrep, sleep, tail -f), by PID.

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

Week at 93% at 20:30 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard (raised by Ryan's x3 request): stop spawns at 96%, pause owners at 98%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` under-reads. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
