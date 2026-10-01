# Keel vs Primavera P6 vs MS Project

Use this page to position Keel in a sale, and to decide what to build next. It's deliberately honest: a buyer's planning lead will know where P6 is strong, and overclaiming loses the deal.

**Legend:** ✅ built in · ◐ partial / basic · ➕ needs an add-on or another product · ✖ not available

## 1. Where Keel is ahead (the USP)

| Capability | Keel | Primavera P6 | MS Project |
|---|---|---|---|
| Weekly timesheets linked to schedule activities | ✅ grid, submit/approve, fatigue checks | ◐ P6 Team Member / Progress Reporter, clunky, separate licence | ◐ Project Online / Project for the web only |
| Approved hours set actual starts and progress automatically | ✅ | ◐ via timesheet approval into P6 (complex setup) | ✖ |
| Fatigue / Working Time Regulations checks on hours (offshore 12/84, WTR 48) | ✅ | ✖ | ✖ |
| Cross-project weekly utilisation heatmap (actual and forecast together) | ✅ | ◐ resource analysis views, slow; no timesheet actuals blend | ◐ resource pool, single machine |
| Levelling that respects other projects' committed load, and names the bottleneck | ✅ | ◐ levels across open projects only | ◐ |
| Earned value with **earned schedule SPI(t)** and three EAC methods | ✅ | ◐ EV fields; no earned schedule | ◐ basic EV fields |
| Monte Carlo schedule risk (QSRA) | ✅ built in, about a second | ➕ Primavera Risk Analysis / Safran Risk | ➕ add-ins |
| DCMA 14-point schedule quality check, live | ✅ including automated critical-path test, CPLI, BEI | ➕ Acumen Fuse / Schedule Analyzer | ➕ |
| "Why these dates?" — driving logic explained in plain English | ✅ | ◐ driving relationships flag; trace logic view | ◐ task path highlight |
| Engineering MDR with rules of credit feeding activity progress | ✅ | ✖ (spreadsheets or a separate document control system) | ✖ |
| Procurement tracker with ROS read live from the schedule | ✅ | ✖ | ✖ |
| Time impact analysis (fragnet → delay and float erosion) | ✅ one click | ◐ manual: copy project, insert fragnet, compare | ◐ manual |
| Rule-based project intelligence (weekly-report narrative) | ✅ | ✖ | ✖ |
| Portfolio RAG combining schedule, cost and procurement | ✅ | ◐ dashboards in P6 EPPM; configuration heavy | ✖ |
| Runs in a browser, offline demo, zero install | ✅ | ◐ P6 web (EPPM), heavy; Professional is desktop | ◐ Project for the web (reduced features) |
| Total cost for a 25-user consultancy | £ (see pricing) | £££ licences + add-ons + admin | ££ |

## 2. Where Keel is at parity (core scheduling)

| Capability | Keel | P6 | MSP |
|---|---|---|---|
| CPM with FS/SS/FF/SF, leads and lags | ✅ | ✅ | ✅ |
| Multiple calendars (project, activity, resource) | ✅ | ✅ | ✅ |
| Constraints SNET / SNLT / FNET / FNLT / MSO / MFO / ALAP | ✅ | ✅ | ✅ |
| Data date, retained logic / progress override | ✅ | ✅ | ◐ status date |
| Total & free float, longest path, loop detection | ✅ | ✅ | ◐ |
| Milestones, level-of-effort | ✅ | ✅ | ◐ (no true LOE) |
| WBS and summary roll-ups | ✅ | ✅ | ✅ |
| Multiple baselines, variance | ✅ | ✅ | ✅ (11 baselines) |
| Resource loading, histograms, rates, cost | ✅ | ✅ | ✅ |
| Activity steps / weighted milestones | ✅ | ✅ | ✖ |
| Import P6 XER | ✅ | ✅ | ✖ |
| Import / export MS Project XML | ✅ | ✅ | ✅ |
| Roles and audit trail | ✅ | ✅ | ◐ |

## 3. Where P6 / MS Project are still ahead — the honest gap list

Plan these into the roadmap. Raise them yourself in sales conversations with large owner-operators before their planning lead does.

| Gap | Why it matters | Plan |
|---|---|---|
| **Scale**: P6 runs 10,000–100,000-activity programmes and hundreds of concurrent users on Oracle/SQL Server | Major operators (EPCM, megaprojects) need it | Move storage to PostgreSQL, virtualise the Gantt, add server-side scheduling jobs (Roadmap Phase 2) |
| **Multi-user concurrent editing** with check-in/out and locking | Several planners on one programme | Optimistic locking with record versions; project-level edit locks (Phase 2) |
| **XER export** (P6's native format) | Many clients mandate XER submissions | Today: export MSPDI XML, which P6 imports. Build native XER export (Phase 1) |
| **Global change, user-defined fields, activity codes, filters/layouts** | Power users rely on them | Activity codes and UDFs (Phase 1), saved layouts (Phase 2) |
| **Advanced levelling options** (priorities, leveling within float, multiple passes) | Complex resource-constrained schedules | Extend the leveller (Phase 2) |
| **Enterprise structures**: EPS/OBS security, multiple currencies per project, cost accounts | Large organisations | Phase 2–3 |
| **Integrations**: ERP (SAP/Oracle), Primavera Unifier, document control (Aconex, Assai) | End-to-end data flow | Open REST API exists; build connectors (Phase 2–3) |
| **SSO** (Azure AD / Entra ID, Okta), MFA | Corporate IT requirement | OIDC sign-in (Phase 1 — must-have for enterprise sales) |
| **Track record**: P6 is the contractual standard; client planning specs cite it by name | Procurement risk for buyers | Win on "works alongside P6" first (import XER, hand back MSPDI), then displace |
| **Printing**: P6 layouts, page setup, A3 Gantt PDF | Clients still want printed programmes | PDF Gantt export (Phase 1) |

## 4. The real competitive landscape (not just P6 and MSP)

Buyers in Aberdeen and the wider UK EPC market will also compare against:

- **Asta Powerproject (Elecosoft)**: strong in UK construction and rail, good UI, offers a BIM link.
- **Oracle Primavera Cloud** and **Primavera Unifier**: Oracle's own cloud direction.
- **Deltek Acumen Fuse / Risk**: schedule quality and risk (an add-on to P6).
- **Safran Planner / Safran Risk**: popular with Norwegian and North Sea operators.
- **InEight**, **Hexagon EcoSys**, **Planisware**: enterprise project controls suites.
- **Smartsheet, Monday.com, Procore**: lightweight and collaboration tools, weak at CPM.
- **Excel**: the biggest competitor of all for timesheets, MDRs and procurement trackers.

**Keel's defensible position:** *the integrated project controls platform for small and mid-size EPC contractors and consultancies (5–250 project staff). It replaces P6 or MSP **plus** the timesheet system, the Excel MDR, the procurement tracker and the risk add-on, for less than a single P6 seat. It still hands clients an XER/XML when the contract requires one.*
