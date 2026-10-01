# Go-to-Market Plan — launching Keel as a commercial product

The aim is to make Keel your consultancy's USP (it delivers better project controls on your own projects) and then a revenue line (selling it to other EPC contractors and consultancies). Step by step, from today to paying customers.

> **Before anything else, read Step 1.** Software you create while employed may legally belong to your employer. Sort this out before you invest more time or talk to customers.

> Figures for grants, tax reliefs, competitor prices and event dates below are indicative as of late 2026. Verify each with the source before you rely on it.

---

## The 12-month plan at a glance

| Quarter | Goal | Gate to pass before moving on |
|---|---|---|
| **Q1** (months 1–3) | Legal and IP clear · name secured · internal pilot live | Written IP position · trademark filed · pilot hits the adoption KPIs |
| **Q2** (months 4–6) | Enterprise-ready product · 3 design partners | SSO + PostgreSQL + multi-tenant shipped · pen test passed · Cyber Essentials Plus |
| **Q3** (months 7–9) | Public launch · first 5 paying customers | 3 referenceable case studies with measured results |
| **Q4** (months 10–12) | Repeatable sales · first channel partner | £150k–£250k ARR pipeline, under 3% monthly churn |

---

## Step 1 — Establish who owns the IP (week 1)

Under UK law, copyright in software an employee writes **in the course of employment** belongs to the employer (Copyright, Designs and Patents Act 1988, s.11(2)), and many employment contracts go further. You are a Project Manager at an EPC consultancy, so there are three possible situations:

| Situation | What to do |
|---|---|
| **You own or run the consultancy** | The company owns Keel. Decide whether to keep it in-house as a USP or spin it out into a separate product company (Step 3). |
| **You're an employee and want the consultancy to own it** (internal USP, product line) | Propose it formally to the directors as an internal venture. Negotiate your role: product lead, a revenue share or equity in a spin-out. Get it in writing. |
| **You're an employee and want to own it yourself** | Check your contract's IP and moonlighting clauses. Get a **written IP waiver or assignment** from your employer before going further. Don't use company time, equipment, data or client information. |

**Action:** book one hour with an IP or commercial solicitor (many Aberdeen firms offer fixed-fee start-up sessions) and bring your employment contract. Budget £300–£1,000.

Keep the demo data fictional, as it is now. Never load real client schedules into a public demo.

---

## Step 2 — Protect the IP and the name (weeks 1–4)

1. **Name.** "Keel" is a working name and there are existing software products using it. Search the [UK IPO trade mark register](https://trademarks.ipo.gov.uk) (classes 9 and 42), the EUIPO, and Companies House. Shortlist 3–5 alternatives and check the `.com` / `.co.uk` domains. File a UK trade mark in classes 9 and 42 (about £170–£250 online).
2. **Copyright and confidentiality.** Keep the repository private. Put a proprietary licence header in the code (the package is already `UNLICENSED`). Use NDAs with design partners.
3. **Trade secrets over patents.** Software methods are hard to patent in the UK. Your moat is the integrated EPC workflow, domain know-how and speed, not a patent.
4. **Contributors.** Anyone who writes code for you signs an IP assignment, including contractors and friends.

---

## Step 3 — Choose the corporate structure (month 1–2)

| Option | Pros | Cons |
|---|---|---|
| **Product line inside the consultancy** | Fastest; uses existing clients, brand and cash; clear USP | Software and services economics mix; harder to raise investment or sell separately |
| **Separate Ltd (spin-out), consultancy holds equity** *(recommended once there are paying customers)* | Ring-fences liability; can raise SEIS/EIS investment; sellable asset; clean cap table | Admin, intercompany agreements, transfer pricing |

Things to check with an accountant:
- **R&D tax relief** (the merged RDEC scheme, or ERIS for R&D-intensive SMEs) can recover a meaningful share of development cost.
- **SEIS / EIS** make angel investment in a new Ltd far more attractive to investors.
- **Grants and support in Scotland / Aberdeen:** Scottish Enterprise (innovation grants, SMART-type feasibility funding), Innovate UK Smart grants, the **Net Zero Technology Centre** (Aberdeen), the **Energy Transition Zone**, **Opportunity North East (ONE)** tech and digital programmes, and Business Gateway for start-up support. Positioning Keel as *energy-transition project delivery* tooling (hydrogen, CCS, offshore wind, electrification) fits these programmes' themes.

---

## Step 4 — Make the product enterprise-ready (months 2–6)

Today's Keel is a complete, working product for a single company on one server. Before you sell to other companies, close these gaps. They're what an operator's IT and procurement teams will ask about.

| Must-have | Why buyers require it | Effort (1 senior developer) |
|---|---|---|
| **SSO (Microsoft Entra ID / OIDC) + MFA** | Every operator and contractor IT team asks first | 2–3 weeks |
| **PostgreSQL storage + multi-tenancy** (one database schema per customer, or row-level tenancy) | Scale, isolation, SaaS economics | 4–6 weeks (the service layer is already storage-agnostic) |
| **Record locking / concurrency** for multi-planner editing | Several planners on one programme | 2 weeks |
| **Native XER export** | Clients mandate P6 submissions | 2–3 weeks |
| **PDF Gantt / report export** (A3, title block) | Contractual programme submissions | 2 weeks |
| **Activity codes & user-defined fields, saved layouts** | Planners expect P6-style flexibility | 3 weeks |
| **Penetration test** (CREST-accredited) + fixes | Security questionnaire | £4k–£8k + 1–2 weeks |
| **Cyber Essentials Plus** | Commonly required in UK energy supply chains | £1.5k–£3k |
| **UK GDPR**: privacy notice, DPA template, ICO registration, data retention for timesheets | Timesheets are personal data | 1 week + legal review |
| **UK hosting** (Azure UK South / AWS London), backups, DR, 99.5% SLA | Data residency and continuity | 1–2 weeks |
| **Terms of service, SLA, support policy** | Contracting | Solicitor, about £2k–£5k |
| ISO 27001 (plan for year 2) | Large operators, framework agreements | 6–12 months |

**Team:** you as product owner and domain expert, plus **one senior full-stack developer** (contract or co-founder with equity). Add a part-time customer-success / implementation planner from month 6. The codebase is deliberately simple (zero runtime dependencies, one shared engine), so a single good developer can own it.

---

## Step 5 — Prove it: internal pilot and design partners (months 1–6)

1. **Internal pilot** (see the [Implementation Playbook](IMPLEMENTATION_PLAYBOOK.md)). Measure the before / after numbers. They're your sales case:
   - planner hours per month-end report (target: −75%)
   - days from period end to client report (target: 5 → 1)
   - timesheet submission rate (target: ≥ 95%)
   - spreadsheets retired
   - early warnings caught (for example "PKG-01 37 days late to ROS", spotted N weeks earlier than before)
2. **Three design partners**: friendly EPC contractors or consultancies, ideally in different segments (brownfield oil & gas, renewables, hydrogen / CCS FEED). Offer free use for 3–6 months in exchange for weekly feedback, permission to publish a case study, and a discounted first-year contract.
3. **Advisory board** (optional, equity-based): one senior planner who knows P6 inside out, one operator-side project controls manager, one SaaS founder.

---

## Step 6 — Positioning and messaging

**Target customer (ICP):** EPC contractors, engineering consultancies and project-controls service firms with **5–250 project staff**, working in oil & gas brownfield, decommissioning, renewables, hydrogen, CCS and power networks. They currently juggle P6 or MSP, Excel timesheets, an Excel MDR and an Excel procurement tracker.

**Positioning statement:**
> For EPC project teams who are drowning in disconnected spreadsheets, **Keel** is the integrated project controls platform that connects scheduling, weekly timesheets, earned value, risk and delivery registers in one place. Unlike Primavera P6 or MS Project, Keel turns every approved timesheet and every vendor update into live schedule, cost and risk insight, and it still hands your client the P6 / MSP file their contract requires.

**Three messages:**
1. **One version of the truth.** Hours, progress, documents, POs, risks and the programme are all connected.
2. **See problems weeks earlier.** ROS slippage, float erosion against shutdown windows, fatigue breaches and over-allocation are flagged automatically.
3. **A fraction of the cost and the admin.** No P6 + Risk Analysis + Acumen + timesheet-system stack to license and maintain.

**15-minute demo script** (uses the demo data):
1. Portfolio: three projects, one red. Why? (1 min)
2. NNS-GCM Overview → Project intelligence: negative float against the shutdown MSO; compressor 37 days late to ROS. (2 min)
3. Procurement: ROS read live from the schedule. Explain amber vs red. (2 min)
4. Changes → CO-001 → *Save & run impact*: 23 days of float erosion, the claim evidence. (2 min)
5. Log in as the engineer: book a week, claim 30%, submit. Log in as the PM: approve. Back to the schedule: the actual start has appeared. (4 min)
6. Risk & QSRA: run 1,000 iterations, P80, probability of meeting the target. (2 min)
7. Resources → Utilisation heatmap: who's over-allocated next month. (1 min)
8. Close: "P6, Risk Analysis, Acumen, your timesheet tool and three spreadsheets, in one product." (1 min)

---

## Step 7 — Pricing and packaging

Price on value and keep it simple. Anchor against the stack Keel replaces, not against P6 alone.

| Plan | Who it's for | Price (indicative) | Includes |
|---|---|---|---|
| **Timesheet user** | Engineers, technicians, crews who only book time and see their look-ahead | **£8 / user / month** | My timesheet, claims, read-only project views |
| **Professional** | Planners, PMs, controls, directors | **£59 / user / month** (annual) | Everything: scheduling, EVM, QSRA, DCMA, MDR, procurement, changes, portfolio |
| **Enterprise** | 100+ users, SSO, private hosting or on-premise, SLA, integrations | From **£18k / year** | Dedicated instance, SSO, audit export, priority support, named CSM |
| **Services** | Migration, setup, training, managed project controls | £650–£850 / day, or fixed packages | P6 / MSP migration package (£3.5k per programme), "Controls-in-a-box" setup (£7.5k) |

**Worked example (a 60-person consultancy):** 45 timesheet users × £8 + 10 professional × £59 = **£950 / month (£11.4k / year)**. Compare that with the current stack: P6 seats plus annual support, a risk tool, a schedule-quality tool and a timesheet system. Prospects can usually show you their own spend. Use it in a simple ROI sheet alongside saved planner time (for example 2 days per month per project × 15 projects × £600 / day ≈ £216k / year).

Offer **annual billing with 2 months free** and **project-based licences** for single-project clients (for example £1,500 / month per live project, unlimited users).

---

## Step 8 — Sales and marketing channels

| Channel | Action | Cost |
|---|---|---|
| **Founder-led sales** in your own network (highest conversion) | List 50 target companies in Aberdeen / the North East and the wider UK energy supply chain. Personal outreach to project-controls managers and directors offering a 20-minute demo. | Time |
| **Your consultancy's clients** | Offer Keel-powered reporting as part of your services. It's a differentiator on bids and a foot in the door. | — |
| **LinkedIn thought leadership** | Weekly posts: "How we caught a 37-day ROS slip 6 weeks early", "DCMA 14-point explained", "Earned schedule vs SPI". Short screen-recorded demos. | Time |
| **Events** | SPE Offshore Europe (Aberdeen, odd-numbered years), All-Energy (Glasgow, annually), APM and PMI Scotland chapter events, ACostE (Association of Cost Engineers) meetings, Global Underwater Hub / OEUK supply-chain events. Give a talk, not just a stand. | £0–£5k per event |
| **Industry bodies and clusters** | ETZ, NZTC, ONE, Scottish Renewables, Hydrogen Scotland, DeepWind cluster: member directories, innovation showcases. | Membership fees |
| **Partners** | Project-controls consultancies and planning contractors resell or implement for a 20–30% margin. Later: Microsoft AppSource listing. | Margin share |
| **Free tools as lead magnets** | A free online **DCMA checker** (upload an XER, get a score) and a **QSRA calculator**. Both already exist in the engine. | Low |

**Sales process:** discovery call → tailored demo with their own (anonymised) XER imported → 30-day pilot on one project → commercial proposal → annual contract. Typical cycle: 4–10 weeks for consultancies, 3–9 months for operators.

---

## Step 9 — Launch sequence (month 7)

1. **T−6 weeks:** website (one page, demo video, pricing, "book a demo"), case studies from the design partners, security overview page.
2. **T−4 weeks:** pre-book 20 demos from your outreach list; brief partners.
3. **T−2 weeks:** publish the free DCMA checker; LinkedIn countdown series.
4. **Launch day:** announcement post plus a customer quote, a press note to Energy Voice and the Press & Journal business section, and the ETZ / ONE newsletters.
5. **T+2 weeks:** webinar, "Live: from P6 XER to risk-based recovery plan in 30 minutes".
6. **T+4 weeks:** review the funnel (visits → demos → pilots → contracts) and fix the weakest stage.

---

## Step 10 — Financial model (illustrative)

Every number is an assumption to test, not a forecast.

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Paying customers (end of year) | 8 | 30 | 75 |
| Average annual contract | £9k | £12k | £15k |
| **ARR (end of year)** | **£72k** | **£360k** | **£1.1M** |
| Services revenue | £40k | £120k | £250k |
| Team (FTE) | 2 (you + dev) | 4 | 8 |
| Operating cost | £170k | £380k | £750k |
| Result (simplified) | −£58k | +£100k | +£600k |

*Simplified: end-of-year ARR is used as a proxy for revenue. Recognised revenue will lag ARR in a growing business, so plan cash on a monthly model.*

**Funding the gap:** fund Year 1 from consultancy cash flow or services revenue, an Innovate UK / Scottish Enterprise grant, and R&D tax relief, or raise a small SEIS round (Step 3). Keep hosting lean. One Azure instance serves dozens of small tenants.

**SaaS metrics to track monthly:** ARR, new logos, net revenue retention (target > 110%), logo churn (< 1% per month), activation (≥ 95% timesheet submission within 30 days of go-live), demo → pilot → close conversion, CAC payback (< 12 months).

---

## Step 11 — Risks to the venture and mitigations

| Risk | Mitigation |
|---|---|
| IP dispute with employer | Step 1 before anything else |
| "Nobody got fired for buying P6" | Position as **alongside P6** first (import XER, export MSPDI); win on timesheets + EVM + registers; displace later |
| Security incident | Pen test, Cyber Essentials Plus, SSO / MFA, encryption, backups, least-privilege hosting from day one of SaaS |
| Key-person risk (one developer) | Clean simple codebase, tests, documentation (all in place); escrow for enterprise customers |
| Scope creep from custom requests | Public roadmap; configurable features (codes, UDFs) rather than one-off builds |
| Large vendors copy features | Speed, EPC domain depth, service quality and price; the integrated workflow is hard to bolt onto P6 |
| Underpricing services | Fixed-price packages with clear scope; day rates for everything else |

---

## Your next 10 actions

1. Book the IP / employment solicitor session (Step 1).
2. Run the trade mark and domain search; pick the final name.
3. Present Keel to your directors with this plan and a live demo.
4. Choose the internal pilot project and the Controls Lead.
5. Deploy Keel on a company server (README → Docker); set up calendars, resources and users.
6. Run the 6-week pilot (Implementation Playbook) and collect the before / after metrics.
7. Recruit a senior full-stack developer (contract or co-founder).
8. Start the enterprise-readiness backlog: SSO, PostgreSQL, XER export, PDF export (Roadmap Phase 1).
9. Line up three design partners from your network.
10. Apply for Cyber Essentials Plus and a pen test once SaaS hosting is live.
