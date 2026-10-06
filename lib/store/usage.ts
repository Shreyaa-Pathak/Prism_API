import type { UsageEvent, UsageSummary } from "./types";

const HOUR = 3_600_000;

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] * 10) / 10;
}

export function summarize(events: UsageEvent[], now = Date.now()): UsageSummary {
  const end = Math.floor(now / HOUR) * HOUR;
  const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(end - (23 - i) * HOUR).toISOString(), ok: 0, limited: 0, errors: 0 }));
  const routes = new Map<string, number>();
  const latencies: number[] = [];
  let ok = 0, limited = 0, errors = 0;

  for (const e of events) {
    const idx = 23 - Math.floor((end - Math.floor(e.at / HOUR) * HOUR) / HOUR);
    const bucket = hourly[idx];
    if (e.status === 429) { limited++; if (bucket) bucket.limited++; }
    else if (e.status >= 400) { errors++; if (bucket) bucket.errors++; }
    else { ok++; if (bucket) bucket.ok++; }
    if (e.status !== 429) latencies.push(e.latencyMs);
    routes.set(e.route, (routes.get(e.route) ?? 0) + 1);
  }
  latencies.sort((x, y) => x - y);
  return {
    total: events.length,
    ok,
    limited,
    errors,
    p50: percentile(latencies, 0.5),
    p99: percentile(latencies, 0.99),
    averageMs: latencies.length ? latencies.reduce((a,b)=>a+b,0)/latencies.length : null,
    byKey: [...new Set(events.map(e=>e.keyId))].map(keyId=>({keyId,count:events.filter(e=>e.keyId===keyId).length})),
    hourly,
    routes: [...routes].map(([route, count]) => ({ route, count })).sort((x, y) => y.count - x.count).slice(0, 6),
  };
}
