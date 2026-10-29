# Architecture

```
apps/web      Next.js 16 (App Router, React 19), Tailwind v4, TanStack Query, zustand,
              React Three Fiber + drei for the 3D office
apps/api      NestJS 11 HTTP API + socket.io gateway, Drizzle ORM (PostgreSQL), BullMQ worker
packages/shared  zod schemas, domain enums, request state machine, tool catalog — used by both apps
```

Browser → Next.js server (`/api/*` and `/realtime` are rewritten to the API) → NestJS → PostgreSQL / Redis.
The agent worker is a separate process (`dist/worker.js`) consuming the `agent-runs` BullMQ queue.

## Multi-tenancy

- Every tenant-owned table carries `org_id`. Foreign keys between tenant tables are **composite**
  (`(org_id, id)`), so a row can never reference a row in another company, even by a bug in application code.
- All company routes are `/api/orgs/:orgId/...`. The global `AuthGuard` loads the caller's active membership for any `:orgId` route; a
  non-member gets **404** (existence of other companies is never revealed).
- `OrgContext` carries the company role and department roles and exposes the only permission checks used
  by services (`canReadDept`, `canWriteDept`, `canAdminDept`, `assertCompanyAdmin`, `readableDeptIds`).
  Lists are filtered in SQL by readable departments; single records are loaded with `org_id` in the
  `WHERE` clause and then checked.

## Roles

| Role | Scope |
| --- | --- |
| Company Admin | Everything in the company: settings, members, departments, integrations, audit log. |
| Department Admin | A department's members (not appointing admins), work, requests and agent approvals. |
| Employee | Read and write work in their departments; run their department's agents. |
| Viewer | Read-only in their departments. |
| AI Agent | Acts only through granted tools, inside the department a run was started for. |
| Platform Admin | A flag on the user record. **No platform-admin console exists yet** (see VERIFICATION). |

## Authentication & request security

Opaque session tokens in an httpOnly `space_session` cookie (SHA-256 stored server-side, configurable TTL).
Mutations require the `x-space-csrf: 1` header (blocked cross-site without CORS). bcrypt password hashes,
helmet headers, request-body limits, global rate limit (600/min) and stricter login/register limits
(10 and 5 per minute). Security-relevant actions are written to `audit_logs`.

## Requests state machine

Defined once in `packages/shared/src/request-machine.ts` and enforced server-side:
each action lists allowed source states, the acting side (requester department admins or receiver
department admins) and whether a note is required. Updates use optimistic concurrency (`version`).

## Realtime

Services publish small events (ids only, never content) to Redis channel `space:events`. The gateway
fans them out to socket.io rooms per company, member and department; clients re-fetch through the normal
permission-checked API. By default the browser uses long-polling through the Next.js rewrite; set
`NEXT_PUBLIC_REALTIME_URL` to connect directly and use WebSockets.

## AI agents

- **Tools** (`agents/tools`) are typed (zod), carry a risk level (`read`, `write_internal`,
  `write_external`) and receive a context bound to the run's company and department.
- **Approvals:** `write_external` always pauses for a department admin. `write_internal` pauses unless
  the agent is autonomous **and** the company turned off “require approval”. Tool results are stored per
  `tool_use_id`, so resuming after approval never repeats an action.
- **Limits:** monthly budget (company default, per-agent override), max steps, run timeout, cancellation
  checked between steps.
- **Providers:** Anthropic or OpenAI via env. Without one, model-driven runs fail with a clear message.
  Built-in workflows (department report, action items, GitHub digest) are deterministic and need no model.
  A scripted provider exists for tests only and refuses to load outside `NODE_ENV=test`.
- **Worker:** atomic claim of queued runs, retries for transient provider errors, a sweeper that
  re-enqueues runs orphaned by a crash.

## Office rendering

Furniture is built from merged geometry per material (`office/lib/prefab.ts`) with canvas textures, so a
full floor renders in a handful of draw calls. An orthographic isometric camera fits the floor; post-processing
(AO, bloom, SMAA) is enabled only on capable devices (`?quality=low|high` overrides). Presence pins are
billboarded meshes; department labels are DOM elements positioned from projected anchors each frame.
The 2D map (`Office2D.tsx`) is the keyboard-accessible alternative.
