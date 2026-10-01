# Product Roadmap

Ordered by what unlocks revenue soonest. Each phase is sized for one senior developer plus you as product owner.

## Shipped — v1.0 (this release)
CPM engine with calendars, constraints and progress · Gantt · WBS · baselines · weekly timesheets with approval, fatigue checks and auto-progress · cross-project utilisation · levelling with bottleneck detection · EVM + earned schedule · Monte Carlo QSRA · DCMA 14-point · MDR · procurement ROS · change TIA with float erosion · portfolio RAG · project intelligence · P6 XER / MSP XML import · MSP XML / CSV export · what-if scenarios · roles and audit · browser demo build · Docker.

## Phase 1 — Enterprise must-haves (months 1–3)
1. **SSO** (OIDC: Microsoft Entra ID, Okta) + MFA
2. **Native XER export** for client P6 submissions
3. **PDF export**: A3 Gantt with title block and legend; monthly report pack
4. **Activity codes & user-defined fields**, with filters and grouping by code
5. **Timesheet reminders** by email / Teams (Friday reminder, Monday chase, approver digest)
6. **Notes / attachments** on activities, risks and changes
7. Password reset flow and user self-service

## Phase 2 — Scale & SaaS (months 4–6)
1. **PostgreSQL** repository layer + **multi-tenancy**
2. **Concurrency control**: record versions, project edit locks
3. Large-programme performance: virtualised Gantt, server-side filtering, worker-thread scheduling
4. Saved layouts and filters per user
5. Advanced levelling: priorities, levelling within float only, resource curves
6. **Public REST API with API keys** + webhooks (timesheet approved, period closed)
7. Inter-project relationships (programme-level logic)

## Phase 3 — Differentiation (months 7–12)
1. **AI copilot**: ask "why did the finish move 9 days since last month?", draft the monthly report narrative, suggest missing logic, propose recovery options. Built on the existing deterministic insights and an LLM API, with the CPM engine as the source of truth.
2. **Mobile field progress app**: offline step / quantity progress with photos for site and offshore supervisors
3. **Quantities & productivity**: installed quantities (m of pipe, t of steel, cable m) vs norms → performance factors feeding forecasts
4. **Integrations**: ERP (SAP / Dynamics) for actual cost, document control (Aconex, Assai, SharePoint) for MDR dates, Power BI connector
5. **Systems completion**: systems / subsystems, ITRs, punch lists A / B, MC and RFSU certificates
6. **Schedule comparison**: baseline vs update vs update, with an automatic change log of logic and duration edits (claims evidence)
7. Contract module: NEC4 early warnings and compensation-event clock, FIDIC notices

## Ideas backlog
Cost loading by cost account / CBS · multi-currency per package · cash-flow and invoicing forecasts · client portal (read-only dashboards) · ISO 27001 controls evidence export · Gantt drag-to-reschedule · resource skills matrix and certifications (BOSIET, OPITO) with expiry alerts for offshore mobilisation.
