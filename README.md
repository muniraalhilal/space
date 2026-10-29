# Space

**Your workplace, connected.** Space is a multi-tenant virtual workplace: every company gets its own
“*Company* Space” with an interactive isometric office, departments, projects and tasks,
cross-department requests, messages, files, reports and AI agents that do real, permission-checked work.

The demo company is **Juniper Space** (plus a second tenant, *Qamar Studio*, used to show company
switching and tenant isolation).

## What's inside

| Area | Highlights |
| --- | --- |
| Office | Isometric 3D office (React Three Fiber) with one room per department, a desk for each person and a presence pin above every desk (in office / remote / away / offline). Hover a desk for a person card with their current task; robots are the AI agents. An accessible 2D map works with the keyboard. Focus Mode and reduced motion are respected. |
| Work | Projects, tasks (list, board, calendar), subtasks, dependencies with cycle checks, comments, files, optimistic concurrency. |
| Requests | Cross-department requests with a validated state machine (submit → accept → start → deliver → approve, plus clarification, changes, reject, cancel). |
| People | Company roles (Company Admin, Employee, Viewer), department roles (Department Admin, Member), presence, DMs, notifications. |
| AI agents | Tool registry with risk levels, per-agent tool grants, department scoping, human approval for writes, budgets, step limits, timeouts, cancellation and a full step log. Built-in deterministic workflows run without an AI key; model-driven runs need Anthropic or OpenAI credentials and fail clearly without them. GitHub tools for allow-listed repositories. |
| Admin | Company profile and branding (white-label “*Name* Space”), departments, members & roles with a permission matrix, AI & integration settings, audit log. |

## Quick start (local)

Requirements: Node 22, PostgreSQL 16, Redis 7.

```bash
npm install
cp .env.example .env            # defaults work for local development
npm run build                   # shared → api → web
npm run db:migrate
npm run db:seed                 # Juniper Space + Qamar Studio demo data
# three processes:
npm run dev:api                 # API on :4000
npm run dev:worker              # agent worker
npm run dev:web                 # web on :3000
```

Sign in at http://localhost:3000 with password `space-demo-2026`:

| Email | Role |
| --- | --- |
| munira@juniper.demo | Company admin (also in Qamar Studio) |
| faisal@juniper.demo | Development department admin |
| lina@juniper.demo | Marketing department admin |
| sara@juniper.demo | Employee (Development) |
| sultan@juniper.demo | Viewer (Finance) |

With Docker instead: see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

```bash
npm test          # shared unit tests + API integration tests (needs Postgres + Redis; uses space_test DB and Redis DB 15)
npm run test:e2e  # Playwright smoke tests against a running stack with the demo seed
```

The API suite covers authentication and CSRF, tenant isolation, role permissions, the request
state machine, agent authorization (tool grants, department scope, approvals, denial, cancellation,
honest failure without a provider), secret handling, audit logging and rate limiting.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Verification report](docs/VERIFICATION.md) — what was tested, how, and what is not done yet
