# Keel — Use Cases for EPC Delivery

Twelve real situations from EPC and EPCM projects, from bid through handover. Each one shows who does what in Keel and what it replaces. The demo portfolio (`npm start`) contains every example, so you can walk a prospect or a new team member through them live.

**Demo portfolio**

| Code | Project | Why it's in the demo |
|---|---|---|
| NNS-GCM | 12 MW gas compression module, brownfield, Northern North Sea (EPCI lump sum, £18.5M) | Long-lead compressor slipping against a fixed offshore shutdown window |
| ABD-SOL | 40 MWp solar + 20 MW BESS, Aberdeenshire (EPC, FIDIC Silver, £31.2M) | Vendor forecasts later than the schedule assumes; DNO-driven change; crew over-allocation |
| H2-FEED | 10 MW green hydrogen FEED, Aberdeen (reimbursable, capped) | Engineering-only, hours against a cap, MDR-driven progress |

**People**

| Persona | Role in Keel | Uses Keel to… |
|---|---|---|
| Programme / Project Manager | `pm` | run the portfolio review, approve timesheets, decide recovery, report to the client |
| Planner / Project Controls | `planner` | build and maintain the schedule, baselines, EVM, risk, MDR, procurement, changes |
| Engineer / Discipline Lead | `member` | book weekly hours, claim progress, see what's coming in the look-ahead |
| Construction / Offshore Manager | `member` or `pm` | look-ahead, crew loading, fatigue compliance, rotation planning |
| Director / Head of Projects | `pm` / `admin` | portfolio health, resource bench, bid / no-bid capacity decisions |

---

## UC1 — Bid stage: build a credible, risk-based programme in a day

**Trigger:** an ITT arrives with the client's Level 1 schedule as a P6 XER and a six-week tender period.

1. **Projects → Import P6 / MS Project** and select the client's `.xer`. WBS, activities, logic, lags, calendars and constraints come across. Keel recalculates; compare the finish date with the client's.
2. Open **Schedule quality**. The DCMA check exposes open ends, hard constraints and high-float activities in the client's logic. Each one is a clarification question for the tender.
3. Add your own execution activities (**+ Activity**), assign resources from the pool, and set three-point estimates on the uncertain items (vendor lead times, offshore campaigns).
4. **Risk & QSRA:** enter the tender risk register and link each risk to the activities it would hit. Run 1,000 iterations.
5. Read off **P50 / P80**. Bid a P80 completion, and price time-related contingency from the P50–P80 spread.
6. **Baselines & export → Capture baseline** "Tender Rev A".

**Replaces:** P6 plus Primavera Risk Analysis or Safran Risk, plus an Acumen licence, and two days of planner time.
**Value:** a defendable completion date and contingency in the bid, and a documented basis of schedule.

---

## UC2 — The weekly timesheet cycle (every week, every person)

**Trigger:** Friday afternoon / Monday morning.

1. An engineer opens **My timesheet**. Their assigned activities are starred. **Fill from my assignments** adds them; **Copy last week** repeats a routine pattern.
2. They enter hours per day, and optionally a **claimed % complete** for activities measured physically.
3. Live **checks** flag a day over 12 h, a week over 84 h offshore or 48 h onshore without a WTR opt-out, no rest day, and hours booked to overhead.
4. **Submit for approval.** The sheet locks.
5. The PM opens **Approvals**, reviews lines and flags, then **Approves** (or **Returns** with a reason). **Approve all without critical flags** clears routine sheets in seconds.
6. On approval Keel automatically:
   - sets the **actual start** of any activity booked for the first time,
   - applies **claimed progress** (and actual finish at 100%),
   - posts **actual cost** (hours × rate) into earned value,
   - updates the cross-project **utilisation heatmap**.
7. **Approvals** also lists who hasn't submitted last week, so the PM can chase them before the period closes.

**Replaces:** a separate timesheet system or Excel, re-keying into P6, and chasing progress by email.
**Value:** actual cost and progress are current every Monday; nobody types the same data twice.

---

## UC3 — Weekly progress and monthly period close

1. Planner: **Schedule → Progress update** lists everything in progress or due to start in the next two weeks. Enter actual dates, %, and remaining duration in one sheet.
2. Steps-based activities (fabrication, for example) are updated in the activity panel. Ticking a step earns its weight.
3. **Overview** shows the refreshed S-curve (PV / EV / AC / forecast), SPI, SPI(t), CPI and EAC, plus **Project intelligence**: the weekly-report sentences, already written.
4. At month end: **Close period** snapshots the KPIs into the project history and moves the data date forward.
5. **Baselines & export → Print / PDF report** produces the client monthly progress report. **S-curve CSV** feeds the client's template if they insist on their own.

**Value:** month-end reporting drops from about two days to about two hours, and the history shows SPI/CPI trends without anyone maintaining a spreadsheet.

---

## UC4 — Engineering progress measured from the MDR, not opinions

**Demo:** NNS-GCM and H2-FEED → **Engineering MDR**

1. Load the Master Deliverables Register: document number, discipline, weight (budget hours), and planned dates for each stage (Started → IDC → IFR → IFA → IFC).
2. Document control records actual issue dates. Progress follows the **rules of credit** (10 / 25 / 50 / 70 / 100%).
3. Set engineering activities to the progress method **Linked MDR / PO register**. Their earned value now comes from the documents issued, not from "how far do you think you are?".
4. Overdue next issues show in red, with days late, by discipline. Project intelligence lists them every week.

**Value:** objective engineering progress the client's auditor accepts, and early warning of the slipping discipline.

---

## UC5 — A long-lead package slips (the most common EPC crisis)

**Demo:** NNS-GCM → **Procurement**: PKG-01, the gas compressor package.

1. The expeditor visits the vendor, who now forecasts FAT about five weeks later. The expeditor enters the new **forecast** dates on the PO.
2. Keel compares the forecast delivery with the **ROS date read live from the schedule** (the start of A3020, setting the compressor on the module).
   - **Amber:** the delivery misses the planned need date but stays within float.
   - **Red:** the delivery is beyond the activity's late start, so the finish date or a hard window is hit.
3. **Overview → Project intelligence** raises it immediately: *"PKG-01 forecast 37 days after ROS… expedite or resequence."*
4. The planner creates a **what-if copy** (**Baselines & export → Create what-if copy**) and tests options: pre-install piping around the compressor footprint, a night shift in the yard, air freight. In each scenario they update the logic and durations and watch the finish date and negative float.
5. The PM takes the best option to the client with evidence.

**Replaces:** a procurement tracker in Excel that nobody links to the schedule.
**Value:** weeks of earlier warning, and a recovery plan backed by numbers.

---

## UC6 — Protecting a fixed shutdown / campaign window

**Demo:** NNS-GCM, activity A4020 "Shutdown tie-ins & hook-up" carries a **Mandatory Start** of 12-Apr-27 (the platform's planned shutdown).

1. Because the window is fixed, slippage upstream doesn't move the finish. It shows as **negative float** on everything feeding the window. The portfolio turns **red**.
2. Project intelligence explains it: *"Driven by hard constraint A4020 (MSO 12-Apr-27) — the work feeding it is 20 days late for that window."*
3. **Schedule → filter "Negative float"** lists exactly what has to be recovered, in order.
4. **Risk & QSRA** shows the probability of making the window, and which risks drive the miss (here, the compressor FAT re-test).

**Value:** you know months ahead whether you'll make the window, instead of finding out in the last fortnight. Missing an offshore shutdown can mean waiting for the next one, often a year away, with deferred production on top.

---

## UC7 — Client variation or extension-of-time claim (NEC4 / FIDIC)

**Demo:** NNS-GCM **Changes → CO-001** (fuel gas skid); ABD-SOL **CO-101** (DNO intertrip panel).

1. Raise the change: reference, description, cost.
2. Build the **fragnet**: the new activities this change introduces, their durations, what they follow and what they must precede.
3. **Save & run impact.** Keel inserts the fragnet into a copy of the live logic and reports:
   - the delay to completion in working and calendar days (CO-101: **+16 working days**),
   - the **float erosion** against hard constraints (CO-001: completion held by the shutdown MSO, but **23 days of float lost** — the real impact),
   - the existing activities that move.
4. Attach the result to the NEC4 compensation-event quotation (clause 62 requires the programme impact) or the FIDIC 20.2 notice. Status moves draft → submitted → approved, and the register totals approved and pending values.

**Value:** contemporaneous, logic-based delay evidence in minutes, the thing that wins or loses EOT claims.

---

## UC8 — Who is free next month? Resource planning across the portfolio

**Demo:** **Resources → Utilisation**

1. The heatmap shows every person and crew, week by week. Past weeks use timesheet actuals; future weeks use remaining forecast from every live schedule.
2. Red-ringed cells marked **!** are over capacity. In the demo the planner is at 163% in week 40 because of three projects. The tooltip splits the load by project.
3. The "under-used next 4 weeks" card lists the bench. That's who goes on the next bid, or gets loaned to a struggling project.
4. In a project's **Resources** tab, **Run levelling analysis** with "include load from other projects" shows the realistic finish given everyone's other commitments, and names the bottleneck (ABD-SOL: the solar install crew → add a second crew).
5. Offshore staff carry their rotation (2/3, 3/3), and fatigue rules apply to their timesheets.

**Value:** bid / no-bid and hiring decisions based on real loading, not on the loudest PM.

---

## UC9 — Schedule quality gate before baseline submission

1. Before you submit a baseline to the client, open **Schedule quality**.
2. Work through failing checks. Click any offending activity and it opens in the editor with the "why these dates?" explanation.
3. Target 12/14 or better. Missed-tasks and BEI need a previous baseline. CPLI needs a must-finish date.
4. Capture the baseline and send it to the client as MS Project XML or CSV.

**Value:** fewer rejected baseline submissions and fewer rounds of client planning comments.

---

## UC10 — The client mandates P6 submissions

1. Plan and control in Keel.
2. Monthly: **Baselines & export → MS Project XML**. Primavera P6 imports it via File → Import → Microsoft Project, and so does MS Project.
3. When the client sends their master schedule as XER, **import** it as a separate reference project to check interfaces and key dates.

**Value:** you keep Keel's integration benefits without breaking contractual reporting requirements. (Native XER export is on the roadmap.)

---

## UC11 — Renewables EPC: solar + BESS with grid-driven dates

**Demo:** ABD-SOL

- The DNO energisation milestone has a **Finish-On-or-After** constraint (the DNO witness slot).
- **Procurement** shows the grid transformer (PV-04) and BESS containers (PV-03) forecast after ROS, a classic renewables supply-chain issue. It's visible before the schedule has been updated.
- **Resources:** levelling exposes that the solar install crew can't run piling, module installation and cabling in parallel at the planned rate, so the planner adds a second crew in the what-if.
- **Changes → CO-101:** the DNO's new intertrip requirement delays energisation by about 16 working days. That is the evidence for the change request.

---

## UC12 — Reimbursable FEED: hours against a cap, and invoicing

**Demo:** H2-FEED

1. Timesheets capture every hour by activity. **Hours reports** gives the project × week matrix with cost.
2. Earned value shows whether you're burning hours faster than you earn (CPI). Project intelligence warns when *"hours burned exceed % earned"*.
3. At month end, export the **CSV** (resource, project, week, hours, cost) as the backing sheet for the T&M invoice.
4. The **Class 3 estimate** and **EPC execution plan** activities leave a schedule ready to become the EPC baseline if you win the next phase.

---

## Summary: what Keel replaces in a typical mid-size EPC consultancy

| Today | With Keel |
|---|---|
| P6 or MS Project licences | Scheduling built in |
| Timesheet system or Excel, re-keyed into P6 | Timesheets drive actuals automatically |
| Primavera Risk Analysis / Safran Risk | Monte Carlo built in |
| Acumen Fuse for DCMA | Quality check built in |
| Excel MDR | MDR linked to progress |
| Excel procurement tracker | ROS read live from the schedule |
| Manual TIA (copy, paste, compare) | One-click fragnet impact |
| PowerPoint / Excel monthly report | Live dashboard and auto-written insights |
