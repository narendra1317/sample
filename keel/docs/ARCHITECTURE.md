# Architecture

## Design principles

1. **One engine, everywhere.** All scheduling, EVM, risk, quality and business rules live in `public/core/`. They are pure ES modules with no dependencies, imported by the Node server *and* by the browser. The browser recalculates the schedule instantly after every edit, and the server computes the same results for the portfolio and APIs. There is only one implementation to test.
2. **One service layer, many deployments.** `core/service.js` contains every API route and permission check. The Node server wraps it with HTTP, authentication and file persistence. The browser demo wraps the *identical* code with localStorage. A future SaaS back end wraps it with PostgreSQL and tenancy.
3. **Zero runtime dependencies.** Node 18+ standard library only. No third-party supply-chain risk, short security reviews, and a small container image.
4. **Readable over clever.** One senior developer must be able to own the whole product.

## Components

```
Browser (public/app)                         Node server (server/)
┌──────────────────────────────┐             ┌───────────────────────────────┐
│ main.js   router, layout     │  HTTPS/JSON │ index.js  HTTP, static, CSP   │
│ api.js    HttpApi | LocalApi │────────────▶│ auth.js   scrypt, sessions,   │
│ views/*   pages & tabs       │             │           login throttling    │
│ gantt.js  charts.js  ui.js   │             │ store.js  atomic JSON file +  │
└──────────────┬───────────────┘             │           daily rolling backup│
               │ imports                     └──────────────┬────────────────┘
               ▼                                            │ imports
        ┌─────────────────────────── public/core ───────────▼──────────────┐
        │ service.js   routes, validation, permissions, workflows, audit   │
        │ cpm.js  calendar.js  evm.js  resources.js  levelling.js          │
        │ montecarlo.js  dcma.js  registers.js  analysis.js                │
        │ xer.js  mspxml.js  seed.js  dates.js                             │
        └──────────────────────────────────────────────────────────────────┘
```

## Data model (collections in the store)

| Collection | Key fields |
|---|---|
| `projects` | code, name, client, contract, startDate, **dataDate**, mustFinishBy, calendarId, activeBaselineId, progressMode, history[] |
| `wbs` | projectId, parentId, code, name, sort |
| `activities` | projectId, wbsId, code, name, type (task / start-milestone / finish-milestone / loe), duration, remaining, calendarId, constraintType/Date, actualStart/Finish, pctComplete, progressMethod, steps[], budgetCost, actualCost, optimistic/pessimistic, phase, discipline |
| `relationships` | predId, succId, type (FS/SS/FF/SF), lag (working days, successor calendar) |
| `assignments` | activityId, resourceId, budgetHours |
| `resources` | code, name, type, discipline, rate, maxHoursPerDay, capacityHoursPerWeek, calendarId, rotation, wtrOptOut |
| `calendars` | workDays[0–6], hoursPerDay, holidays[] |
| `baselines` | projectId, name, finish, budget, activities{ id: {start, finish, duration, budget, hours} } |
| `timesheets` | resourceId, weekStart (Monday), status (draft / submitted / approved / rejected), lines[{projectId, activityId, category, hours[7], claimPct, note}] |
| `risks` | probability, impactDays, impactCost, activityIds[], status, response |
| `deliverables` | docNo, discipline, activityId, weightHours, planned{stage}, actual{stage} |
| `procurement` | tag, vendor, value, activityId, needActivityId, rosBufferDays, planned/forecast/actual{MR, PO, VDA, FAT, RFS, DEL} |
| `changes` | ref, type, status, costImpact, fragnet[], impact{} |
| `users` | email, role, resourceId, pwHash, salt |
| `audit` | ts, user, action, entity, entityId, summary (last 5,000) |

## Scheduling engine notes (`cpm.js`)

- Time is held as integer **day numbers** (no timezone or DST issues). A point `p` is the start of day `p`. Work on days `s..f` occupies `[s, f+1)`.
- Each calendar keeps a cumulative working-day index, so add-days and between-days are O(1). A 1,000-iteration Monte Carlo on a 50-activity schedule runs in roughly 0.2–0.3 s in a browser.
- Forward pass in topological order (Kahn). Loops are detected, reported and broken. Backward pass ignores completed successors. Hard constraints can create negative float. Retained logic is the default for out-of-sequence progress.
- `driving[]` records which relationship or constraint set each early start. That powers "Why these dates?" and the longest path.

## Security

- Passwords: scrypt (N = 16384) with a per-user salt; constant-time comparison.
- Sessions: 256-bit random bearer tokens, sliding 12 h expiry (`KEEL_SESSION_HOURS`), server-side revocation on logout.
- Login throttling: 10 failures per IP per 10 minutes.
- Headers: strict CSP (`default-src 'self'`, no inline script), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
- Static file serving guards against path traversal. Request bodies are capped at 25 MB.
- Every write is validated against a schema (types, enums, dates, cross-project references) and permission-checked by role.
- The audit log records every change, login, approval, import and period close.
- **Before production:** terminate TLS at a reverse proxy, restrict network access until SSO is added, and back up the `/data` volume.

## Scaling path (Roadmap Phase 2)

| Today | Next |
|---|---|
| JSON document store, in-memory, debounced atomic writes | PostgreSQL. `service.js` takes a repository interface; move direct `db.<collection>` access behind it (about 80 references, all in one file) |
| Single tenant | `tenantId` on every row plus row-level security, or one schema per tenant |
| Bearer token sessions in memory | OIDC (Entra ID / Okta) and signed session cookies stored in Postgres or Redis |
| Whole-project bundle sent to the browser | Paging and server-side filtering for programmes above about 5,000 activities; virtualised Gantt rows |
| Synchronous scheduling | Worker threads for portfolio-wide recalculation and QSRA on large programmes |

## Testing

`npm test` runs 22 tests (node:test):
- `cpm.test.js`: calendar maths, all relationship types, lags and leads, constraints, negative float, progress, milestones, LOE, loops
- `service.test.js`: permissions, validation, timesheet workflow and auto-progress, fatigue flags, baselines, period close, what-if copy, levelling, TIA, XER import, MSP XML round trip, Monte Carlo reproducibility, DCMA
- `server.test.js`: HTTP auth, security headers, static serving, persistence
