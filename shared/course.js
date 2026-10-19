// The whole map as data, shared by the client (which builds and draws it) and the server (which checks
// pads, checkpoints and the escape portals against it).
//
// The lobby is a big green studded yard boxed in by grass-topped brick walls: the spawn in the middle,
// the Train Zone pads down the west side, the Win Shop's symbiote statues down the east side, the
// leaderboards on the south wall, the World 2 and World 3 portals, and the first launch pad on the north
// edge, where World 1's lava canyon begins. Each world is a canyon running north (+z); World 2 and
// World 3 sit far off to the east (+x), each with its own hub (spawn, launch pad, bigger Train Zone
// pads, its own symbiote statues, a portal home). Each stage is a stretch of canyon with its obstacles
// and then a stone platform: Wins pad, bonus pad on a pillar beside it, and the launch pad for the
// next stage on its far edge. At the end of each world: its escape portal.
import { CFG, STAGES, TRAIN_PADS, SYMBIOTES, WORLDS, STAGES_PER_WORLD, firstStageOf } from './config.js';

export const LAVA_Y = CFG.lavaY;
export const HW = 44;              // the canyon's inner half width (x)
export const WALL_TOP = 34;        // the canyon walls' top
export const LOBBY = { x0: -64, x1: 64, z0: -76, z1: 30, y: 0, wallTop: 22 };
export const SPAWN = { x: 0, y: 0, z: -34, yaw: 0 };
// each world's centre line (x)
export const WORLD_X = [0, 2000, 4000];
export const worldOfX = (x) => Math.max(1, Math.min(WORLDS.length, Math.round(x / 2000) + 1));

// ----- the World 2 / World 3 hubs: a smaller yard at the head of their canyon -----
export const HUB = { x0: -44, x1: 44, z0: -54, z1: 30, wallTop: 22 };
export const HUBS = WORLDS.map((w, k) => (k === 0 ? null : {
    w: w.n, x: WORLD_X[k],
    spawn: { x: WORLD_X[k], y: 0, z: -28, yaw: 0 },
    portal: { x: WORLD_X[k] - 16, y: 0, z: -46 },
    sign: { x: WORLD_X[k], y: 16, z: HUB.z0 + 0.6 },
}));

// ----- the Train Zone: a row of pads along the lobby's west side; three more in each hub -----
export const TRAIN = TRAIN_PADS.map((d, i) => {
    const w = d.world || 1;
    if (w === 1) return { i, w, x: -47, z: -62 + i * 12, y: 0, s: 9, mult: d.mult };
    const k = TRAIN_PADS.slice(0, i).filter((q) => (q.world || 1) === w).length;
    return { i, w, x: WORLD_X[w - 1] - 32, z: -36 + k * 14, y: 0, s: 9, mult: d.mult };
});
export const TRAIN_SIGN = { x: -63.4, y: 15, z: -20 };
// The pad you're standing on (or -1)
export function trainPadAt(x, y, z) {
    if (y > 4 || y < -1) return -1;
    for (const p of TRAIN) if (Math.abs(x - p.x) <= p.s / 2 + 0.6 && Math.abs(z - p.z) <= p.s / 2 + 0.6) return p.i;
    return -1;
}

// ----- the Win Shop: a purple walkway down the lobby's east side, a statue on a pedestal either side;
// the world symbiotes stand in their hubs -----
export const SHOP_WALK = { x: 46, z0: -66, z1: 22, w: 10 };
export const SHOP = SYMBIOTES.map((s, i) => {
    const w = s.world || 1;
    if (w === 1) return { i, id: s.id, w, x: i % 2 ? 56 : 36, z: -60 + (i >> 1) * 11, y: 0 };
    const k = SYMBIOTES.slice(0, i).filter((q) => (q.world || 1) === w).length;
    return { i, id: s.id, w, x: WORLD_X[w - 1] + 32, z: -40 + k * 12, y: 0 };
});
export const SHOP_SIGN = { x: 63.4, y: 15, z: -20 };

// ----- the leaderboards on the south wall, the rebirth portal, the world portals, the update board -----
export const BOARDS = [
    { key: 'totalWins', title: 'Most Wins', ic: '🏆', x: -30, y: 12, z: -75 },
    { key: 'venomAll', title: 'Most Venom', ic: '🕷️', x: 0, y: 12, z: -75 },
    { key: 'rebirths', title: 'Top Rebirths', ic: '♻️', x: 30, y: 12, z: -75 },
];
export const REBIRTH = { x: -20, y: 0, z: 2 };
export const WORLD_PORTALS = [{ w: 2, x: 24, y: 0, z: 6 }, { w: 3, x: 24, y: 0, z: -14 }];
export const UPDATE_BOARD = { x: -24, y: 0, z: -16 };
// Which world portal (or hub portal home: w = 1) you're standing in, or 0
export function portalAt(x, y, z) {
    if (Math.abs(y) > 3) return 0;
    for (const p of WORLD_PORTALS) if (Math.hypot(x - p.x, z - p.z) < 4.2) return p.w;
    for (const h of HUBS) if (h && Math.hypot(x - h.portal.x, z - h.portal.z) < 4.2) return 1;
    return 0;
}

// ----- the stages -----
// Platform k is where stage k ends. Each world's first launch pad sits on the north edge of the lobby
// (World 1) or its hub.
const EDGE = LOBBY.z1;
export const LAUNCH = [];
export const PLATFORMS = [];
export const OBSTACLES = [];
export const ROUTES = [];       // a good line through each stretch (the venom orbs sit on it)
export const ORBS = [];
export const ESCAPES = [];      // per world (index 0 = World 1)
WORLDS.forEach((W, wk) => {
    const X0 = WORLD_X[wk];
    let ze = EDGE, yPrev = 0, lp = { i: firstStageOf(W.n), x: X0, y: 0, z: EDGE - 5.5, s: 10, w: W.n };
    for (let j = 0; j < STAGES_PER_WORLD; j++) {
        const i = firstStageOf(W.n) + j, st = STAGES[i];
        LAUNCH[i] = lp;
        const zs = ze + st.gap, cx = X0 + st.dx, top = st.dy, w = st.w, d = st.d;
        // the stretch before it, with its obstacles
        const obs = [];
        for (const o of st.obs) {
            const z = ze + o[1] * st.gap;
            const kind = o[0], base = { kind, zone: i, z, world: W.n };
            let ob = null;
            if (kind === 'pillar') ob = { ...base, x: X0 + o[2], s: o[3], top: o[4] };
            else if (kind === 'geyser') ob = { ...base, x: X0 + o[2], r: 3.2, period: o[3], phase: o[4], top: 30 };
            else if (kind === 'wall') ob = { ...base, t: 3, x0: X0 - HW, x1: X0 + HW, holes: o[2].map(([x, y, hw, hh]) => ({ x: X0 + x, y, w: hw, h: hh })) };
            else if (kind === 'half') {
                const side = o[2], edge = o[3];
                ob = { ...base, x0: side < 0 ? X0 - HW : X0 + edge, x1: side < 0 ? X0 + edge : X0 + HW, t: 3 };
            } else if (kind === 'spinner') ob = { ...base, x: X0 + o[2], y: o[3], speed: o[4], len: 26, t: 3.2 };
            else if (kind === 'beam') ob = { ...base, x0: X0 - HW, x1: X0 + HW, y: o[2], h: 5, t: 4 };
            else if (kind === 'crusher') ob = { ...base, x0: X0, period: o[2], phase: o[3], w: 16, d: 6, top: 30, range: HW - 10 };
            else if (kind === 'log') ob = { ...base, x: X0 + o[2], pivotY: WALL_TOP - 1, len: 28, r: 2.3, half: 8, period: o[3], phase: o[4], amp: 1.05 };
            else if (kind === 'jaws') ob = { ...base, x0: X0, period: o[2], phase: o[3], d: 6, top: WALL_TOP - 1 };
            else if (kind === 'laser') ob = { ...base, x0: X0 - HW, x1: X0 + HW, y0: o[2], y1: o[3], period: o[4], phase: o[5] };
            else if (kind === 'orbit') ob = { ...base, x: X0 + o[2], y: o[3], r: o[4], n: o[5], speed: o[6], rock: 3 };
            else if (kind === 'boost') ob = { ...base, x: X0 + o[2], y: o[3], r: 5 };
            if (ob) { OBSTACLES.push(ob); obs.push(ob); }
        }
        // the platform: Wins pad on the near side, the bonus pillar beside it (on the roomier side),
        // the next launch pad on its far edge
        const left = cx - w / 2 - (X0 - HW), right = X0 + HW - (cx + w / 2);
        const side = right >= left ? 1 : -1;
        const pillar = { x: cx + side * (w / 2 + 3 + 3.5), z: zs + 7, s: 7, top: top + 3 };
        const p = {
            i, k: i + 1, n: j + 1, world: W.n, x: cx, top, zs, ze: zs + d, w, d, prevTop: yPrev, x0: X0,
            pad: { x: cx - side * w / 4, y: top, z: zs + 8, s: 7 },
            bonus: { x: pillar.x, y: pillar.top, z: pillar.z, s: 6 },
            pillar,
            spawn: { x: cx, y: top, z: zs + Math.min(15, d / 2), yaw: 0 },
            sign: { x: cx, y: top + 15, z: zs + 1 },
        };
        PLATFORMS.push(p);
        ROUTES[i] = routeFor(lp, p, obs, X0);
        placeOrbs(i, ROUTES[i]);
        lp = { i: i + 1, x: cx, y: top, z: p.ze - 6, s: 10, w: W.n };
        ze = p.ze; yPrev = top;
    }
    const last = PLATFORMS[PLATFORMS.length - 1];
    ESCAPES[wk] = { w: W.n, x: last.x, y: last.top, z: last.ze - 10, r: 7 };
});
// World 1's escape portal (kept under its old name)
export const ESCAPE = ESCAPES[0];
export const END_Z = Math.max(...PLATFORMS.map((p) => p.ze));
export const WORLD = { x0: -100, x1: WORLD_X[WORLD_X.length - 1] + 100, y0: LAVA_Y - 20, y1: 200, z0: LOBBY.z0 - 10, z1: END_Z + 60 };
export const worldPlatforms = (w) => PLATFORMS.filter((p) => p.world === w);

// A good line through a stretch: gates round every static obstacle (round spinners' tips, beside
// geyser vents, through the middle of snapping jaws and rings of rocks) and through every boost ring,
// then down onto the landing spot (the venom orbs sit along it; the QA autopilot flies it)
function routeFor(lp, plat, obs, X0) {
    const pts = [{ x: lp.x, y: lp.y + 3.5, z: lp.z }];
    let lastX = lp.x;
    const safeY = Math.max(plat.top, plat.prevTop) + 4;
    const lineX = (z) => lp.x + (plat.x - lp.x) * (z - lp.z) / Math.max(1, plat.zs + 10 - lp.z);
    const sorted = [...obs].sort((a, b) => a.z - b.z);
    // where the line has to be next (a boost ring, a window), or the platform
    const anchor = (j) => { const q = sorted.slice(j + 1).find((n) => n.kind === 'boost' || n.kind === 'wall'); return !q ? { x: plat.x, z: plat.zs + 10 } : { x: q.kind === 'boost' ? q.x : q.holes[0].x, z: q.z }; };
    const nextX = (j) => anchor(j).x;
    // where the line so far is heading at depth z: from the last gate toward the next anchor
    const lineAt = (j, z) => { const a = pts[pts.length - 1], b = anchor(j); return a.x + (b.x - a.x) * Math.max(0, Math.min(1, (z - a.z) / Math.max(1, b.z - a.z))); };
    for (let j = 0; j < sorted.length; j++) {
        const o = sorted[j];
        if (o.kind === 'wall') { const h = o.holes.reduce((a, b) => (Math.abs(b.x - lastX) < Math.abs(a.x - lastX) ? b : a)); pts.push({ x: h.x, y: h.y, z: o.z - 7 }, { x: h.x, y: h.y, z: o.z + 7 }); lastX = h.x; }
        else if (o.kind === 'half') { const leftOpen = o.x0 > X0 - HW + 0.1; const x = leftOpen ? o.x0 - 8 : o.x1 + 8; pts.push({ x, y: safeY, z: o.z - 8 }, { x, y: safeY, z: o.z + 8 }); lastX = x; }
        else if (o.kind === 'pillar') { const s = (Math.abs(lastX - o.x) > 0.5 ? lastX : lineX(o.z)) >= o.x ? 1 : -1; const x = o.x + s * (o.s / 2 + 6); pts.push({ x, y: null, z: o.z - 4 }, { x, y: null, z: o.z + 4 }); lastX = x; }
        else if (o.kind === 'spinner') {
            // both blades cross at the hub: go round the tips (on the side that suits the line)
            const nx = nextX(j), cost = (x) => (Math.abs(x - X0) > HW - 5 ? 1e9 : Math.abs(lastX - x) + Math.abs(x - nx));
            const xa = o.x + o.len + 6, xb = o.x - o.len - 6;
            const x = Math.max(X0 - HW + 5, Math.min(X0 + HW - 5, cost(xa) <= cost(xb) ? xa : xb));
            pts.push({ x, y: null, z: o.z - 7 }, { x, y: null, z: o.z + 7 }); lastX = x;
        } else if (o.kind === 'jaws') {
            // through the middle, where the jaws open
            const x = Math.max(X0 - 6, Math.min(X0 + 6, lastX));
            pts.push({ x, y: null, z: o.z - 5 }, { x, y: null, z: o.z + 5 }); lastX = x;
        } else if (o.kind === 'geyser') {
            // beside the vent, not over it
            const lx = lineAt(j, o.z);
            if (Math.abs(lx - o.x) < o.r + 4) { const s = lx === o.x ? (nextX(j) >= o.x ? 1 : -1) : Math.sign(lx - o.x); const x = o.x + s * (o.r + 5.5); pts.push({ x, y: null, z: o.z }); lastX = x; }
        } else if (o.kind === 'orbit') {
            // through the empty middle of the ring of rocks
            pts.push({ x: o.x, y: o.y, z: o.z - 5 }, { x: o.x, y: o.y, z: o.z + 5 }); lastX = o.x;
        } else if (o.kind === 'beam') pts.push({ x: null, y: o.y + o.h / 2 + 5, z: o.z - 8 }, { x: null, y: o.y + o.h / 2 + 5, z: o.z + 8 });
        else if (o.kind === 'boost') { pts.push({ x: o.x, y: o.y, z: o.z - 5 }, { x: o.x, y: o.y, z: o.z + 5 }); lastX = o.x; }
    }
    pts.push({ x: plat.x, y: plat.top + 3.5, z: plat.zs + 3 }, { x: plat.x, y: plat.top + 0.3, z: plat.zs + 10 });
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].y === null) pts[i].y = pts[i - 1].y;
        if (pts[i].x === null) {
            let j = i + 1;
            while (j < pts.length && pts[j].x === null) j++;
            pts[i].x = j < pts.length ? pts[i - 1].x + (pts[j].x - pts[i - 1].x) * (pts[i].z - pts[i - 1].z) / Math.max(1, pts[j].z - pts[i - 1].z) : pts[i - 1].x;
        }
    }
    return pts;
}
// A point a share of the way along a route
function along(pts, k) {
    let total = 0;
    const seg = [];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); seg.push(L); total += L; }
    let d = total * k;
    for (let i = 0; i < seg.length; i++) {
        if (d <= seg[i] || i === seg.length - 1) { const t = Math.min(1, d / (seg[i] || 1)), a = pts[i], b = pts[i + 1]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }
        d -= seg[i];
    }
    return pts[pts.length - 1];
}
function placeOrbs(i, pts) {
    const n = CFG.orbsPerStage;
    for (let j = 0; j < n; j++) {
        const p = along(pts, 0.14 + 0.7 * j / (n - 1));
        // a little off the line, so collecting them all takes a bit of steering
        const off = (j % 2 ? 1 : -1) * (1.5 + (j % 3));
        ORBS.push({ i, j, key: i * 16 + j, x: p.x + off, y: Math.max(LAVA_Y + 5, p.y + (j % 3 === 1 ? 1.5 : 0)), z: p.z });
    }
}

// Which stage's stretch (0-based) a point is in: -1 in the lobby; a world hub counts as its first stage
export function stageAt(x, z) {
    const w = worldOfX(x);
    if (z < EDGE) return w === 1 ? -1 : firstStageOf(w);
    const f = firstStageOf(w);
    for (let i = f; i < f + STAGES_PER_WORLD; i++) if (z < PLATFORMS[i].ze) return i;
    return f + STAGES_PER_WORLD - 1;
}
// Where you come back after a fall: platform i, a hub (-2 = World 2, -3 = World 3), or null for the lobby
export function checkpointSpot(i) {
    if (i >= 0) { const p = PLATFORMS[i]; return p ? p.spawn : null; }
    if (i <= -2) { const h = HUBS[-i - 1]; return h ? h.spawn : null; }
    return null;
}
// The run's "last platform" a hub checkpoint stands for (crossing to the world's first platform counts)
export const runStartOf = (cp) => (cp >= 0 ? cp : cp === -1 ? -1 : firstStageOf(-cp) - 1);
// Is (x, y, z) standing on platform i?
export function onPlatform(i, x, y, z, slack) {
    const p = PLATFORMS[i];
    if (!p) return false;
    const e = slack || 0;
    return Math.abs(x - p.x) <= p.w / 2 + e && z >= p.zs - e && z <= p.ze + e && Math.abs(y - p.top) < 6 + e;
}
// In a hub's yard (World 2 / 3)?
export function inHub(w, x, z) {
    const h = HUBS[w - 1];
    return !!h && Math.abs(x - h.x) <= HUB.x1 + 2 && z >= HUB.z0 - 2 && z <= HUB.z1;
}
