# MVP 0.1 acceptance — 2026-09-19

**READY FOR CHECKPOINT 0.2.** Phase 0.1.5 is complete. No blocking defect remains for supervised department workflow validation. This is prototype acceptance, not human validation or production readiness.

## Evidence

- `npm run build`, `npm run typecheck`: pass. Production server starts on port 3000.
- `npm test`: five passing domain tests. Version binding, approval invalidation, Admin separation, notification read independence, retained snapshots and successful-channel preservation during retry.
- `node qa/verify.cjs`: complete create → submit → request changes → edit → resubmit → approve revision 2 → publisher → schedule → calendar → partial publication → retry → success. 60 route/viewport checks at 1440, 1280, 900 and 390; zero overflow and page errors. See `verification.json`.
- `node qa/acceptance.cjs`: all eight personas, four specialist/member comment flows, review/publishing visibility, Admin shell, Mail read/conversion, Ideas conversion, Analytics totals, Monitoring navigation, Settings previews, Account reset/cancel, form validation. See `personas.json` and `acceptance.json`.
- `node qa/final-interactions.cjs`: mobile menu focus containment and restoration, keyboard skip link, media filter/list/version/empty search, historical approved content after editing, notification read state, Work filter/board/empty state, calendar dialog/empty month, mobile global search. Zero captured console/page errors or external request origins. See `final-interactions.json`.
- `node qa/scope.cjs`: 17 source/config files checked; no credential-pattern findings, production service calls or production configuration candidates. This focused scan is not a comprehensive security audit. Dependencies contain no backend clients. Architecture documents still describe future production systems.

## Visual and accessibility review

Actually inspected 14 rendered full-page screenshots: Home, Work, Work Detail, Create, Approvals/Publishing, Calendar and Media at 1440 and 390. Also inspected mobile navigation, calendar dialog and expanded historical approval. Generated screenshots are local, ignored files under `qa/artifacts/`; scripts reproduce individual views.

Direction A remains consistent: right sidebar, restrained green hierarchy, panels and Arabic-first content. Larger media canvases are the only B contribution. Mobile work rows become stacked cards, forms stack, tabs scroll and the calendar becomes an event list. Arabic headings, status text and long navigation labels remain readable. No blocking clipping or spacing regression was found. Full-page captures include the sticky mobile navigation at its viewport position; the underlying content remains scrollable.

Native dialogs contain keyboard focus, Escape closes them and focus returns to the opener. The skip link visibly appears on focus. Search has an accessible name on mobile. Form fields have labels, required/channel validation works, content-switch buttons do not submit forms, and statuses have text as well as color. Reduced-motion disables loading animation.

Sample contrast calculations: body text/white 11.65:1; muted text/white 4.83:1; primary/white 7.18:1; review chip 5.39:1; warning chip 4.63:1; failure chip 5.12:1. Decorative media artwork is illustrative and has an accessible image description. This focused review is not a WCAG certification or screen-reader/device compatibility audit.

## Fixes and decisions

1. **Historical releases: required and implemented.** Submitted and reviewed snapshots retain copied text, channel variants, selected asset/version, reviewer and decision/note in local state. Editing clears current approval/schedule but preserves prior records. Read-only history appears in Work Detail and Approvals. There is no durable audit store.
2. **Upload/playback: deferred.** Illustrative assets, selectable versions and linked usage let reviewers evaluate assignment, revision and release governance. Real binaries/player behavior are unnecessary for this validation gate. Revisit only if department feedback makes them necessary.
3. Fixed dialog focus return; replaced the untrapped mobile overlay with the shared native dialog; named mobile global search; added a mobile empty-month message and reduced-motion handling.
4. QA now resolves local Playwright first, with an optional environment/Codex fallback. No dependency or test infrastructure expansion.

## Accepted prototype limits

State and history reset on refresh. View As is a UX simulation. Content types share one composer. Media is illustrative; no uploads or playback. Calendar offers month/agenda, without week/day views or date-level creation. Settings affect their local preview. Admin is a configuration shell, without business approval authority. Analytics are mock work-derived totals, not real engagement ingestion. No production authentication, database, OAuth, integrations, workers, AI calls, external mail/notifications or publishing.

Human department validation has not occurred. Checkpoint 0.2 and Version 1 remain unstarted. Next: map repository-supported workflow assumptions and prepare the real department walkthrough; then collect actual human findings.

## Reproduce browser checks

Run `npm ci`, `npm run build`, then `npm start`. In a second terminal run the three browser scripts above. They require Playwright plus a browser: use a locally installed `playwright` package (for example `npm install --no-save --package-lock=false playwright`) or set `CODEX_NODE_MODULES` to a directory containing it. Edge is the default browser. Set `QA_BROWSER=chromium` to use Playwright's installed Chromium; other channel names can be supplied. Set `QA_BASE_URL` to change the app address. See `runtime.cjs`. Installing a package alone does not install a browser.

Initial rerun found the local server stopped; restarting it resolved connection refusal. A final-check locator needed partial label matching for a select whose options contribute to its implicit name. These were environment/test issues; the corrected final runs pass.
