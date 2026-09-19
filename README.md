# Comms Hub MVP 0.1

Arabic RTL, local-only UI prototype. Direction A with larger media previews. No backend or external publishing.

## Run

Node.js 22.6+ required for the test command.

    npm ci
    npm run build
    npm start

Open http://127.0.0.1:3000. For development use npm run dev. State resets on refresh.

## Verify

    npm run typecheck
    npm test

Browser QA: node qa/verify.cjs, node qa/acceptance.cjs, and node qa/final-interactions.cjs against the running app. Local Playwright is preferred; optional Codex fallback and browser/base URL configuration are documented in qa/ACCEPTANCE.md.

## Demo

Use View As to switch writer → reviewer → writer → assistant → publisher. Create a post, request changes, edit and resubmit, approve the revision, schedule, then simulate partial failure and retry. Calendar, notifications and analytics use the same local records.

READY FOR CHECKPOINT 0.2 — prototype acceptance complete. Actual department validation remains pending. See qa/ACCEPTANCE.md and Status.md.
