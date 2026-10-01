// Demo dataset: a realistic three-project EPC portfolio for an Aberdeen
// consultancy, progressed to a 28-Sep-2026 data date with 30 weeks of
// timesheets, an MDR, procurement tracker, risk register and change log.
// Fully deterministic (seeded PRNG) so demos and tests are repeatable.

import { toDay, fromDay, weekStartDay } from './dates.js';
import { buildCalendars } from './calendar.js';
import { schedule } from './cpm.js';
import { activityBudgets } from './evm.js';
import { mulberry32 } from './montecarlo.js';
import { DOC_STAGES, PO_STAGES } from './registers.js';
import { emptyDb } from './service.js';

export const DEMO_DATA_DATE = '2026-09-28';
export const DEMO_PASSWORD = 'keel-demo-2026';
export const DEMO_USERS = [
  { id: 'usr-admin', name: 'Alex Morgan', email: 'admin@demo.keel', role: 'admin', resourceId: null },
  { id: 'usr-pm', name: 'Priya Nair', email: 'pm@demo.keel', role: 'pm', resourceId: 'res-R01' },
  { id: 'usr-planner', name: 'Callum Reid', email: 'planner@demo.keel', role: 'planner', resourceId: 'res-R02' },
  { id: 'usr-eng', name: 'Fiona Grant', email: 'engineer@demo.keel', role: 'member', resourceId: 'res-R03' },
];

const SCOT_HOLIDAYS = [
  '2026-01-01', '2026-01-02', '2026-04-03', '2026-05-04', '2026-05-25', '2026-08-03', '2026-11-30', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-01-04', '2027-03-26', '2027-05-03', '2027-05-31', '2027-08-02', '2027-11-30', '2027-12-27', '2027-12-28',
];

const CALENDARS = [
  { id: 'default', name: 'UK Office 5-day (Scotland holidays)', workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: SCOT_HOLIDAYS },
  { id: 'cal-yard', name: 'Fabrication Yard 6-day x 10h', workDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 10, holidays: ['2026-12-25', '2026-12-28', '2027-01-01'] },
  { id: 'cal-offshore', name: 'Offshore 7-day x 12h', workDays: [0, 1, 2, 3, 4, 5, 6], hoursPerDay: 12, holidays: [] },
  { id: 'cal-site', name: 'Onshore Site 5-day x 10h', workDays: [1, 2, 3, 4, 5], hoursPerDay: 10, holidays: SCOT_HOLIDAYS },
];

// code, name, type, discipline, rate (GBP/h), extra
const RESOURCES = [
  ['R01', 'Priya Nair — Project Manager', 'labour', 'Project Management', 95],
  ['R02', 'Callum Reid — Senior Planner', 'labour', 'Project Controls', 78],
  ['R03', 'Fiona Grant — Lead Process Engineer', 'labour', 'Process', 88],
  ['R04', 'Tom Baxter — Process Engineer', 'labour', 'Process', 70],
  ['R05', 'Hamish Stewart — Lead Mechanical Engineer', 'labour', 'Mechanical', 86],
  ['R06', 'Ewan Clark — Piping Designer', 'labour', 'Piping', 62],
  ['R07', 'Mei Chen — Pipe Stress Engineer', 'labour', 'Piping', 74],
  ['R08', 'Olu Adeyemi — Lead Electrical Engineer', 'labour', 'Electrical', 84],
  ['R09', 'Sara Lindqvist — Instrument & Controls Engineer', 'labour', 'Instrumentation', 78],
  ['R10', 'David Munro — Structural Engineer', 'labour', 'Structural', 76],
  ['R11', 'Anna Kowalski — Procurement Lead', 'labour', 'Procurement', 72],
  ['R12', 'Ross McLeod — Expeditor', 'labour', 'Procurement', 55],
  ['R13', 'Graham Duncan — Construction Manager', 'labour', 'Construction', 90, { rotation: '2/3', calendarId: 'cal-offshore' }],
  ['R14', 'Kirsty Fraser — Commissioning Lead', 'labour', 'Commissioning', 88, { rotation: '2/3' }],
  ['R15', 'Mechanical Crew A (6 techs)', 'labour', 'Construction', 52, { maxHoursPerDay: 60, capacityHoursPerWeek: 360, company: 'Subcontract', calendarId: 'cal-yard' }],
  ['R16', 'E&I Crew B (4 techs)', 'labour', 'Construction', 55, { maxHoursPerDay: 40, capacityHoursPerWeek: 240, company: 'Subcontract', calendarId: 'cal-yard' }],
  ['R17', 'Lorna Scott — Document Controller', 'labour', 'Document Control', 45],
  ['R18', 'Solar Install Crew (10 operatives)', 'labour', 'Construction', 42, { maxHoursPerDay: 100, capacityHoursPerWeek: 500, company: 'Subcontract', calendarId: 'cal-site' }],
  ['R19', 'Crawler Crane 250t', 'equipment', 'Plant', 310, { maxHoursPerDay: 10 }],
  ['R20', 'Jamie Ogilvie — HSE Advisor', 'labour', 'HSE', 65],
  ['R21', 'Nadia Hussain — Electrical Engineer (Renewables)', 'labour', 'Electrical', 76],
  ['R22', 'Ben Walker — Civil Engineer', 'labour', 'Civil', 72],
];

// ---- project definitions -------------------------------------------------
// activity: [code, name, wbs, duration, preds, { res: {R03: hours}, cost, type, cal, cstr, perf, burn, steps, method, disc, phase, opt, pes }]
const P1 = {
  key: 'p1',
  project: {
    code: 'NNS-GCM',
    name: 'Northern North Sea Gas Compression Module Upgrade',
    client: 'Northern Basin Operator (demo)',
    location: 'Northern North Sea, UKCS',
    sector: 'Oil & Gas — Brownfield',
    portfolio: 'Offshore & Brownfield',
    contractType: 'EPCI Lump Sum',
    contractValue: 18500000,
    startDate: '2026-03-02',
    mustFinishBy: '2027-06-30',
    description: 'Engineer, procure, fabricate and install a 12 MW gas compression module with shutdown tie-ins on a producing platform.',
  },
  wbs: [
    ['PM', 'Project Management & Controls', null],
    ['E', 'Engineering', null],
    ['E.PR', 'Process & Safety', 'E'],
    ['E.MP', 'Mechanical & Piping', 'E'],
    ['E.EI', 'Electrical, Instrumentation & Control', 'E'],
    ['E.ST', 'Structural', 'E'],
    ['P', 'Procurement', null],
    ['P.LL', 'Long-lead Equipment', 'P'],
    ['P.BK', 'Bulk Materials', 'P'],
    ['F', 'Module Fabrication (Yard)', null],
    ['I', 'Offshore Installation & Hook-up', null],
    ['CS', 'Commissioning & Handover', null],
  ],
  acts: [
    ['A1000', 'Contract award / Notice to proceed', 'PM', 0, [], { type: 'start-milestone', phase: 'PM' }],
    ['A1010', 'Project execution plan & kick-off', 'PM', 15, ['A1000'], { res: { R01: 90, R02: 80, R20: 30 }, phase: 'PM' }],
    ['A1020', 'Project management & controls (LOE)', 'PM', 1, ['A1000:SS'], { type: 'loe', res: { R01: 1100, R02: 900, R17: 500 }, phase: 'PM' }],
    ['A1100', 'FEED verification & design basis', 'E.PR', 20, ['A1010:SS+5'], { res: { R03: 130, R04: 120 }, perf: 1.1, disc: 'Process' }],
    ['A1110', 'Process simulation & heat / material balance', 'E.PR', 15, ['A1100'], { res: { R04: 110, R03: 40 }, perf: 1.15, disc: 'Process' }],
    ['A1120', 'P&IDs — issue for HAZOP', 'E.PR', 25, ['A1110'], { res: { R03: 150, R04: 160, R06: 40 }, perf: 1.1, method: 'register', disc: 'Process' }],
    ['A1130', 'HAZOP & HAZID workshops', 'E.PR', 5, ['A1120'], { res: { R03: 45, R05: 30, R09: 30, R20: 40 }, disc: 'Process' }],
    ['A1140', 'Close HAZOP actions & P&IDs to IFC', 'E.PR', 20, ['A1130'], { res: { R04: 130, R03: 50 }, perf: 1.25, burn: 1.15, disc: 'Process' }],
    ['A1200', 'Compressor package datasheet & requisition', 'E.MP', 15, ['A1110'], { res: { R05: 100, R03: 20 }, disc: 'Mechanical' }],
    ['A1210', '3D model & piping layout', 'E.MP', 40, ['A1120:SS+10'], { res: { R06: 300, R05: 60 }, perf: 1.2, burn: 1.12, disc: 'Piping' }],
    ['A1220', 'Pipe stress analysis', 'E.MP', 20, ['A1210:SS+20'], { res: { R07: 150 }, perf: 1.1, disc: 'Piping' }],
    ['A1230', 'Piping isometrics & material take-off', 'E.MP', 25, ['A1210', 'A1140'], { res: { R06: 210, R07: 20 }, perf: 1.25, burn: 1.1, disc: 'Piping', opt: 22, pes: 35 }],
    ['A1240', 'Compressor vendor data review', 'E.MP', 30, ['A2010:FS+20'], { res: { R05: 120, R09: 40, R08: 30 }, disc: 'Mechanical' }],
    ['A1300', 'Electrical load list & single line diagram', 'E.EI', 20, ['A1110'], { res: { R08: 140 }, disc: 'Electrical' }],
    ['A1310', 'Cable sizing, routing & schedules', 'E.EI', 20, ['A1300'], { res: { R08: 130 }, perf: 1.05, disc: 'Electrical' }],
    ['A1320', 'Instrument index & datasheets', 'E.EI', 25, ['A1120'], { res: { R09: 180 }, perf: 1.1, disc: 'Instrumentation' }],
    ['A1330', 'Cause & effect, ICSS & F&G layouts', 'E.EI', 20, ['A1320', 'A1140'], { res: { R09: 150, R03: 20 }, disc: 'Instrumentation', opt: 18, pes: 30 }],
    ['A1400', 'Module structural design & analysis', 'E.ST', 30, ['A1210:SS+10'], { res: { R10: 220 }, disc: 'Structural' }],
    ['A1410', 'Structural fabrication drawings', 'E.ST', 20, ['A1400'], { res: { R10: 150, R06: 20 }, perf: 1.05, disc: 'Structural' }],
    ['A1490', 'Engineering complete — all IFC', 'E', 0, ['A1140', 'A1220', 'A1230', 'A1310', 'A1330', 'A1410'], { type: 'finish-milestone' }],
    ['A2000', 'Compressor RFQ, bid evaluation & recommendation', 'P.LL', 25, ['A1200'], { res: { R11: 100, R05: 40 }, phase: 'P' }],
    ['A2010', 'Compressor package PO award', 'P.LL', 0, ['A2000'], { type: 'finish-milestone', phase: 'P' }],
    ['A2020', 'Compressor package manufacture (vendor)', 'P.LL', 150, ['A2010'], { cost: 4200000, res: { R12: 120 }, perf: 1.1, phase: 'P', opt: 140, pes: 185 }],
    ['A2030', 'Compressor factory acceptance test (FAT)', 'P.LL', 10, ['A2020'], { res: { R05: 50, R09: 30, R14: 30 }, phase: 'P', opt: 8, pes: 25 }],
    ['A2040', 'Compressor delivery to fabrication yard', 'P.LL', 10, ['A2030'], { res: { R12: 30 }, cost: 85000, phase: 'P' }],
    ['A2100', 'Valves, gas cooler & scrubber procurement', 'P.LL', 110, ['A1120:FS+10'], { cost: 950000, res: { R11: 80, R12: 120 }, perf: 1.05, phase: 'P' }],
    ['A2200', 'Piping bulk materials procurement', 'P.BK', 50, ['A1230:SS+10'], { cost: 380000, res: { R11: 60, R12: 40 }, phase: 'P' }],
    ['A2300', 'E&I bulk materials procurement', 'P.BK', 45, ['A1310'], { cost: 260000, res: { R11: 50 }, phase: 'P' }],
    ['A2400', 'Structural steel procurement', 'P.BK', 30, ['A1410:SS+5'], { cost: 210000, res: { R11: 30 }, phase: 'P' }],
    ['A3000', 'Yard mobilisation & fabrication readiness', 'F', 10, ['A1410'], { res: { R13: 80, R20: 30 }, phase: 'C', cal: 'cal-yard' }],
    ['A3010', 'Module structure fabrication', 'F', 45, ['A3000', 'A2400'], { res: { R15: 1400, R10: 60 }, phase: 'C', cal: 'cal-yard', method: 'steps', steps: [['Primary steel erected', 50], ['Secondary steel', 25], ['Grating & handrails', 15], ['Dimensional survey', 10]] }],
    ['A3020', 'Compressor & equipment setting on module', 'F', 10, ['A3010', 'A2040'], { res: { R15: 400, R19: 40 }, phase: 'C', cal: 'cal-yard' }],
    ['A3030', 'Piping fabrication & installation', 'F', 40, ['A3010:SS+20', 'A2200', 'A1230'], { res: { R15: 1600 }, phase: 'C', cal: 'cal-yard', method: 'steps', steps: [['Spools fabricated', 40], ['Spools erected', 35], ['Supports & bolt-up', 25]], opt: 36, pes: 55 }],
    ['A3040', 'E&I installation & terminations', 'F', 35, ['A3030:SS+15', 'A2300'], { res: { R16: 1300 }, phase: 'C', cal: 'cal-yard' }],
    ['A3050', 'Hydrotest, NDT & painting', 'F', 15, ['A3030'], { res: { R15: 450 }, phase: 'C', cal: 'cal-yard' }],
    ['A3060', 'Yard mechanical completion & pre-commissioning', 'CS', 15, ['A3050', 'A3040', 'A3020'], { res: { R14: 120, R16: 300 }, phase: 'CS', cal: 'cal-yard' }],
    ['A3070', 'Load-out & sea-fastening', 'F', 5, ['A3060'], { res: { R19: 50, R15: 200, R13: 50 }, phase: 'C', cal: 'cal-yard' }],
    ['A4000', 'Offshore pre-shutdown preparatory works', 'I', 20, ['A1490:FS+20'], { res: { R13: 240, R15: 1200 }, phase: 'C', cal: 'cal-offshore', opt: 18, pes: 30 }],
    ['A4010', 'Transport & lift module offshore', 'I', 3, ['A3070'], { cost: 650000, res: { R13: 36 }, phase: 'C', cal: 'cal-offshore', opt: 2, pes: 8 }],
    ['A4020', 'Shutdown tie-ins & hook-up', 'I', 21, ['A4010', 'A4000'], { res: { R15: 2200, R16: 1100, R13: 250 }, phase: 'C', cal: 'cal-offshore', cstr: ['MSO', '2027-04-12'], opt: 19, pes: 30 }],
    ['A4030', 'Offshore commissioning & start-up', 'CS', 14, ['A4020'], { res: { R14: 170, R16: 600 }, phase: 'CS', cal: 'cal-offshore', opt: 12, pes: 24 }],
    ['A4040', 'Performance test (72-hour run)', 'CS', 3, ['A4030'], { res: { R14: 36, R03: 24 }, phase: 'CS', cal: 'cal-offshore' }],
    ['A5000', 'Handover dossiers & as-built documentation', 'CS', 20, ['A4030:SS+5'], { res: { R17: 160, R02: 40, R06: 60 }, phase: 'CS' }],
    ['A5010', 'Final handover to operations', 'CS', 0, ['A4040', 'A5000'], { type: 'finish-milestone', phase: 'CS' }],
  ],
  loeSucc: ['A1020', 'A5010', 'FF'],
  docs: [
    ['PR-PFD-001', 'Process flow diagram — compression train', 'Process', 'Drawing', 'A1110', 40],
    ['PR-HMB-001', 'Heat & material balance', 'Process', 'Report', 'A1110', 30],
    ['PR-PID-101', 'P&ID — suction scrubber', 'Process', 'Drawing', 'A1120', 60],
    ['PR-PID-102', 'P&ID — compressor & lube oil', 'Process', 'Drawing', 'A1120', 80],
    ['PR-PID-103', 'P&ID — discharge cooler', 'Process', 'Drawing', 'A1120', 60],
    ['PR-PID-104', 'P&ID — fuel & seal gas', 'Process', 'Drawing', 'A1120', 60],
    ['PR-RPT-010', 'HAZOP report & action register', 'Process', 'Report', 'A1140', 50],
    ['ME-DS-001', 'Compressor package datasheet', 'Mechanical', 'Datasheet', 'A1200', 40],
    ['ME-MR-001', 'Compressor material requisition', 'Mechanical', 'Requisition', 'A1200', 30],
    ['PI-GA-201', 'Piping general arrangement — deck level', 'Piping', 'Drawing', 'A1210', 80],
    ['PI-GA-202', 'Piping general arrangement — mezzanine', 'Piping', 'Drawing', 'A1210', 80],
    ['PI-STR-001', 'Pipe stress calculation report', 'Piping', 'Calculation', 'A1220', 70],
    ['PI-ISO-300', 'Isometric package — process lines', 'Piping', 'Isometrics', 'A1230', 120],
    ['PI-MTO-001', 'Piping material take-off', 'Piping', 'Schedule', 'A1230', 40],
    ['EL-SLD-001', 'Electrical single line diagram', 'Electrical', 'Drawing', 'A1300', 50],
    ['EL-LL-001', 'Electrical load list', 'Electrical', 'Schedule', 'A1300', 30],
    ['EL-CS-001', 'Cable schedule', 'Electrical', 'Schedule', 'A1310', 50],
    ['IN-IDX-001', 'Instrument index', 'Instrumentation', 'Schedule', 'A1320', 40],
    ['IN-DS-010', 'Instrument datasheets', 'Instrumentation', 'Datasheet', 'A1320', 70],
    ['IN-CE-001', 'Cause & effect charts', 'Instrumentation', 'Schedule', 'A1330', 60],
    ['IN-FG-001', 'Fire & gas detector layout', 'Instrumentation', 'Drawing', 'A1330', 50],
    ['ST-CAL-001', 'Module structural analysis report', 'Structural', 'Calculation', 'A1400', 90],
    ['ST-FAB-100', 'Structural fabrication drawings', 'Structural', 'Drawing', 'A1410', 110],
  ],
  pos: [
    ['PKG-01', 'Gas compressor package (12 MW)', 'Northwind Compression (demo)', 4200000, 'A2020', 'A3020', 0, { MR: 'A1200', PO: 'A2010', VDA: ['A2010', 45], FAT: 'A2030', RFS: ['A2030', 'f'], DEL: 'A2040' }, 38],
    ['PKG-02', 'Discharge gas cooler & suction scrubber', 'Caledonian Heat Transfer (demo)', 610000, 'A2100', 'A3020', 0, { MR: ['A1120', 'f', 12], PO: ['A2100', 's', 20], VDA: ['A2100', 's', 55], FAT: ['A2100', 's', 120], RFS: ['A2100', 's', 130], DEL: ['A2100', 'f'] }, 12],
    ['PKG-03', 'Control & ESD valves', 'Grampian Valve Co (demo)', 340000, 'A2100', 'A3030', 5, { MR: ['A1120', 'f', 12], PO: ['A2100', 's', 25], VDA: ['A2100', 's', 50], FAT: ['A2100', 's', 110], RFS: ['A2100', 's', 118], DEL: ['A2100', 'f', -10] }, 0],
    ['PKG-04', 'Piping bulks — pipe, fittings, flanges', 'North East Pipe Supply (demo)', 380000, 'A2200', 'A3030', 0, { MR: ['A1230', 's', 12], PO: ['A2200', 's', 5], VDA: ['A2200', 's', 12], FAT: null, RFS: ['A2200', 'f', -8], DEL: ['A2200', 'f'] }, 5],
    ['PKG-05', 'E&I bulks — cable, trays, glands', 'Dee Electrical Wholesale (demo)', 260000, 'A2300', 'A3040', 0, { MR: ['A1310', 'f'], PO: ['A2300', 's', 8], VDA: ['A2300', 's', 15], FAT: null, RFS: ['A2300', 'f', -6], DEL: ['A2300', 'f'] }, 0],
    ['PKG-06', 'Structural steel sections & plate', 'Forth Steel Stockholders (demo)', 210000, 'A2400', 'A3010', 0, { MR: ['A1410', 's', 5], PO: ['A2400', 's', 3], VDA: null, FAT: null, RFS: ['A2400', 'f', -5], DEL: ['A2400', 'f'] }, 0],
  ],
  risks: [
    ['R-001', 'Compressor FAT failure requiring re-test', 'Supply chain', 'Hamish Stewart', 0.3, 25, 180000, ['A2030'], 'open', 'reduce', 'Witness pre-FAT string test; vendor QA surveillance at 60% manufacture.'],
    ['R-002', 'Weather downtime during module lift & hook-up', 'Weather / Marine', 'Graham Duncan', 0.6, 8, 240000, ['A4010', 'A4020'], 'open', 'accept', 'Schedule lift in April weather window; 5-day contingency in marine spread contract.'],
    ['R-003', 'As-built discrepancies at tie-in points (brownfield clashes)', 'Technical', 'Ewan Clark', 0.4, 12, 150000, ['A4020', 'A3030'], 'mitigating', 'reduce', 'Laser scan survey of tie-in areas; offshore verification trip before IFC.'],
    ['R-004', 'Persons-on-board (POB) limits restrict hook-up crew size', 'Logistics', 'Graham Duncan', 0.35, 7, 90000, ['A4020'], 'open', 'reduce', 'Agree POB allocation with asset team; night-shift plan.'],
    ['R-005', 'Late client comments on P&IDs', 'Client interface', 'Fiona Grant', 0.2, 10, 40000, ['A1140'], 'closed', 'reduce', 'Weekly model reviews with client TA.'],
    ['R-006', 'Yard capacity clash with another client module', 'Construction', 'Priya Nair', 0.25, 15, 120000, ['A3010', 'A3030'], 'open', 'transfer', 'Reserve bay 3 in yard contract; LDs back-to-back.'],
  ],
  changes: [
    ['CO-001', 'Additional fuel gas conditioning skid (client request)', 'client-variation', 'submitted', 420000, 'Client operations requested a fuel gas conditioning skid for turbine drivers following HAZOP action H-27.', [
      { code: 'CO1-E', name: 'Engineer fuel gas conditioning skid', duration: 25, predId: 'A1140' },
      { code: 'CO1-P', name: 'Procure fuel gas skid (vendor)', duration: 115 },
      { code: 'CO1-F', name: 'Install skid on module', duration: 8, succId: 'A3060', cal: 'cal-yard' },
    ]],
    ['CO-002', 'Relocate F&G detectors per revised HAZOP', 'client-variation', 'approved', 35000, 'Minor scope; absorbed within E&I engineering.', []],
    ['CO-003', 'Yard labour rate escalation (claim)', 'claim', 'draft', 95000, 'Subcontract labour rates increased 6% from 1 Oct 2026.', []],
  ],
};

const P2 = {
  key: 'p2',
  project: {
    code: 'ABD-SOL',
    name: 'Aberdeenshire 40 MW Solar PV + 20 MW BESS',
    client: 'Deeside Renewables LLP (demo)',
    location: 'Aberdeenshire, Scotland',
    sector: 'Renewables — Solar & Storage',
    portfolio: 'Energy Transition',
    contractType: 'EPC Lump Sum (FIDIC Silver)',
    contractValue: 31200000,
    startDate: '2026-05-04',
    mustFinishBy: '2027-04-30',
    description: 'Turnkey EPC of a 40 MWp ground-mount PV plant with a 20 MW / 40 MWh battery energy storage system and 33 kV grid connection.',
  },
  wbs: [
    ['PM', 'Project Management', null],
    ['E', 'Engineering & Consents', null],
    ['P', 'Procurement', null],
    ['C', 'Construction', null],
    ['C.CIV', 'Civils & Structures', 'C'],
    ['C.ELE', 'Electrical Installation', 'C'],
    ['CS', 'Commissioning & Grid Connection', null],
  ],
  acts: [
    ['B1000', 'Notice to proceed', 'PM', 0, [], { type: 'start-milestone' }],
    ['B1010', 'Project management & site supervision (LOE)', 'PM', 1, ['B1000:SS'], { type: 'loe', res: { R01: 500, R02: 400, R20: 300 } }],
    ['B1100', 'Topographic & geotechnical surveys', 'E', 20, ['B1000'], { res: { R22: 120 }, cost: 85000 }],
    ['B1110', 'PV layout & energy yield design (PVsyst)', 'E', 15, ['B1100:SS+5'], { res: { R21: 110 } }],
    ['B1120', 'Civil, drainage & access road design', 'E', 20, ['B1100'], { res: { R22: 150 }, perf: 1.1 }],
    ['B1130', 'DC/AC & 33 kV electrical design', 'E', 30, ['B1110'], { res: { R21: 220, R08: 60 }, perf: 1.15, burn: 1.1 }],
    ['B1140', 'BESS integration & protection design', 'E', 25, ['B1130:SS+10'], { res: { R21: 150, R08: 50 }, perf: 1.2 }],
    ['B1150', 'G99 grid compliance & DNO submissions', 'E', 20, ['B1130'], { res: { R08: 90, R21: 60 }, perf: 1.1 }],
    ['B1190', 'Design freeze — IFC', 'E', 0, ['B1120', 'B1140', 'B1150'], { type: 'finish-milestone' }],
    ['B2000', 'PV modules supply (40 MWp)', 'P', 70, ['B1110'], { cost: 7200000, res: { R11: 60, R12: 60 }, phase: 'P' }],
    ['B2010', 'Inverters & MV skids supply', 'P', 90, ['B1130:SS+10'], { cost: 2100000, res: { R11: 40, R12: 50 }, phase: 'P' }],
    ['B2020', 'BESS containers & PCS supply', 'P', 120, ['B1140'], { cost: 8500000, res: { R11: 60, R12: 80 }, phase: 'P', opt: 110, pes: 150 }],
    ['B2030', 'Grid transformer 33/11 kV supply', 'P', 150, ['B1130:SS+15'], { cost: 1600000, res: { R11: 30, R12: 60 }, phase: 'P', opt: 140, pes: 190 }],
    ['B2040', 'Mounting structures & piles supply', 'P', 60, ['B1120'], { cost: 2400000, res: { R11: 40 }, phase: 'P' }],
    ['B3000', 'Site establishment, fencing & compounds', 'C.CIV', 15, ['B1120'], { res: { R18: 900, R20: 40 }, cost: 120000, cal: 'cal-site' }],
    ['B3010', 'Access roads, drainage & cable trenches', 'C.CIV', 40, ['B3000'], { res: { R18: 2600, R22: 80 }, cost: 650000, cal: 'cal-site', perf: 1.15, burn: 1.1 }],
    ['B3020', 'Piling & mounting structure erection', 'C.CIV', 50, ['B3010:SS+10', 'B2040'], { res: { R18: 4200 }, cost: 300000, cal: 'cal-site', opt: 45, pes: 65 }],
    ['B3030', 'PV module installation', 'C.ELE', 45, ['B3020:SS+15', 'B2000'], { res: { R18: 4000 }, cal: 'cal-site', opt: 40, pes: 60 }],
    ['B3040', 'DC cabling, strings & combiner boxes', 'C.ELE', 35, ['B3030:SS+10'], { res: { R18: 2400 }, cost: 450000, cal: 'cal-site' }],
    ['B3050', 'Inverter & MV skid installation', 'C.ELE', 20, ['B2010', 'B3010'], { res: { R18: 900, R19: 40 }, cal: 'cal-site' }],
    ['B3060', 'BESS foundations & container installation', 'C.ELE', 30, ['B2020', 'B3010'], { res: { R18: 1500, R19: 60 }, cost: 280000, cal: 'cal-site' }],
    ['B3070', 'Substation & transformer installation', 'C.ELE', 25, ['B2030', 'B3010'], { res: { R18: 1000, R19: 50 }, cost: 380000, cal: 'cal-site' }],
    ['B4000', 'Cold commissioning & insulation testing', 'CS', 15, ['B3040', 'B3050'], { res: { R14: 120, R21: 60 } }],
    ['B4010', 'BESS commissioning', 'CS', 15, ['B3060', 'B4000:SS'], { res: { R14: 100, R21: 80 } }],
    ['B4020', 'Grid energisation (DNO witness)', 'CS', 0, ['B3070', 'B4000'], { type: 'finish-milestone', cstr: ['FNET', '2027-02-12'] }],
    ['B4030', 'Hot commissioning & performance ratio test', 'CS', 15, ['B4020', 'B4010'], { res: { R14: 120, R21: 100 } }],
    ['B4040', 'Taking-over certificate', 'CS', 0, ['B4030'], { type: 'finish-milestone' }],
  ],
  loeSucc: ['B1010', 'B4040', 'FF'],
  docs: [
    ['EL-SLD-001', 'Overall single line diagram (33 kV)', 'Electrical', 'Drawing', 'B1130', 60],
    ['EL-LAY-001', 'PV array layout & stringing plan', 'Electrical', 'Drawing', 'B1110', 50],
    ['EL-PRT-001', 'Protection settings & relay coordination', 'Electrical', 'Report', 'B1140', 70],
    ['EL-G99-001', 'G99 compliance submission', 'Electrical', 'Report', 'B1150', 60],
    ['CV-DRN-001', 'Drainage & SUDS design', 'Civil', 'Drawing', 'B1120', 50],
    ['CV-RD-001', 'Access road & compound design', 'Civil', 'Drawing', 'B1120', 40],
    ['CV-GI-001', 'Geotechnical interpretive report', 'Civil', 'Report', 'B1100', 40],
  ],
  pos: [
    ['PV-01', 'PV modules 40 MWp (bifacial)', 'SunCell Modules (demo)', 7200000, 'B2000', 'B3030', 0, { MR: ['B1110', 'f'], PO: ['B2000', 's', 10], VDA: ['B2000', 's', 20], FAT: ['B2000', 's', 45], RFS: ['B2000', 's', 55], DEL: ['B2000', 'f'] }, 0],
    ['PV-02', 'Central inverters & MV skids', 'Voltaic Power Systems (demo)', 2100000, 'B2010', 'B3050', 0, { MR: ['B1130', 's', 12], PO: ['B2010', 's', 12], VDA: ['B2010', 's', 30], FAT: ['B2010', 's', 70], RFS: ['B2010', 's', 80], DEL: ['B2010', 'f'] }, 0],
    ['PV-03', 'BESS containers & PCS', 'StoreGrid Energy (demo)', 8500000, 'B2020', 'B3060', 0, { MR: ['B1140', 's', 12], PO: ['B2020', 's', 15], VDA: ['B2020', 's', 40], FAT: ['B2020', 's', 95], RFS: ['B2020', 's', 108], DEL: ['B2020', 'f'] }, 20],
    ['PV-04', 'Grid transformer', 'Highland Transformers (demo)', 1600000, 'B2030', 'B3070', 0, { MR: ['B1130', 's', 15], PO: ['B2030', 's', 10], VDA: ['B2030', 's', 30], FAT: ['B2030', 's', 125], RFS: ['B2030', 's', 138], DEL: ['B2030', 'f'] }, 45],
    ['PV-05', 'Mounting structures & piles', 'TerraFrame (demo)', 2400000, 'B2040', 'B3020', 0, { MR: ['B1120', 's', 10], PO: ['B2040', 's', 5], VDA: ['B2040', 's', 15], FAT: null, RFS: ['B2040', 'f', -8], DEL: ['B2040', 'f'] }, 0],
  ],
  risks: [
    ['R-101', 'DNO grid connection date slips', 'Grid / Utility', 'Olu Adeyemi', 0.4, 30, 600000, ['B4030'], 'open', 'reduce', 'Monthly DNO interface meetings; early G99 submission.'],
    ['R-102', 'Piling refusal in glacial till', 'Ground conditions', 'Ben Walker', 0.3, 12, 220000, ['B3020'], 'open', 'reduce', 'Pile test programme; pre-drilling contingency.'],
    ['R-103', 'Winter weather reduces install productivity', 'Weather', 'Graham Duncan', 0.55, 10, 150000, ['B3030', 'B3040'], 'open', 'accept', 'Sequence module installation before December; winter working plan.'],
    ['R-104', 'Transformer factory slot delayed', 'Supply chain', 'Anna Kowalski', 0.35, 20, 80000, ['B2030'], 'open', 'reduce', 'Expediting visits; alternative vendor pre-qualified.'],
  ],
  changes: [
    ['CO-101', 'DNO requires additional protection relay panel', 'client-variation', 'pending', 145000, 'DNO letter 14-Sep-2026 requires an intertrip panel at point of connection.', [
      { code: 'CO101-E', name: 'Design intertrip panel', duration: 10, predId: 'B1150' },
      { code: 'CO101-P', name: 'Manufacture & deliver panel', duration: 120 },
      { code: 'CO101-C', name: 'Install & test intertrip', duration: 8, succId: 'B4020' },
    ]],
  ],
};

const P3 = {
  key: 'p3',
  project: {
    code: 'H2-FEED',
    name: '10 MW Green Hydrogen Electrolyser — FEED',
    client: 'Granite City Hydrogen Hub (demo)',
    location: 'Aberdeen, Scotland',
    sector: 'Hydrogen — Front-End Engineering',
    portfolio: 'Energy Transition',
    contractType: 'Reimbursable (T&M, capped)',
    contractValue: 1450000,
    startDate: '2026-06-01',
    mustFinishBy: '2026-12-18',
    description: 'Front-end engineering design for a 10 MW PEM electrolyser plant, including cost estimate (Class 3) and EPC execution plan.',
  },
  wbs: [
    ['PM', 'Project Management', null],
    ['E', 'FEED Engineering', null],
    ['D', 'Deliverables & Estimate', null],
  ],
  acts: [
    ['C1000', 'FEED kick-off', 'PM', 0, [], { type: 'start-milestone' }],
    ['C1010', 'FEED management (LOE)', 'PM', 1, ['C1000:SS'], { type: 'loe', res: { R01: 220, R02: 120 } }],
    ['C1100', 'Basis of design', 'E', 15, ['C1000'], { res: { R03: 90, R04: 60 } }],
    ['C1110', 'Electrolyser technology selection', 'E', 25, ['C1100'], { res: { R03: 80, R05: 60, R04: 60 }, perf: 1.2 }],
    ['C1120', 'Process design & heat / material balance', 'E', 25, ['C1110:SS+10'], { res: { R04: 170, R03: 60 }, perf: 1.15, burn: 1.1 }],
    ['C1130', 'PFDs & P&IDs', 'E', 30, ['C1120:SS+10'], { res: { R04: 160, R06: 80 }, perf: 1.1 }],
    ['C1140', 'HAZID workshop', 'E', 3, ['C1130:SS+15'], { res: { R03: 30, R20: 24, R05: 18 } }],
    ['C1150', 'Plot plan & layout', 'E', 20, ['C1130:SS+5'], { res: { R06: 130, R10: 40 } }],
    ['C1160', 'Power supply & electrical study', 'E', 25, ['C1120'], { res: { R21: 150 }, perf: 1.1 }],
    ['C1170', 'Water treatment & utilities study', 'E', 15, ['C1120'], { res: { R04: 70 } }],
    ['C1180', 'Class 3 cost estimate', 'D', 20, ['C1130', 'C1150', 'C1160', 'C1170'], { res: { R11: 60, R02: 60, R05: 40 } }],
    ['C1190', 'EPC execution plan & level 2 schedule', 'D', 10, ['C1180:SS'], { res: { R02: 70, R01: 30 } }],
    ['C1200', 'FEED report & client review', 'D', 15, ['C1180', 'C1190'], { res: { R03: 60, R01: 40, R17: 40 } }],
    ['C1210', 'FEED complete', 'D', 0, ['C1200'], { type: 'finish-milestone' }],
  ],
  loeSucc: ['C1010', 'C1210', 'FF'],
  docs: [
    ['H2-BOD-001', 'Basis of design', 'Process', 'Report', 'C1100', 40],
    ['H2-TS-001', 'Technology selection report', 'Process', 'Report', 'C1110', 60],
    ['H2-PFD-001', 'Process flow diagrams', 'Process', 'Drawing', 'C1130', 50],
    ['H2-PID-001', 'P&IDs — electrolyser & BoP', 'Process', 'Drawing', 'C1130', 80],
    ['H2-PP-001', 'Plot plan', 'Piping', 'Drawing', 'C1150', 50],
    ['H2-EST-001', 'Class 3 cost estimate', 'Estimating', 'Report', 'C1180', 60],
  ],
  pos: [],
  risks: [
    ['R-201', 'Electrolyser vendor data late for FEED', 'Supply chain', 'Fiona Grant', 0.5, 12, 30000, ['C1120', 'C1130'], 'open', 'reduce', 'Weekly vendor calls; use generic data with holds.'],
    ['R-202', 'Grid capacity study result changes power scheme', 'Technical', 'Nadia Hussain', 0.25, 15, 45000, ['C1160'], 'open', 'accept', ''],
  ],
  changes: [],
};

// ---- builder ---------------------------------------------------------------
function parsePred(s) {
  const m = /^([A-Z0-9]+)(?::(FS|SS|FF|SF)([+-]\d+)?)?$/.exec(s);
  return { code: m[1], type: m[2] || 'FS', lag: Number(m[3] || 0) };
}

export function buildDemoDb({ hashPassword } = {}) {
  const db = emptyDb();
  db.meta.org = { name: 'Demo EPC Consultancy Ltd', currency: 'GBP' };
  db.meta.demo = true;
  db.calendars = structuredClone(CALENDARS);
  const cals = buildCalendars(db.calendars);
  for (const u of DEMO_USERS) db.users.push({ ...u, ...(hashPassword ? hashPassword(DEMO_PASSWORD) : { pwHash: '', salt: '' }) });
  for (const [code, name, type, discipline, rate, extra = {}] of RESOURCES) {
    db.resources.push({ id: `res-${code}`, code, name, type, discipline, rate, calendarId: 'default', maxHoursPerDay: type === 'labour' ? 10 : undefined, active: true, rotation: 'none', company: 'Demo EPC Consultancy', email: '', ...extra });
  }
  const rand = mulberry32(1517);
  for (const def of [P1, P2, P3]) buildProject(db, def, cals, rand);
  buildTimesheets(db, cals, rand);
  return db;
}

function buildProject(db, def, cals, rand) {
  const pid = `prj-${def.key}`;
  const project = { id: pid, status: 'active', currency: 'GBP', calendarId: 'default', progressMode: 'retained', ...def.project, dataDate: def.project.startDate };
  db.projects.push(project);
  const wbsId = (k) => `wbs-${def.key}-${k}`;
  def.wbs.forEach(([k, name, parent], i) => db.wbs.push({ id: wbsId(k), projectId: pid, parentId: parent ? wbsId(parent) : null, code: `${def.project.code}.${k}`, name, sort: i }));

  const actId = (c) => `act-${def.key}-${c}`;
  const acts = [];
  const rels = [];
  const perf = new Map();
  const burn = new Map();
  for (const [code, name, wbs, duration, preds, o = {}] of def.acts) {
    const a = {
      id: actId(code), projectId: pid, wbsId: wbsId(wbs), code, name, type: o.type || 'task', duration,
      calendarId: o.cal, constraintType: o.cstr ? o.cstr[0] : '', constraintDate: o.cstr ? o.cstr[1] : null,
      pctComplete: 0, progressMethod: o.method || 'physical', budgetCost: o.cost || 0, actualCost: 0,
      discipline: o.disc || '', phase: o.phase || (wbs.startsWith('E') ? 'E' : wbs.startsWith('P') ? 'P' : wbs.startsWith('CS') ? 'CS' : wbs.startsWith('C') || wbs.startsWith('F') || wbs.startsWith('I') ? 'C' : 'PM'),
      optimistic: o.opt ?? null, pessimistic: o.pes ?? null, notes: '',
    };
    if (o.steps) a.steps = o.steps.map(([n, w]) => ({ name: n, weight: w, done: false }));
    acts.push(a);
    perf.set(a.id, o.perf || 1 + (rand() - 0.5) * 0.08);
    burn.set(a.id, o.burn || 1 + (rand() - 0.4) * 0.1);
    for (const p of preds) {
      const pr = parsePred(p);
      rels.push({ id: `rel-${def.key}-${pr.code}-${code}`, projectId: pid, predId: actId(pr.code), succId: a.id, type: pr.type, lag: pr.lag });
    }
    for (const [rc, hours] of Object.entries(o.res || {})) {
      db.assignments.push({ id: `asg-${def.key}-${code}-${rc}`, projectId: pid, activityId: a.id, resourceId: `res-${rc}`, budgetHours: hours });
    }
  }
  if (def.loeSucc) {
    const [loe, succ, t] = def.loeSucc;
    rels.push({ id: `rel-${def.key}-${loe}-${succ}`, projectId: pid, predId: actId(loe), succId: actId(succ), type: t, lag: 0 });
  }
  db.activities.push(...acts);
  db.relationships.push(...rels);

  // ---- baseline: plan at project start ------------------------------------
  const pcal = cals.get(project.calendarId);
  const planned = schedule({ project, activities: acts, relationships: rels, calendars: cals });
  const budgets = activityBudgets(acts, db.assignments.filter((x) => x.projectId === pid), db.resources);
  const blActs = {};
  for (const a of acts) {
    const r = planned.byId.get(a.id);
    blActs[a.id] = { start: r.start, finish: r.finish, duration: a.duration, budget: budgets.get(a.id).total, hours: budgets.get(a.id).hours };
  }
  const blId = `bl-${def.key}-1`;
  db.baselines.push({ id: blId, projectId: pid, name: 'Contract baseline (Rev 0)', createdAt: `${project.startDate}T09:00:00.000Z`, createdBy: 'Callum Reid', dataDate: project.startDate, finish: planned.projectFinish, budget: [...budgets.values()].reduce((s, b) => s + b.total, 0), activities: blActs });
  project.activeBaselineId = blId;

  // ---- "as executed" simulation with performance factors --------------------
  const override = new Map(acts.map((a) => [a.id, Math.max(1, Math.round(a.duration * perf.get(a.id)))]));
  const executed = schedule({ project, activities: acts, relationships: rels, calendars: cals, options: { durationOverride: override } });
  const dd = toDay(DEMO_DATA_DATE);
  const calOf = (a) => cals.get(a.calendarId) || pcal;
  const exec = new Map();
  for (const a of acts) {
    const r = executed.byId.get(a.id);
    const cal = calOf(a);
    const s = r.es;
    const f = r.ef; // exclusive
    exec.set(a.id, { s, f });
    if (a.type === 'loe') {
      if (s < dd) a.actualStart = fromDay(s);
      continue;
    }
    if (a.type === 'start-milestone' || a.type === 'finish-milestone') {
      const p = a.type === 'finish-milestone' ? f - 1 : s;
      if (p < dd) {
        a.actualStart = fromDay(p);
        a.actualFinish = fromDay(p);
        a.pctComplete = 100;
      }
      continue;
    }
    if (f <= dd) {
      a.actualStart = fromDay(s);
      a.actualFinish = fromDay(f - 1);
      a.pctComplete = 100;
    } else if (s < dd) {
      const total = cal.between(s, f);
      const done = cal.between(s, dd);
      a.actualStart = fromDay(s);
      a.pctComplete = Math.max(5, Math.min(95, Math.round((100 * done) / Math.max(1, total))));
      a.remaining = Math.max(1, total - done);
    }
    if (a.steps) {
      let acc = 0;
      for (const st of a.steps) {
        acc += st.weight;
        st.done = acc <= a.pctComplete;
      }
    }
    // non-labour actual cost: vendor milestone invoices ~ progress
    if (a.budgetCost && a.actualStart) a.actualCost = Math.round(a.budgetCost * (a.pctComplete / 100) * (0.95 + rand() * 0.12));
  }
  project.dataDate = DEMO_DATA_DATE;
  project.history = [];
  project.execution = { perf: Object.fromEntries(perf), burn: Object.fromEntries(burn), exec: Object.fromEntries([...exec].map(([k, v]) => [k, [v.s, v.f]])) };

  // ---- MDR -----------------------------------------------------------------
  const fracs = [0, 0.35, 0.55, 0.8, 1];
  for (const [no, title, disc, type, code, hours] of def.docs) {
    const aid = actId(code);
    const bl = blActs[aid];
    const bs = toDay(bl.start);
    const bf = toDay(bl.finish);
    const ex = exec.get(aid);
    const jitter = Math.round((rand() - 0.3) * 8);
    const plannedD = {};
    const actualD = {};
    let prevDay = -Infinity;
    DOC_STAGES.forEach((st, i) => {
      plannedD[st.key] = fromDay(bs + Math.round(fracs[i] * (bf - bs)));
      const ad = Math.max(prevDay, ex.s + Math.round(fracs[i] * (ex.f - 1 - ex.s)) + (i ? jitter : 0));
      prevDay = ad;
      if (ad < dd) actualD[st.key] = fromDay(ad);
    });
    const rev = actualD.IFC ? 'C1' : actualD.IFA ? 'B1' : actualD.IFR ? 'A1' : actualD.START ? 'Z1' : '—';
    db.deliverables.push({ id: `doc-${def.key}-${no}`, projectId: pid, docNo: `${def.project.code}-${no}`, title, discipline: disc, docType: type, activityId: aid, weightHours: hours, planned: plannedD, actual: actualD, revision: rev, notes: '' });
  }

  // ---- procurement ---------------------------------------------------------------
  for (const [tag, desc, vendor, value, linkCode, needCode, buffer, stages, slip] of def.pos) {
    const dateFor = (spec, src) => {
      if (!spec) return null;
      const [code, edge, off] = Array.isArray(spec) ? [spec[0], spec[1] === 'f' ? 'f' : spec[1] === 's' ? 's' : 'f', typeof spec[1] === 'number' ? spec[1] : spec[2] || 0] : [spec, 'f', 0];
      const aid = actId(code);
      if (src === 'bl') {
        const b = blActs[aid];
        return toDay(edge === 's' ? b.start : b.finish) + off;
      }
      const e = exec.get(aid);
      return (edge === 's' ? e.s : e.f - 1) + off;
    };
    const plannedD = {};
    const forecastD = {};
    const actualD = {};
    for (const st of PO_STAGES) {
      const spec = stages[st.key];
      if (!spec) continue;
      plannedD[st.key] = fromDay(dateFor(spec, 'bl'));
      const exDay = dateFor(spec, 'ex');
      if (exDay < dd) actualD[st.key] = fromDay(exDay);
      else forecastD[st.key] = fromDay(exDay + (['FAT', 'RFS', 'DEL'].includes(st.key) ? slip : Math.round(slip / 3)));
    }
    db.procurement.push({
      id: `po-${def.key}-${tag}`, projectId: pid, tag, description: desc, vendor, poNumber: actualD.PO ? `PO-${def.project.code}-${tag.replace(/\D/g, '')}0` : '', value, currency: 'GBP',
      activityId: actId(linkCode), needActivityId: actId(needCode), rosBufferDays: buffer, leadTimeWeeks: Math.round((toDay(plannedD.DEL || plannedD.RFS) - toDay(plannedD.PO || plannedD.MR)) / 7),
      planned: plannedD, forecast: forecastD, actual: actualD, expeditor: 'Ross McLeod', notes: slip > 20 ? 'Vendor advised slippage at last expediting visit — recovery plan requested.' : '',
    });
  }

  // ---- risks & changes --------------------------------------------------------
  for (const [code, title, category, owner, p, days, cost, links, status, response, mitigation] of def.risks) {
    db.risks.push({ id: `rsk-${def.key}-${code}`, projectId: pid, code, title, category, owner, probability: p, impactDays: days, impactCost: cost, activityIds: links.map(actId), status, response, mitigation, cause: '', effect: '' });
  }
  for (const [ref, title, type, status, cost, description, frag] of def.changes) {
    db.changes.push({
      id: `chg-${def.key}-${ref}`, projectId: pid, ref, title, type, status, costImpact: cost, description, raisedBy: 'Priya Nair', raisedDate: fromDay(dd - Math.round(rand() * 20) - 3),
      fragnet: frag.map((f) => ({ ...f, predId: f.predId ? actId(f.predId) : undefined, succId: f.succId ? actId(f.succId) : undefined, calendarId: f.cal })),
    });
  }
}

function buildTimesheets(db, cals, rand) {
  const dd = toDay(DEMO_DATA_DATE);
  const lastFullWeek = weekStartDay(dd) - 7;
  const resById = new Map(db.resources.map((r) => [r.id, r]));
  // daily hours per resource: Map(resId -> Map(day -> [{projectId, activityId, hours}]))
  const daily = new Map();
  for (const p of db.projects) {
    const pcal = cals.get(p.calendarId);
    const exec = p.execution;
    for (const asg of db.assignments.filter((x) => x.projectId === p.id)) {
      const a = db.activities.find((x) => x.id === asg.activityId);
      const [s, f] = exec.exec[a.id];
      const cal = cals.get(a.calendarId) || pcal;
      const res = resById.get(asg.resourceId);
      const rcal = cals.get(res.calendarId) || pcal;
      const span = Math.max(1, cal.between(s, f));
      const perDay = (asg.budgetHours / (a.type === 'loe' ? span : Math.max(1, Math.round(a.duration * exec.perf[a.id])))) * exec.burn[a.id];
      for (let d = s; d < Math.min(f, dd); d++) {
        if (!cal.isWork(d) || (!rcal.isWork(d) && res.type === 'labour' && !res.maxHoursPerDay)) continue;
        if (!daily.has(res.id)) daily.set(res.id, new Map());
        const m = daily.get(res.id);
        if (!m.has(d)) m.set(d, []);
        m.get(d).push({ projectId: p.id, activityId: a.id, hours: perDay * (0.85 + rand() * 0.3) });
      }
    }
    delete p.execution;
  }
  const pendingWeek = lastFullWeek;
  const missingPending = new Set(['res-R06', 'res-R09', 'res-R18']);
  for (const [rid, days] of daily) {
    const res = resById.get(rid);
    const cap = Number(res.maxHoursPerDay || 10);
    const weeks = new Map();
    for (const [d, items] of days) {
      const tot = items.reduce((s, x) => s + x.hours, 0);
      const scale = tot > cap ? cap / tot : 1;
      const ws = weekStartDay(d);
      if (ws > lastFullWeek) continue;
      if (!weeks.has(ws)) weeks.set(ws, new Map());
      const lines = weeks.get(ws);
      for (const it of items) {
        const k = it.activityId;
        if (!lines.has(k)) lines.set(k, { projectId: it.projectId, activityId: it.activityId, category: 'project', hours: [0, 0, 0, 0, 0, 0, 0], note: '', claimPct: null });
        const line = lines.get(k);
        line.hours[d - ws] += it.hours * scale;
      }
    }
    for (const [ws, lines] of weeks) {
      const ls = [...lines.values()].map((l) => ({ ...l, hours: l.hours.map((h) => Math.round(h * 2) / 2) })).filter((l) => l.hours.some((h) => h > 0));
      if (!ls.length) continue;
      // occasional overhead / training line for individuals
      if (!res.company?.includes('Subcontract') && res.type === 'labour' && rand() < 0.12) {
        ls.push({ projectId: null, activityId: null, category: 'training', hours: [0, 0, 0, 0, 4, 0, 0], note: 'Technical training', claimPct: null });
      }
      let status = 'approved';
      if (ws === pendingWeek) {
        if (missingPending.has(rid)) continue;
        status = rid === 'res-R01' ? 'approved' : 'submitted';
      }
      db.timesheets.push({
        id: `tsh-${rid}-${fromDay(ws)}`, resourceId: rid, weekStart: fromDay(ws), status, lines: ls,
        createdAt: `${fromDay(ws + 4)}T16:00:00.000Z`, submittedAt: `${fromDay(ws + 4)}T16:30:00.000Z`,
        reviewedBy: status === 'approved' ? 'Priya Nair' : undefined, reviewedAt: status === 'approved' ? `${fromDay(ws + 7)}T10:00:00.000Z` : undefined,
      });
    }
  }
  // current-week draft for the demo engineer (Mon & Tue filled in)
  const cur = weekStartDay(dd);
  const eng = db.assignments.filter((a) => a.resourceId === 'res-R03').map((a) => db.activities.find((x) => x.id === a.activityId)).filter((a) => a.actualStart && !a.actualFinish);
  if (eng.length) {
    db.timesheets.push({
      id: `tsh-res-R03-${fromDay(cur)}`, resourceId: 'res-R03', weekStart: fromDay(cur), status: 'draft', createdAt: `${fromDay(cur)}T17:00:00.000Z`,
      lines: eng.slice(0, 3).map((a, i) => ({ projectId: a.projectId, activityId: a.id, category: 'project', hours: [i === 0 ? 5 : 3, i === 0 ? 4.5 : 3.5, 0, 0, 0, 0, 0], note: '', claimPct: null })),
    });
  }
}
