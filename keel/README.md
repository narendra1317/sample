# Keel — EPC Project Controls

**One platform for the whole EPC lifecycle: plan, book, earn, deliver.**

Keel combines the critical-path scheduling of Primavera P6 and MS Project with the things EPC teams currently run in a dozen spreadsheets: weekly timesheets, earned value, Monte Carlo risk, schedule-quality checks, the engineering MDR, the procurement tracker and change/claims analysis. Everything is connected, so a timesheet hour or a vendor's revised delivery date flows straight through to the schedule, the S-curve and the portfolio dashboard.

> Working name "Keel" (the backbone of a vessel). Check the trademark before you launch — see [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md#step-2--protect-the-ip-and-the-name).

---

## Try it in 30 seconds

**Option A — no install at all.** Open `dist/keel-demo.html` in any modern browser (build it with `npm run build:demo` if it isn't there). The whole application runs in the browser with the demo portfolio, saved on your device.

**Option B — run the server** (Node.js 18 or later, no dependencies to install):

```bash
cd keel
npm start            # http://localhost:8080
```

The first start loads a demo portfolio. Sign in with any of these (password `keel-demo-2026`):

| Account | Role | What to try |
|---|---|---|
| `pm@demo.keel` | Project Manager | Portfolio dashboard, approve timesheets, project intelligence |
| `planner@demo.keel` | Planner / project controls | Gantt, activity editing, baselines, Monte Carlo, levelling, change impact |
| `engineer@demo.keel` | Team member | Book a week of hours, claim progress, submit |
| `admin@demo.keel` | Administrator | Users, calendars, backups |

These accounts and the shared password exist only for the demo. Don't deploy them anywhere real.

**Start a clean company workspace** (no demo data):

```bash
KEEL_ADMIN_EMAIL=you@company.com KEEL_ADMIN_PASSWORD='a-long-password' node server/index.js --blank --reset-demo
```

**Docker:**

```bash
docker build -t keel .
docker run -p 8080:8080 -v keel-data:/data keel
```

---

## What's inside

| Area | Capability |
|---|---|
| **Scheduling (CPM)** | FS/SS/FF/SF with leads and lags · multiple calendars (office, 6-day yard, 7-day × 12 h offshore) · P6 constraints (SNET, SNLT, FNET, FNLT, MSO, MFO, ALAP) · data date with retained logic or progress override · milestones, level-of-effort · total/free float, longest path, loop detection · **"Why these dates?"**, which names the driving predecessor or constraint |
| **Gantt** | WBS roll-ups, critical path, baseline bars, % complete, logic links, data-date line, filters (critical, longest path, 3-week look-ahead, behind baseline, negative float), week/month/quarter zoom, CSV export |
| **Progress** | Physical %, duration %, weighted steps (rules of credit), units % (hours burned), or **driven by the MDR / PO register** · weekly progress-update sheet · period close with history snapshots |
| **Weekly timesheets** | Grid booking against live activities · ★ assigned work first · copy last week / fill from assignments · claim % complete · submit → approve/return workflow · **approved hours set actual starts and progress automatically** · fatigue and Working Time Regulations checks (12 h/day, 84 h/week offshore, 48 h WTR) |
| **Resources** | Company pool with rates, capacity and rotations · cross-project weekly utilisation heatmap · per-resource histogram (actual vs forecast, this project vs others vs capacity) · **resource levelling that respects other projects' load**, names the bottleneck, and can apply its results as constraints |
| **Earned value** | PV/EV/AC, SV/CV, SPI/CPI, **SPI(t) earned schedule**, three EAC methods, TCPI, VAC · weekly S-curve with forecast · WBS breakdown |
| **Risk** | Register with 5×5 matrix · **Monte Carlo QSRA** (triangular / Beta-PERT, discrete risk events, 1,000+ iterations in about a second): P50/P80/P90, probability of meeting the target, criticality index, sensitivity tornado, risk ranking |
| **Schedule quality** | **DCMA 14-point assessment**, live, including the automated critical-path test, CPLI and BEI · click through to offending activities |
| **Engineering MDR** | Deliverables with IFR/IFA/IFC stages, rules of credit, overdue tracking, discipline roll-up |
| **Procurement** | PO milestone tracking (MR → PO → VDA → FAT → RFS → DEL) · **ROS read live from the schedule**: amber when delivery misses the planned need date, red when it consumes total float and moves the finish |
| **Changes & claims** | Change register · **time impact analysis**: insert a fragnet into a copy of the live logic and measure completion delay *and* float erosion against hard constraints such as shutdown windows |
| **Portfolio** | RAG across projects, forecast vs baseline vs contractual date, top issues from every project |
| **Project intelligence** | Auto-generated weekly-report sentences: driving path, slippage, SPI/CPI trends, POs late to ROS, overdue documents, unresourced look-ahead work, missing timesheets, fatigue breaches |
| **Interoperability** | **Import Primavera P6 XER** and **MS Project XML** · export MS Project XML (which P6 also imports) and CSV · full JSON backup |
| **What-if** | Copy any project into a scenario sandbox for recovery planning |
| **Governance** | Roles (admin / PM / planner / member) · audit trail of every change · baselines · scrypt-hashed passwords · session expiry · login throttling · strict CSP |

For the feature-by-feature comparison with P6 and MS Project, including where they are still ahead, see [docs/FEATURES.md](docs/FEATURES.md).

---

## Documentation

| Document | For |
|---|---|
| [docs/USE_CASES.md](docs/USE_CASES.md) | Real EPC scenarios, step by step, by role |
| [docs/IMPLEMENTATION_PLAYBOOK.md](docs/IMPLEMENTATION_PLAYBOOK.md) | Rolling Keel out across live projects: pilot, coding standards, weekly cycle, adoption KPIs |
| [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md) | Turning Keel into a product: IP, company, pricing, launch plan, sales, financial model |
| [docs/FEATURES.md](docs/FEATURES.md) | Comparison with P6 / MS Project, and the honest gap list |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code structure, data model, security, how to scale to SaaS |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What to build next, in priority order |

---

## Development

```bash
npm test             # 22 tests: CPM engine, service rules, importers, HTTP server
npm run dev          # auto-restart on change
npm run build:demo   # single-file offline demo → dist/keel-demo.html (needs `npm install` once for esbuild)
```

```
keel/
├── server/          Node HTTP server, auth, JSON store (zero dependencies)
├── public/
│   ├── core/        Domain engine shared by server AND browser
│   │   ├── cpm.js        Critical path scheduling
│   │   ├── calendar.js   Working-time calendars
│   │   ├── evm.js        Earned value & earned schedule
│   │   ├── montecarlo.js Quantitative schedule risk analysis
│   │   ├── dcma.js       DCMA 14-point assessment
│   │   ├── levelling.js  Resource levelling
│   │   ├── resources.js  Utilisation, histograms, timesheet compliance
│   │   ├── registers.js  MDR, procurement/ROS, time impact analysis
│   │   ├── analysis.js   KPIs, RAG and project intelligence
│   │   ├── xer.js        Primavera P6 import
│   │   ├── mspxml.js     MS Project XML import/export
│   │   ├── service.js    All API routes and business rules
│   │   └── seed.js       Demo portfolio
│   └── app/         Single-page UI (vanilla JS, SVG charts, no framework)
├── test/            node:test suites
├── samples/         Sample P6 XER file for testing the importer
└── docs/            Product, rollout and business documentation
```

## Licence

Proprietary — all rights reserved. Before you commercialise, read the IP section of the go-to-market plan.
