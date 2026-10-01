# Implementation Playbook — rolling Keel out across live projects

This is how to put Keel to work on real projects: first inside your own consultancy, then at client sites once you sell it. It's written from a programme manager's point of view. Most project-controls tools fail on the **operating rhythm**, not on the software. People stop booking time, planners keep a shadow P6, and the data rots. This playbook is designed to stop that happening.

---

## Phase 0 — Prepare (weeks 1–2)

### 0.1 Decide the operating model
| Decision | Recommendation |
|---|---|
| Hosting | Start with a single company server (an Azure UK South VM or an on-prem VM) running the Docker image, plus daily off-site backups. Use the browser demo only for demos. |
| Who owns Keel | A **Project Controls Lead** (owner of standards and data quality), plus an IT contact for hosting, backups and accounts. |
| Timesheet policy | Everyone books weekly. Submit by **Monday 10:00** for the previous week; PMs approve by **Tuesday 17:00**. The period closes on **Wednesday**. |
| Hours scope | Book all hours, including leave, training and overhead, so utilisation is real. Use non-project categories for non-chargeable time. |
| Progress rule | Planners own % complete. Engineers may *claim* % on timesheets, but approval by the PM is the control point. |

### 0.2 Set up the system (half a day)
1. Start a clean workspace (`--blank`) with your admin account (see README).
2. **Administration → Organisation:** company name and currency.
3. **Administration → Calendars:** UK office 5-day with your region's bank holidays, yard 6-day, offshore 7-day × 12 h, site 5-day × 10 h.
4. **Resources → + Resource:** every person, plus crews and major plant. Enter the cost rate (fully loaded internal rate, or charge-out rate if you report on that basis), the calendar, and the rotation for offshore staff. Set `maxHoursPerDay` as the levelling ceiling.
5. **Administration → Users:** create a login for each person and **link it to their resource**. Without the link they can't book time.
6. Before it holds real data: put HTTPS in front of it (a reverse proxy or Azure App Gateway), schedule backups of the `/data` volume, and restrict network access (company VPN or IP allow-list) until SSO is available.

### 0.3 Coding standards (write these down once; they make everything else work)
| Item | Standard |
|---|---|
| Project code | `CLIENT-SCOPE`, e.g. `NNS-GCM`, max 12 characters |
| WBS level 1 | PM · E (Engineering) · P (Procurement) · C / F / I (Construction / Fabrication / Installation) · CS (Commissioning & Handover) |
| WBS level 2 | Discipline (E), package (P), area / system (C) |
| Activity ID | Prefix + 4 digits in steps of 10 (A1010, A1020…) so you can insert work later |
| Phase field | Always set (PM / E / P / C / CS). The overview's phase progress depends on it. |
| Durations | Working days. Activities ≤ 44 days (DCMA #8): split longer ones. |
| Logic | Every activity has a predecessor and a successor (DCMA #1). FS by default; lags only when you can explain them. |
| Constraints | Only for real external dates: shutdowns, DNO slots, client free-issue dates. Record the reason in Notes. |
| Progress method | Engineering → *Linked MDR register*; procurement → physical or *register*; fabrication / installation → *weighted steps*; management → LOE |
| Baselines | Rev 0 at contract award. New revision only for approved change. Name them `Rev N — <reason>`. |

---

## Phase 1 — Pilot on one live project (weeks 3–8)

**Choose the pilot carefully:** a live project, 3–12 months remaining, a willing PM, 10–30 people, not in crisis. The demo's H2-FEED or a FEED / detailed design job is ideal. Engineering-heavy work generates timesheets fast.

| Week | Activities | Exit criterion |
|---|---|---|
| 3 | Import the current P6 / MSP programme (**Projects → Import**). Run **Schedule quality** and fix the worst issues. Assign resources and budget hours. Capture **Rev 0** baseline. | Keel's finish date reconciles with P6's (±2 days, or the difference is explained) |
| 3 | Train the project team (60 min): booking time, the ★ list, submitting, claims. Train the PM (60 min): approvals, overview, intelligence. Train the planner (half a day): everything. | Everyone has logged in once |
| 4 | **First timesheet week.** Controls Lead chases personally. | ≥ 90% submitted by Monday 10:00 |
| 4–8 | Weekly rhythm (below). Run P6 in parallel only for the client's formal monthly submission. | Four consecutive weeks with ≥ 95% submission and approval by Tuesday |
| 6 | Load the MDR and procurement packages. Switch engineering activities to the register method. | Engineering progress no longer typed by hand |
| 8 | First **monthly report** produced from Keel. **Close period.** Pilot retrospective. | PM signs off: "the Keel report is the report" |

### The weekly operating rhythm (the heart of it)

| When | Who | Action in Keel |
|---|---|---|
| Fri / Mon 10:00 | Everyone | **My timesheet** → submit the previous week |
| Mon | Controls Lead | **Approvals** → chase the "not yet submitted" list |
| Mon–Tue | PM | **Approvals** → approve / return. Actual starts and claims post to the schedule automatically. |
| Tue | Planner | **Schedule → Progress update** (actuals, remaining durations), steps, MDR and PO dates. Review **"Why these dates?"** on anything that moved. |
| Wed | Planner + PM (30 min) | **Overview → Project intelligence**, critical path, negative float, POs late to ROS, 3-week look-ahead filter. Agree actions. |
| Wed | PM | Update the risk register. Run **QSRA** monthly or after a major change. |
| Month end | Planner | **Close period**, export or print the report, update the baseline only for approved change |
| Any time | PM / Planner | Raise **Changes** with a fragnet and run the impact the same week (NEC4 / FIDIC notice periods are short) |

---

## Phase 2 — Roll out to all projects (months 3–6)

1. **Cohorts of 2–3 projects per fortnight.** Don't migrate everything in one weekend.
2. Each new project: import → quality check → resources → baseline → team training → first timesheet week chased personally.
3. Company-wide timesheets go live when ≥ 70% of staff are on Keel projects. Overhead, leave and bids use the non-project categories.
4. Turn on the **portfolio review**: a monthly 60-minute meeting with directors, run from the **Portfolio** page and **Resources → Utilisation**.
5. Retire the parallel spreadsheets (timesheet workbook, MDR, procurement tracker) one by one. Announce the date and archive them read-only.
6. Keep P6 / MSP licences only where a client contract requires native files, until XER export ships.

## Phase 3 — Optimise (month 6 onwards)

- Use 6+ months of actual hours to **calibrate norms** (hours per P&ID, per isometric, per tonne of steel) for future estimates and three-point ranges.
- Use QSRA routinely at bid stage (UC1).
- Use utilisation history for hiring and bid / no-bid decisions.
- Extend to client projects where you provide project-controls services. This is the bridge to selling Keel.

---

## Adoption KPIs (track monthly, in the Controls Lead's report)

| KPI | Target | Where to see it |
|---|---|---|
| Timesheets submitted on time | ≥ 95% | Approvals → not-yet-submitted list |
| Timesheets approved within 48 h | ≥ 95% | Audit log (submit → approve timestamps) |
| Projects with an active baseline | 100% | Projects list / Baselines tab |
| DCMA score on live projects | ≥ 85% | Schedule quality tab |
| Activities with resources or cost loaded | ≥ 95% | DCMA check #10 |
| Engineering progress from the MDR (not manual %) | ≥ 80% of E activities | Activity progress method |
| Monthly report produced from Keel | 100% of projects | PM sign-off |
| Spreadsheets retired | Timesheets, MDR, PO tracker | Controls Lead |

## Common failure modes and how to prevent them

| Failure | Prevention |
|---|---|
| Engineers book everything to one "general" activity | Keep activities at deliverable level; PMs **return** sheets booked to the wrong place in the first month |
| Planners keep a "real" P6 alongside | Keel is the master from the pilot's week 8; P6 only receives exports |
| PMs approve without looking | The fatigue / WTR flags and claims make review meaningful; audit approvals monthly |
| Rates are wrong, so EVM is wrong | Controls Lead owns the rate table; update it at each pay review |
| Too many constraints, so the CPM means nothing | DCMA #5 ≤ 5%; reason in Notes is mandatory |
| Data loss | Daily volume backup + **Administration → Organisation & data → Download full backup** before every upgrade |

## Training plan

| Audience | Duration | Content |
|---|---|---|
| All staff | 30 min + 1-page guide | Login, My timesheet, ★ assignments, claims, submit / recall, fatigue checks |
| PMs | 60 min | Approvals, portfolio, overview, intelligence, risk register, changes |
| Planners / controls | 1 day | Import, WBS / coding, logic, constraints, calendars, progress methods, baselines, EVM, QSRA, DCMA, levelling, TIA, exports |
| Directors | 30 min | Portfolio page, utilisation heatmap, reading SPI / CPI / P80 |

Use the demo (`dist/keel-demo.html`) for training. Everyone gets a private sandbox in their browser, and **Reset demo data** starts it again.
