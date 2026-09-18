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

qa/verify.cjs uses the Codex desktop bundled Playwright and Edge. Run it against the running production app. See qa/verification.json for results and Status.md for limitations.

## Demo

Use View As to switch writer → reviewer → writer → assistant → publisher. Create a post, request changes, edit and resubmit, approve the revision, schedule, then simulate partial failure and retry. Calendar, notifications and analytics use the same local records.

Not yet signed off for broad department validation. See Status.md for the exact next work.
