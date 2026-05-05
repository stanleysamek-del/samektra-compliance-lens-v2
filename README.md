# Compliance Lens v2

AI-powered code compliance inspection platform. Parallel staging build for the next version of [Compliance Lens by Samektra](https://samektra-compliance-lens.vercel.app). The live production app is intentionally untouched while features are built out here.

## What it does

An inspector (or any safety-minded user) walks through a building, department, smoke compartment, or suite. They take photos and the AI:

- Recognizes what's in the photo
- Annotates deficiencies with normalized bounding boxes
- Writes the description, severity, code reference, and remediation
- Lets the user edit/correct entries before finalization

At the end of the walk-through, the platform generates the complete inspection deliverable:

- **CAP** — Corrective Action Plan (Excel)
- **LSRA** — Life Safety Risk Assessment (Excel)
- **ILSM** — Interim Life Safety Measures (Excel, when applicable)
- **PDF report** — full findings, location/address/inspector/manager metadata, and signature lines for inspector + assigned manager

## Coverage

NFPA, IBC, IFC, NEC, CMS, The Joint Commission, ADA, ANSI, Georgia Title 25.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Deployed on Vercel

## Project layout

- `app/` — Next.js App Router pages and routes
- `lib/prompts/compliance.ts` — system + user prompts for the AI vision model (schema v1.1)
- `lib/prompts/types.ts` — TypeScript types for the analysis output
- `templates/` — binary xlsx templates for CAP / LSRA / ILSM. Patched server-side with inspection metadata + findings; do not regenerate from scratch (preserves conditional formatting, merged cells, and policy boilerplate).

## Local development

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.
