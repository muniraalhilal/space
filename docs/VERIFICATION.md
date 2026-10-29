# Verification report

_Last run: 28 October 2026, against a fresh demo seed (PostgreSQL 16.15, Redis 7.0.15, Node 22.23)._

## Automated checks

| Check | Result |
| --- | --- |
| `packages/shared` unit tests (request state machine) | 9 / 9 passed |
| `apps/api` integration tests (real Nest app, real Postgres + Redis, isolated `space_test` DB) | 33 / 33 passed |
| `apps/web` Playwright end-to-end smoke tests (headless Chromium, SwiftShader WebGL) | 6 / 6 passed |
| TypeScript (`tsc --noEmit`) for shared, api, web | clean |
| `next build` (production web build) | succeeds, 21 routes |
| `docker compose config` | valid |

### What the API suite proves

- **Auth:** 401 without a session; identical message for wrong password and unknown email; CSRF header
  required on mutations; httpOnly session cookie.
- **Tenant isolation:** non-members get 404 for another company's org, members and tasks; a record from
  company B is never returned through company A's routes; writes referencing another tenant's records are rejected.
- **Permissions:** viewers can't create tasks; employees only see their departments' tasks; only company
  admins change company settings, roles and see the audit log; department admins manage members but can't
  appoint admins; the last company admin can't demote themselves; emails visible to admins only; the office
  hover card never reveals a task from a department the viewer can't read.
- **Requests:** only requesting-department admins can send; requester can't accept their own request;
  invalid transitions → `409 INVALID_TRANSITION`; stale versions → 409; full happy path to `completed`;
  outsiders can't see the request.
- **Agents:** viewers and other departments can't run a department agent; with no AI provider a run fails
  with an explicit message and no result; with a scripted test model: a cross-department task read is refused,
  an ungranted tool is denied, a write pauses for approval, employees can't approve, a department admin's
  approval resumes the run and the comment is written exactly once; a denial is reported to the model and
  nothing is written; a cancelled run never calls the model.
- **Admin:** invited members can sign in with the one-time password; GitHub tokens are stored encrypted and
  never returned; malformed repository names are rejected; “working remotely” presence round-trips;
  settings changes are audited; login is rate-limited (429 after 10 attempts/minute).

### What the end-to-end suite proves

Sign-in → office with Team Presence and the Today / Recent Activity / Upcoming panels; switching to the 2D map;
an employee creating a task; a viewer blocked from company settings; an admin change appearing in the audit log;
**a presence change by one user updating another user's office live without a reload.**

## Issues found and fixed during this pass

- Realtime updates were silently not connecting (the socket.io endpoint is `/realtime/` with a trailing slash and
  the web rewrite didn't match). Fixed and now covered by the live-presence e2e test.
- The company-wide default agent budget setting was saved but never used; new agents now inherit it.
- The permission matrix in Settings understated restrictions (employees can't send requests); corrected to match the server.
- Dev warnings from per-label React roots in the 3D office removed (labels are now plain DOM positioned per frame).

## Not verified / not done

Stated plainly so nothing here is mistaken for working:

- **Docker images were not built.** Pulling base images from Docker Hub is blocked in this environment.
  The Dockerfile and compose file are written and the compose file validates, but they have not been run.
- **Real AI providers were not exercised.** No Anthropic/OpenAI key was available. The provider adapters
  compile and the agent loop is tested end-to-end with a scripted model; a live run with a real key is still needed.
- **GitHub tools were not run against GitHub** (no test token/repository). Allow-listing and secret handling are tested.
- **S3 storage driver** not tested against a real bucket (local disk driver is what the tests use).
- **Platform Admin** is only a flag on the user record; there is no platform console.
- **No email delivery:** invites produce a one-time password for the admin to share; there is no password
  reset or change-password flow yet.
- **Office layout editing** exists in the API (`PUT /orgs/:id/office`) but has no drag-and-drop UI; rooms are auto-placed.
- **3D performance** was only checked in headless SwiftShader screenshots, not on a range of real laptops/GPUs.
- **Accessibility:** keyboard 2D map, reduced motion and Focus Mode exist; no formal WCAG audit was performed.
- The e2e suite writes data (a task, an accent colour change); re-run the seed afterwards for a clean demo.
