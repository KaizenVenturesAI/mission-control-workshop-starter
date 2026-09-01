# Mission Control White-Label Starter

Private Next.js starter for building client-owned Mission Control workspaces. It preserves the reusable product surfaces while removing prior-client assumptions from auth, seed data, branding, repository identity, and handoff workflow.

## Product Surfaces

- Dashboard, Action Board, CRM accounts, contacts, opportunities, activities, duplicate review, and settings are core.
- Strategy, knowledge brain, revenue, people, usage, calendar, permissions, rulebook, and integration lanes are optional modules.
- Optional modules are enabled for demo visibility but marked `configured: false` in `src/config/modules.ts` until a recipient provides owned systems and credentials.

## Architecture

- App framework: Next.js App Router with TypeScript.
- UI shell: `src/components/AppShell.tsx`, `DashboardLayout.tsx`, `Sidebar.tsx`, and typed config in `src/config`.
- Data: committed fictional seeds in `src/data`; local development writes under `.data/`, which is ignored.
- API: route handlers under `src/app/api`.
- Auth: middleware protects every non-public API route by default. Public API routes are explicitly allowlisted in `middleware.ts`.
- Scanner/bootstrap: `scripts/template-scan.mjs` and `scripts/bootstrap-client.ts`.

## Security Model

Local/demo auth uses `MISSION_CONTROL_USERNAME`, `MISSION_CONTROL_PASSWORD`, and `MISSION_CONTROL_SESSION_SECRET`. Successful login creates an HTTP-only, SameSite=Lax, secure-in-production signed session cookie. API middleware verifies the cookie and checks the route's module permission. Mutations require `edit`; reads require `view`.

External auth and durable production backends are intentionally not bundled. A production deployment should choose a recipient-owned identity provider, database, object storage, and audit/log retention policy before real data is stored.

## Local Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Use a fictional local operator account such as:

```text
MISSION_CONTROL_USERNAME=operator@example.invalid
MISSION_CONTROL_PASSWORD=<local-only password>
MISSION_CONTROL_SESSION_SECRET=<local-only random value of at least 16 characters>
```

## White-Label Workflow

1. Create a structured brand brief using `docs/brand-brief.example.json` as the shape.
2. Include approved company/product names, legal/display names, tagline, audience, tone, semantic colors, typography, required assets, asset license/attribution, prohibited legacy terms, repository name, and optional module choices.
3. Validate without writing:

```bash
npm run bootstrap:client -- --brief=docs/brand-brief.example.json --dry-run --allow-demo-assets
```

4. Apply a production brief only when logo, favicon/app icon, and social-preview assets are present:

```bash
npm run bootstrap:client -- --brief=path/to/client-brief.json
```

5. For a recipient repository, export to a clean directory and create a new initial commit there. Do not expose canonical starter history.

## Handoff Gates

```bash
npm run template:scan
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --audit-level=high
```

The scanner blocks secrets, forbidden prior-client terms, concrete endpoints outside documented allowlists, tracked local data, private artifacts, and hard-coded colors outside documented transitional UI styling allowlists.

## Deployment

Deploy only to recipient-owned infrastructure. Required decisions before production:

- identity provider and session lifecycle
- database and backup posture
- object storage for uploads/assets
- audit log retention
- environment variable ownership
- connector scopes and approval workflow
- repository visibility and branch protection

## IP, License, And Support

This starter is private reusable software. Recipient repositories should have their own license, support terms, owners, package name, app metadata, assets, and clean Git history. Do not include canonical template commit history, prior-client metadata, or private assets in a recipient handoff.

## Known Limitations

- Local JSON is development/demo storage only.
- Existing UI components still contain transitional inline styling; new client colors should flow through semantic config and CSS tokens.
- Optional connectors are scaffolds until recipient-owned credentials exist.
- The bootstrap validates SVG and PNG assets locally but does not perform manual brand approval.

## Migration Notes

This branch turns the previous client-shaped starter into the canonical white-label baseline. It replaces client-specific docs and metadata with neutral instructions, centralizes brand/module config, adds server-enforced API auth, strengthens scanning, and adds repeatable bootstrap evidence for future handoffs.
