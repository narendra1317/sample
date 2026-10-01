// Quantitative Schedule Risk Analysis (QSRA) — Monte Carlo simulation.
//
// Each iteration samples a duration for every incomplete activity from a
// three-point estimate (triangular or Beta-PERT), fires discrete risk events
// from the risk register (probability x impact on linked activities), then
// re-runs the full CPM engine. Output: P-dates, histogram, criticality index,
// duration sensitivity and risk ranking. In P6 this needs a separate product.

import { schedule, isMilestone, remainingDuration } from './cpm.js';
import { buildCalendars } from './calendar.js';
import { fromDay, toDay } from './dates.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function triangular(u, min, ml, max) {
  if (max <= min) return ml;
  const c = (ml - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (ml - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - ml));
}

function gammaSample(rand, k) {
  // Marsaglia & Tsang
  if (k < 1) return gammaSample(rand, k + 1) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      const u1 = rand() || 1e-12;
      const u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function pert(rand, min, ml, max) {
  if (max <= min) return ml;
  const a = 1 + (4 * (ml - min)) / (max - min);
  const b = 1 + (4 * (max - ml)) / (max - min);
  const x = gammaSample(rand, a);
  const y = gammaSample(rand, b);
  return min + ((max - min) * x) / (x + y);
}

export function threePoint(a, defaults = { low: 0.9, high: 1.25 }) {
  const ml = Number(a.duration || 0);
  const min = a.optimistic !== undefined && a.optimistic !== null && a.optimistic !== '' ? Number(a.optimistic) : ml * defaults.low;
  const max = a.pessimistic !== undefined && a.pessimistic !== null && a.pessimistic !== '' ? Number(a.pessimistic) : ml * defaults.high;
  return { min: Math.min(min, ml), ml, max: Math.max(max, ml) };
}

function pearson(xs, ys) {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * @param {object} input { project, activities, relationships, calendars, risks, iterations, seed, distribution, defaults, target }
 */
export function simulate({
  project,
  activities,
  relationships,
  calendars,
  risks = [],
  iterations = 1000,
  seed = 20260930,
  distribution = 'triangular',
  defaults = { low: 0.9, high: 1.25 },
  target,
}) {
  const cals = calendars instanceof Map ? calendars : buildCalendars(calendars);
  const rand = mulberry32(seed);
  const open = activities.filter((a) => !a.actualFinish && !isMilestone(a) && a.type !== 'loe' && Number(a.duration || 0) > 0);
  const est = new Map(open.map((a) => [a.id, threePoint(a, defaults)]));
  const activeRisks = risks.filter((r) => r.status !== 'closed' && Number(r.probability || 0) > 0 && Number(r.impactDays || 0) > 0 && (r.activityIds || []).length);

  const base = schedule({ project, activities, relationships, calendars: cals });
  const finishes = [];
  const samples = new Map(open.map((a) => [a.id, []]));
  const critCount = new Map(activities.map((a) => [a.id, 0]));
  const riskHits = new Map(activeRisks.map((r) => [r.id, { hits: 0, days: 0, delayWhenHit: 0 }]));
  const riskFlags = new Map(activeRisks.map((r) => [r.id, []]));

  for (let i = 0; i < iterations; i++) {
    const override = new Map();
    for (const a of open) {
      const e = est.get(a.id);
      const d = distribution === 'pert' ? pert(rand, e.min, e.ml, e.max) : triangular(rand(), e.min, e.ml, e.max);
      override.set(a.id, d);
      samples.get(a.id).push(d);
    }
    for (const r of activeRisks) {
      const hit = rand() < Number(r.probability);
      riskFlags.get(r.id).push(hit ? 1 : 0);
      if (!hit) continue;
      const imp = Number(r.impactDays);
      const days = triangular(rand(), imp * 0.5, imp, imp * 1.5);
      const h = riskHits.get(r.id);
      h.hits++;
      h.days += days;
      for (const aid of r.activityIds) {
        if (!override.has(aid)) continue;
        override.set(aid, override.get(aid) + days);
      }
    }
    // override holds *full* durations; cpm scales in-progress work proportionally
    const s = schedule({ project, activities, relationships, calendars: cals, options: { durationOverride: override } });
    finishes.push(s.finishPoint - 1);
    for (const id of s.longestPathIds) critCount.set(id, critCount.get(id) + 1);
  }

  const sorted = [...finishes].sort((a, b) => a - b);
  const p = (x) => fromDay(percentile(sorted, x));
  const mean = finishes.reduce((a, b) => a + b, 0) / Math.max(1, finishes.length);

  // histogram (weekly bins)
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  // weekly bins (multiples of 7) so weekends don't leave empty gaps
  const binSize = 7 * Math.max(1, Math.ceil((max - min + 1) / 7 / 26));
  const bins = [];
  for (let b = min; b <= max; b += binSize) bins.push({ from: fromDay(b), to: fromDay(b + binSize - 1), count: 0, cum: 0 });
  for (const f of finishes) bins[Math.min(bins.length - 1, Math.floor((f - min) / binSize))].count++;
  let cum = 0;
  for (const b of bins) {
    cum += b.count;
    b.cum = cum / finishes.length;
  }

  const sensitivity = open
    .map((a) => ({ id: a.id, code: a.code, name: a.name, correlation: pearson(samples.get(a.id), finishes) }))
    .filter((x) => Math.abs(x.correlation) > 0.02)
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    .slice(0, 15);

  const riskRanking = activeRisks
    .map((r) => {
      const h = riskHits.get(r.id);
      return {
        id: r.id,
        code: r.code,
        title: r.title,
        hitRate: h.hits / iterations,
        avgImpactDays: h.hits ? h.days / h.hits : 0,
        correlation: pearson(riskFlags.get(r.id), finishes),
      };
    })
    .sort((a, b) => b.correlation - a.correlation);

  const targetDay = toDay(target || project.mustFinishBy);
  const probOnTime = targetDay !== null ? finishes.filter((f) => f <= targetDay).length / finishes.length : null;

  return {
    iterations,
    deterministic: base.projectFinish,
    p10: p(10),
    p50: p(50),
    p80: p(80),
    p90: p(90),
    mean: fromDay(Math.round(mean)),
    earliest: fromDay(min),
    latest: fromDay(max),
    target: targetDay !== null ? fromDay(targetDay) : null,
    probOnTime,
    probDeterministic: finishes.filter((f) => f <= toDay(base.projectFinish)).length / finishes.length,
    histogram: bins,
    criticality: new Map([...critCount].map(([k, v]) => [k, v / iterations])),
    sensitivity,
    riskRanking,
    remainingWork: open.reduce((s, a) => s + remainingDuration(a), 0),
  };
}
