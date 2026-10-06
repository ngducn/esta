# Esta build kit: setup and kickoff

This kit turns Claude Code with poteto-mode into the builder for Esta v1. You set up once, paste one planning prompt, review the plan, paste one execution prompt, then come back at review gates.

| File | Goes to | Purpose |
| --- | --- | --- |
| `CLAUDE.md` | repo root | Conventions, commands, definition of done, stop-and-ask rules. Loaded every session |
| `docs/spec/SPEC.md` | repo | Scope, data model, acceptance checks, phases, spikes |
| `docs/spec/DOMAIN-VN.md` | repo | Certificates, 2025 address reform, 2026 rental tax, VietQR, formatting |
| `docs/spec/DESIGN-BRIEF.md` | repo | Audience, visual direction, screens, design QA. Feeds `/impeccable init` |
| `docs/spec/AGENT.md` | repo | Trợ lý worker on your subscription: jobs, tools, guards, evals |
| `KICKOFF.md` | keep for yourself | This file |

## What "one-shot" means here

One planning prompt and one execution prompt. After that the run is autonomous, but it is not one session. poteto-mode verifies every PR with unit tests, a swarm of live UI lanes and a perf check, so expect the build to span several sessions and days and to use a lot of your plan's usage. It stops at seven review gates and anything irreversible. That is the price of ending up with something you and Mẹ can trust with real money.

## 0. Confirm three defaults (5 minutes)

Open SPEC §3. The three most worth a second look:

1. **D1** Web app installed to the phone home screen, no native app.
2. **D4** Vercel plus Supabase, both in Singapore. Your certificate scans and tenant data live there.
3. **D5** The assistant runs on your Mac (or another always-on machine) using your Claude subscription. If the machine sleeps, the 07:00 brief waits.

Change them in SPEC §3 now if you disagree. Mid-run changes cost far more.

## 1. Set up (30 to 45 minutes)

### 1.1 Repo

```bash
mkdir esta && cd esta && git init
# copy CLAUDE.md to the root and docs/spec/* into docs/spec/
mkdir -p docs/plan fixtures fixtures-private apps/agent
cat > .gitignore <<'EOF'
node_modules/
.env*
!.env.example
fixtures-private/
.next/
coverage/
playwright-report/
test-results/
EOF
git add . && git commit -m "Esta spec kit"
gh repo create esta --private --source=. --push
```

### 1.2 Prerequisites

Node 22 or newer, pnpm (`corepack enable`), Docker Desktop running, Supabase CLI (`brew install supabase/tap/supabase`), GitHub CLI logged in, Claude Code up to date.

### 1.3 Skills and plugins

From the repo root in your terminal:

```bash
npx impeccable install --providers=claude --scope=project
npx skills add shadcn-ui/ui --skill shadcn -a claude-code
npx skills add vercel-labs/agent-skills --skill web-design-guidelines --skill vercel-react-best-practices -a claude-code
npx skills add supabase/agent-skills -a claude-code
```

If a skill name has changed, list what a repo offers with `npx skills add vercel-labs/agent-skills --list`. Accept Impeccable's design hook when asked; it scans every UI edit for AI-slop patterns.

Then in Claude Code, inside the repo:

```text
/plugin marketplace add michael-denyer/pstack-claude
/plugin install pstack@pstack-claude
/pstack:setup-pstack
```

In setup-pstack, keep judgment and design roles on the strongest models and put the swarm workers on a cheaper model. Swarm lanes are the biggest consumer of usage in this run.

Do not also install Anthropic's frontend-design (Impeccable is built from it, so you would get two copies of overlapping rules), the default taste-skill, or ui-ux-pro-max. They carry their own design systems and will fight Impeccable and the brief.

### 1.4 Design context

In Claude Code:

```text
/impeccable init
```

When it asks about the product, tell it: "Use docs/spec/DESIGN-BRIEF.md sections 1 to 4 as product truth." Answer anything else it asks as you would for Mẹ. Commit the `PRODUCT.md` it writes and add the `.gitignore` block from Impeccable's README if init did not.

### 1.5 Assistant auth

```bash
claude setup-token
```

Put the token in `apps/agent/.env.local` as `CLAUDE_CODE_OAUTH_TOKEN=...` before kickoff. Spike S1 uses it to prove the worker runs on your subscription. The file is gitignored.

### 1.6 Optional private fixtures

Drop photos of two or three real sổ into `fixtures-private/certificates/`. They are used only to measure extraction accuracy on your machine and are never committed.

### 1.7 Keep the Mac awake

Plug in and run `caffeinate -dims` in a spare terminal tab for the duration of the run.

## 2. Prompt 1: plan

Paste into Claude Code at the repo root:

```text
Use poteto-mode.

Goal: plan the complete v1 build of Esta from the spec kit in this repo. Planning only; do not implement.

Read in full, in order: CLAUDE.md, docs/spec/SPEC.md, docs/spec/DOMAIN-VN.md, docs/spec/DESIGN-BRIEF.md, docs/spec/AGENT.md, PRODUCT.md.

Run the Multi-phase or multi-PR plan playbook and write the plan to docs/plan/esta-v1-plan.md.

Standing constraints for the plan:
- Follow the phase order, exit predicates and review gates in SPEC §10. Split each phase into PRs that are each one verifiable unit.
- Settle spikes S1, S2, S3, S4 and S7 by prototype before writing the plan and put the evidence in Appendix A. S1 must prove the agent worker runs on the subscription token in apps/agent/.env.local. Plan S6 as the first PR of Phase 1 and S5 as the first PR of Phase 2, as SPEC §11 says.
- Live verification lanes drive the web app through the verify skill on seeded data at 390x844 and 1440x900 in Vietnamese. Use SPEC §9.4 as lane seeds.
- Every UI PR includes pnpm design:detect with zero findings (or a recorded ignore with a reason) and an /impeccable critique of the touched surfaces. Run /impeccable shape before building each core screen in DESIGN-BRIEF §6.
- Pick the stacked execution playbook so work continues on top of review-gated PRs while they wait. I review gated PRs in batches at each phase end and merge them. You may merge PRs that are not gated once their verdict is clean.
- Production deploys, cloud projects and everything under "Stop and ask Ryan" in CLAUDE.md are operator items that stop at merge-ready.
- SPEC §3 decisions are locked. [verify] facts follow DOMAIN-VN §0 and never block the run. Ask me only about product or preference calls the spec does not settle and no prototype can.

Stop after posting the plan path and the check-plan script output.
```

## 3. Review the plan (15 to 30 minutes)

Check:

- Every SPEC §10 phase is there, in order, with its exit predicate copied into the phase-final PR.
- Appendix A shows S1 passing on your subscription. If it fell back to `claude -p`, AGENT.md §2.2 should say so.
- The fonts chosen in S2 actually look right to you on the screenshot.
- The admin units dataset (S3) and the NAPAS BIN list source (S4) have licenses you are fine with. Approving them here is what lets the run use them without stopping.
- The review-gated set. poteto-mode gates every PR that changes an interaction by its own rule; the stacked execution playbook keeps building on top of them, so you review in batches at phase ends rather than one at a time.

If something is wrong, say so in the same session and let it revise before you say go.

## 4. Prompt 2: go

```text
Use poteto-mode.

Go on docs/plan/esta-v1-plan.md under the execution playbook it names. Run until done. I am stepping away and will come back for the review gates.

Exit condition: every box in the plan is checked with its evidence, pnpm e2e:northstar passes on a local production build against local Supabase, and docs/plan/STATUS.md lists every slipped P1 or P2 item with its reason.

Pause only for the review gates, the Mom test after Phase 3, and the items under "Stop and ask Ryan" in CLAUDE.md. Keep the decision trail with show-me-your-work under docs/plan/trail/.

If usage limits get close or the session must end, run the Pause safely playbook and write docs/plan/RESUME.md before stopping.
```

## 5. While it runs

### Review gates

Phone checks use `pnpm dev:lan`, which Phase 0 builds so your phone can reach the local app over HTTPS on your home network (corporate Wi-Fi often blocks device-to-device traffic). You will install a local certificate on the phone once; there is no public tunnel.

| After | You check |
| --- | --- |
| Phase 0 | Glyph page, color and type on the components page in light and dark, S1 evidence. Open the app on your phone through `pnpm dev:lan` |
| Phase 1 | Add one property yourself; old and new addresses; paste a Google Maps link from Zalo to set a pin |
| Phase 2 | Photograph a real sổ with your phone against the local app. The file stays in your local Supabase and is sent only to Claude for extraction; nothing is committed. Check extraction quality and that sensitive documents are blurred |
| Phase 3 | Scan an invoice's VietQR with two banking apps and confirm amount and memo prefill, then cancel. Run the Mom test (SPEC §10.1) |
| Phase 4 | Tax card numbers against your own understanding; note anything for an accountant |
| Phase 5 | Read a morning brief and the Thị trường feed; approve one proposal; ask five questions; look at the live-run evidence in `docs/plan/trail/` |
| Phase 6 | Final screens and the repeated Mom test. Then, together with Claude and `docs/plan/DEPLOY.md`: create the Vercel project and the Supabase cloud project in Singapore, the Google OAuth client if you want Google sign-in, and a production email sender. Then give the deploy go |

### Resume after a pause

```text
Use poteto-mode. Session pickup: resume docs/plan/esta-v1-plan.md from docs/plan/RESUME.md and docs/plan/trail/. Same standing orders as the original Go prompt.
```

### Change something mid-run

```text
Use poteto-mode. Change request for Esta: <what you want>. Update docs/plan/esta-v1-plan.md and the affected spec file first, show me the diff, then continue the run.
```

## 6. After v1

- Install the worker as a launchd agent on the Mac (AGENT.md §2.4) or move it to an always-on box.
- Re-check Anthropic's help center article on Agent SDK usage with Claude plans before relying on the worker daily, and note the date in `docs/plan/STATUS.md`.
- Invite Mẹ with her email, install the app to her home screen, set text size to 115% if she prefers.
- Ask an accountant to sanity-check the tax card against DOMAIN-VN §5 before you rely on it for a declaration.
