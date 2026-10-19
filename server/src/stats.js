// Turns the session records into the numbers that explain playtime: how long sessions last,
// how far players get, how often they fall in the lava and whether they buy anything.
import { STAGES } from '../../shared/config.js';
import { loadSessions } from './profiles.js';

const BUCKETS = [[0, 60, '<1 min'], [60, 180, '1-3 min'], [180, 300, '3-5 min'], [300, 600, '5-10 min'], [600, 1200, '10-20 min'], [1200, Infinity, '20+ min']];
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
function quantile(sorted, q) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
function lengths(list) {
    const secs = list.map((d) => d.secs).sort((a, b) => a - b);
    const mean = secs.reduce((a, b) => a + b, 0) / Math.max(1, secs.length);
    return {
        sessions: list.length,
        meanMin: Math.round(mean / 6) / 10,
        medianMin: Math.round(quantile(secs, 0.5) / 6) / 10,
        buckets: Object.fromEntries(BUCKETS.map(([a, b, name]) => [name, pct(secs.filter((s) => s >= a && s < b).length, secs.length) + '%'])),
    };
}
const avg = (list, k) => Math.round((list.reduce((a, d) => a + (d[k] || 0), 0) / Math.max(1, list.length)) * 10) / 10;

export async function statsSummary(days) {
    const since = Date.now() - days * 86400000;
    // Very short visits (under 10 s) are page bounces, counted separately
    const all = await loadSessions(since, 20000);
    const list = all.filter((d) => d.secs >= 10);
    return {
        days, since: new Date(since).toISOString(),
        bounces: all.length - list.length,
        all: lengths(list),
        newPlayers: lengths(list.filter((d) => d.fresh)),
        returning: lengths(list.filter((d) => !d.fresh)),
        neverLaunchedPct: pct(list.filter((d) => !d.launches).length, list.length),
        escapedPct: pct(list.filter((d) => d.escapes > 0).length, list.length),
        avgLaunches: avg(list, 'launches'),
        avgDeaths: avg(list, 'deaths'),
        avgLevel: avg(list, 'level'),
        avgWinsEarned: Math.round(avg(list, 'wins')),
        rebirthedPct: pct(list.filter((d) => d.rebirths > 0).length, list.length),
        boughtSomethingPct: pct(list.filter((d) => d.buys > 0).length, list.length),
        stages: STAGES.map((s, i) => ({ stage: (i + 1) + ' ' + s.name, reachedPct: pct(list.filter((d) => d.maxStage >= i).length, list.length) })),
    };
}
