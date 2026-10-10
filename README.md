# Comms Hub — مركز الاتصال المؤسسي

An Arabic, right-to-left workspace for a corporate communications department: plan
campaigns, write and design content, review and approve exact versions, schedule and
publish to several channels, and keep the media. Eight roles: مدير الاتصال المؤسسي،
مساعد مدير الاتصال المؤسسي، كاتب المحتوى، المصمم، المنتج الإعلامي، مسؤول النشر وإدارة
الحسابات، عضو، Admin.

**What this repository is today.** Version 0, a local UI prototype. All data is mock
state that resets on refresh. There is no database, sign-in, real publishing, mail,
storage or AI. Its purpose is to be tested by the real department before any
production system is built.

## Where things stand (2026-10-10)

- **Checkpoint 0.1, prototype:** complete and accepted on 2026-09-19.
- **Checkpoint 0.2, department validation:** in progress. The first real response
  (the Director) arrived on 2026-10-10; five more participants are needed. Round 1
  corrections from that response start on 2026-10-11.
- **Checkpoint 0.3, new visual identity:** optional, waiting on the Director's
  approval. The current design (Direction A, `DESIGN.md`) stays in force until then.
- **Versions 1 to 4, production system:** planned, and gated on validation.

Current detail and the next actions: [Status.md](Status.md). The plan:
[Roadmap.md](Roadmap.md).

## Documents

| File | What it holds |
|---|---|
| [Roadmap.md](Roadmap.md) | Plan, checkpoints, exit gates, and the work plan from 2026-10-11 |
| [Status.md](Status.md) | Present state, decisions waiting on the owner, next action |
| [progress.md](progress.md) | Dated, verified outcomes and evidence |
| [MVP_draft.md](MVP_draft.md) | Authoritative specification of the prototype's screens and flows |
| [DESIGN.md](DESIGN.md) | The selected visual direction |
| [Ideas_Backlog.md](Ideas_Backlog.md) | Extra ideas outside the Roadmap; nothing there is planned |
| [AGENTS.md](AGENTS.md) | Working rules for every contributor and agent |
| `validation/` | Workflow map, session scripts, rubric, Google Form, owner input log, and one file per response under `validation/responses/` |
| `disscussios/` | The eleven architecture documents. Read and cite; never edit |
| `qa/` | Re-runnable browser checks and their JSON results |

## Run

Node.js 22.6 or newer is needed for the test command.

```bash
npm ci
```

```bash
npm run build
```

```bash
npm start
```

Open <http://127.0.0.1:3000>. For development use `npm run dev`. To let colleagues on
the same network open it, use `npm run start:lan` (or `start-server.bat` on Windows)
and give them `http://<this computer's IP>:3000`. `/health` returns a JSON liveness
check.

## Verify

```bash
npm run typecheck
```

```bash
npm test
```

Browser checks run against a running app: `node qa/checkpoint-02-corrections.cjs`
(34 checks), `node qa/motion-studio.cjs`, and the earlier `qa/verify.cjs`,
`qa/acceptance.cjs` and `qa/final-interactions.cjs`. Playwright, browser and base URL
settings are in [qa/ACCEPTANCE.md](qa/ACCEPTANCE.md). The project rule is that a
change is done only when typecheck, tests and build pass and any visible change has a
saved browser check.

## Demo

Use «عرض بصفة» (View As) to switch writer, reviewer, writer, assistant, publisher.
Create a post, request changes, edit and resubmit, approve the revision, schedule it,
then simulate a partial failure and retry the failed channel only. Calendar,
notifications and analytics read the same local records. `/motion` is the local motion
studio: 26 Arabic motion templates with downloads up to 4K.

The demo scenario is Saudi National Day 2026; its due dates are 22 and 23 September
2026, and the prototype does not yet show a scenario date, so work can look overdue
when tested later (Roadmap task 0.2.3.5).
