# Visual decision gallery

This is the design selection checkpoint, not the MVP application. It uses static HTML, CSS, and a small browser script. No dependency installation, backend, account connection, or external requests are required.

From the repository root:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory design-review
```

Open http://127.0.0.1:4173. You can also open `index.html` directly. The top controls select direction A/B/C, six screens, and a 390px phone preview. Native mobile layouts also work at narrow browser widths. Navigation and gallery controls work. Workflow controls open an explicit visual-preview notice; they are not implemented workflows.

| Direction | Structure | UX tradeoff |
|---|---|---|
| A, مساحة العمل | Full right sidebar, summary dashboard, work table, detail panels, form with preview, media grid | Familiar across eight roles; balanced density. Less space for media than B. |
| B, استوديو الحملة | Horizontal navigation, campaign-led home, visual board, large review canvas, editorial asset layout | Strong creative review and campaign context. More scrolling; full MVP navigation needs grouped secondary destinations. |
| C, مكتب العمليات | Compact right navigation, dense queues, work/detail split, staged composer, asset inspector | Efficient comparison and operations. Icon-only navigation has a learning cost; mobile moves detail below lists. |

All directions include Home, Work, Work Item detail, Create, Approvals/Publishing, and Media Library. Illustrative National Day artwork is custom CSS, not an official 2026 campaign identity. Role changes, approval actions, publishing, calendar, persistence, and the full page set belong to the next stage after selection.

Screenshots in `screenshots/` cover all 18 desktop and 18 mobile views. `verification.json` records automated viewport checks at 1440, 1280, 900, and 390, JavaScript errors, and gallery interaction checks. These are design-gallery checks, not MVP acceptance.

The local `verify.cjs` and `boards.cjs` utilities use the Codex desktop's bundled Playwright and Sharp. Set `CODEX_NODE_MODULES` to another modules directory when needed. They are optional verification utilities, not runtime dependencies.

## Implementation after selection

Use one Next.js App Router application with TypeScript and Tailwind. Keep local domain state in a client provider and centralize mock records and transitions. Follow the roadmap phases; use the selected direction's components rather than maintaining three products. The current Context7 documentation confirms the client-provider pattern. Refresh library documentation when scaffolding the actual application.

UI constraints carried forward: eight distinct role experiences; approval tied to a release; approved public content changes require another review; publishing results tracked by channel; notifications separate from required action; logical asset versions shown together; Arabic search normalization; Riyadh scheduling; Admin separate from business approval authority. These remain UX simulations in MVP 0.1.

Design decision: pending user selection. No direction is implicitly selected for implementation.
