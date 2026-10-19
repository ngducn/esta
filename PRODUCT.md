# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Locked in `docs/spec/SPEC.md` §3. Next.js App Router, React, TypeScript strict, Tailwind CSS and shadcn/ui primitives restyled to the brief (D2), on Supabase (D3), hosted on Vercel in Singapore (D4). Installable PWA, no native app (D1).

## Users

- **Mẹ (primary).** Owns most of the properties. Uses the installed PWA on her phone, in Vietnamese only. She is comfortable with Zalo and a banking app but avoids anything that looks technical. She checks the app in the morning, uses it at a rooming house while collecting rent (often one-handed, holding cash, in bright light, on patchy data, with tenants nearby), and again in the evening. Her jobs are to see what needs doing today, record a payment, and find a document. She fears recording the wrong amount, losing a document and pressing something irreversible.
- **Ryan (operator).** Engineer, admin and operator of the system. Uses a laptop and phone, reads Vietnamese and English. Runs weekly reviews, statement imports, configuration and the assistant. He fears wrong numbers, data loss and silent agent mistakes.
- **Viewer (later).** A relative or accountant with read-only access. The role exists in v1 with no dedicated screens.

When Mẹ's needs and Ryan's conflict, Mẹ's experience wins. Ryan's power features (compact density, shortcuts, bulk actions, diagnostics) layer on without changing what she sees.

## Product Purpose

Esta is the family's ledger for its land and houses. It replaces a drawer of certificates, a rent notebook and a chat thread of bank screenshots. It records every house and parcel properly, keeps the paperwork in one safe place, tracks who owes what and since when, and has an assistant (Trợ lý) watch the portfolio and the market every morning.

Success means anyone in the family can answer "who hasn't paid this month", "which lease ends next", "how much did this property earn this year" and "are we near the rental tax threshold" in seconds, and trusts the answer.

## Positioning

A private ledger for a Vietnamese family's real estate. It is exact about money, calm about problems, and built around Vietnamese reality: certificates of every era, the 2025 two-tier address reform, VietQR, Zalo reminders and the 2026 rental tax threshold. The assistant proposes and people decide. It never changes a business record on its own.

v1 serves one household. Other families are a confirmed future audience, so the data model is multi-household from day one and first-run and onboarding quality matter beyond this family. Onboarding other families, billing and multi-family operation are not in v1 (`SPEC.md` §4.1).

## Operating Context

- Paper certificates (sổ đỏ, sổ hồng, GCN) photographed on a phone, from pre-2009 forms to the 2024 QR form, plus paper or Zalo-only leases.
- Monthly rooming-house routine: read electricity and water meters for every room, bill in arrears, collect cash or bank transfers, send polite reminders by copying text into Zalo.
- Bank statements exported as CSV or XLSX from Vietnamese banks, matched to invoices by a memo code.
- Properties spread across provinces, with old addresses printed on certificates and new two-tier addresses in daily use.
- The assistant runs on Ryan's machine; when it is offline, work queues and the app says so.

## Capabilities and Constraints

- Modules: properties and certificates, documents vault, leases and rent, money and tax, the assistant, settings and export (`SPEC.md` §4).
- Money is exact integer VND. Every tax figure is labelled an estimate, never advice.
- Vietnamese is the default language, with an English toggle. Every string is translatable.
- Personal data minimization: the app never writes a full national ID number by itself; what the assistant reads keeps the last 4 digits, and text a person types is saved as typed (D11, 2026-10-19). ID card scans and certificates are sensitive documents that the assistant reads only through their extraction job. Every document shows clear, and every access is logged.
- Real family data never enters the repository, screenshots or fixtures. Demo data uses synthetic names containing "Demo".
- Out of scope for v1: tenant portal, other families, Zalo Official Account messaging, bank API integration, native apps, double-entry accounting, legal or tax advice.

## Brand Commitments

- Name: Esta. No logo, mark or name story exists yet. Visual identity comes later from the design brief.
- The assistant is called "Trợ lý" and behaves like a quiet colleague who leaves notes.
- Voice: neutral, polite Vietnamese, like a careful family accountant. Short sentences, plain words, legal terms only as printed on the certificate. No exclamation marks and no emoji in UI copy. Full voice table in `docs/spec/DESIGN-BRIEF.md` §3.

## Evidence on Hand

- Product truth and acceptance checks: `docs/spec/SPEC.md`, `docs/spec/DOMAIN-VN.md`, `docs/spec/DESIGN-BRIEF.md`, `docs/spec/AGENT.md`.
- Synthetic seed household "Gia đình Demo" with seven properties (`SPEC.md` §9.3).
- No testimonials, customers, usage metrics or brand assets exist. Do not fabricate them.

## Product Principles

1. Mẹ first. If she cannot do it on her phone in under two minutes without help, it is not done.
2. Exact or silent. Show a number only when it is right and traceable to its record; say plainly when something is missing.
3. People decide. The assistant proposes, and every change to business data is made and attributed by a person.
4. Nothing irreversible by surprise. Reversible actions offer undo; irreversible ones name the object in words.
5. Built for Vietnam as it is. Old and new addresses, every certificate era, local payment habits.

## Accessibility & Inclusion

WCAG 2.2 AA. Touch targets at least 44 × 44 px. Body text 16 px minimum with a user text scale of 100, 115 and 130%. Every action has a visible text label; no icon-only actions on mobile, and no hover-only or swipe-only affordances. Status is never conveyed by color alone. Designed for an older, non-technical primary user in bright outdoor light.
