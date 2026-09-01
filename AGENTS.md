# AGENTS.md - Mission Control White-Label Starter

This repository is the canonical private white-label Mission Control starter.

## Operating Rules

- Treat committed content as reusable starter code only.
- Never add real client data, credentials, endpoints, uploads, screenshots, analytics IDs, infrastructure IDs, or private assets.
- Keep seed data fictional, neutral, and safe to publish inside a private recipient repository.
- Keep optional connectors marked `Not configured` until the recipient provides their own credentials and approves storage.
- Prefer adapting the existing Mission Control architecture over rebuilding from scratch.
- Client handoffs must be produced through the bootstrap/export workflow with fresh Git history.

## White-Label Pass

1. Collect a structured brand brief with approved names, copy, colors, assets, prohibited terms, and module choices.
2. Validate required production logo, favicon/app icon, and social-preview assets before applying the brief.
3. Run `npm run bootstrap:client -- --brief=<brief.json>`; use `--dry-run` for workshop preview only.
4. Review the generated handoff report and visual QA checklist.
5. Run the full verification suite before handoff.

## Verification

Run these before handing work back:

```bash
npm run template:scan
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --audit-level=high
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
