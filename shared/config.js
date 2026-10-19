// Game data shared by the client and the Colyseus server.
// +1 Venom Escape: every second your symbiote grows (+1 Venom). Venom levels you up, and the higher
// your level the longer the venom tentacle you can launch. Stand on a glowing launch pad, release
// your venom, steer the tentacle across the canyon onto the next stage and zip along it. Every
// stage's Wins pad pays Wins; Wins buy symbiotes (more Venom every second) in the Win Shop; train on
// the Train Zone pads to multiply your Venom; rebirth for a permanent multiplier. Three worlds of
// fifteen stages each: escape one to unlock the next.
// There are no in-app purchases: everything is bought with Wins.

export const CFG = {
    // Roblox defaults: jump power 50, gravity 196.2 (a jump rises about 6.4 studs)
    grav: 196.2,
    jumpV: 50,
    walk: 20,
    maxPlayers: 24,
    lavaY: -8,
    // the tentacle: one meter "segment" is segLen studs; it can never be longer than maxLen
    segLen: 2.5,
    maxLen: 760,
    // turning rates while steering (radians per second) and how far it can tilt up / down
    steerYaw: 1.9,
    steerPitch: 1.5,
    maxPitch: 1.05,
    // touch / controller aim assist: how hard (radians per second) the head bends toward the next
    // platform while you aren't steering
    assist: 0.45,
    // zipping along it: studs per second (it speeds up on long tentacles so a zip never drags on)
    zipSpeed: 95,
    zipMaxSecs: 3.2,
    // Venom: +baseVenom every second, times everything else
    baseVenom: 1,
    // offline earnings: this share of your normal Venom per second (no Train Zone pad), up to offlineHours
    offlineShare: 0.35,
    offlineHours: 8,
    // a stage's Wins pad pays once per run; the same pad can't pay twice within padCooldown seconds
    padCooldown: 20,
    // the final escape portal: a run must take at least this long
    minEscapeSecs: 30,
    // a streak: every crossing in a row without falling adds streakStep to the Wins pads' pay (up to +streakMax)
    streakStep: 0.1,
    streakMax: 1,
    // venom orbs along every stretch: each is worth orbSecs seconds of your Venom per second
    orbSecs: 6,
    orbsPerStage: 6,
    // boost rings: fly the head through one for extra length and a burst of speed
    boostLen: 0.18,
    boostSpeed: 1.4,
    boostSecs: 1.3,
    boostMinutes: 15,
    friendBoost: 0.1,
    friendMax: 5,
    spawnShield: 2.5,
};

// ----- the worlds -----
// drain: how much of your tentacle the world's air leaves you (the further you go, the more it eats)
export const WORLDS = [
    { n: 1, name: 'Lava Canyon', ic: '🌋', drain: 1, escape: 2500, liquid: 'lava', theme: 'lava' },
    { n: 2, name: 'Toxic Jungle', ic: '☣️', drain: 0.55, escape: 150000, liquid: 'toxic', theme: 'toxic' },
    { n: 3, name: 'Crystal Void', ic: '🔮', drain: 0.42, escape: 10000000, liquid: 'void', theme: 'void' },
];
export const STAGES_PER_WORLD = 15;
export const worldOfStage = (i) => Math.max(1, Math.min(WORLDS.length, Math.floor(Math.max(0, i) / STAGES_PER_WORLD) + 1));
export const firstStageOf = (w) => (w - 1) * STAGES_PER_WORLD;

// ----- levels and the tentacle -----
// Total Venom needed to reach level L (level 1 = 0 Venom): steep through World 1, gentler after
// level 95 (the later worlds' multipliers are much bigger)
export function venomFor(L) {
    if (L <= 1) return 0;
    const base = 40 * (L - 1) ** 2;
    return Math.round(L <= 95 ? base * 1.165 ** (L - 1) : base * 1.165 ** 94 * 1.07 ** (L - 95));
}
export function levelOf(venom) {
    let lo = 1, hi = 600;
    if (!(venom > 0)) return 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (venomFor(mid) <= venom) lo = mid; else hi = mid - 1;
    }
    return lo;
}
// How long a tentacle you can launch at level L in world w (studs), and how fast its head flies
export function tentacleLen(L, p, w) {
    const k = p && p.passes && p.passes.LongTentacle ? 1.15 : 1;
    const drain = (WORLDS[(w || 1) - 1] || WORLDS[0]).drain;
    return Math.min(CFG.maxLen, Math.round((24 + 6 * L) * drain * k));
}
export function headSpeed(L, p) {
    const k = p && p.passes && p.passes.FastTentacle ? 1.25 : 1;
    return (28 + 0.8 * Math.min(L, 115)) * k;
}
export const segments = (len) => Math.max(1, Math.round(len / CFG.segLen));

// ----- the stages -----
// Each stage is one stretch of a world's canyon: from the launch pad on the edge of the last platform
// (or the world's hub) to the next platform. R: the recommended level (its tentacle is long enough
// with room to steer); gap: studs from edge to edge; dx / dy: where the next platform sits (sideways
// / up); w / d: its size; obs: what's in the way (shared/course.js places them); wins: what the Wins
// pad on the next platform pays (the bonus pad on its pillar pays twice that).
// Obstacles: [kind, u (0..1 along the gap), ...]:
//   pillar x size top · geyser x period phase · wall [[x y w h] holes] · half side edge · spinner x y speed
//   beam y · crusher period phase · log x period phase (a swinging spiked log) · jaws period phase
//   (snapping jaws closing across) · laser y0 y1 period phase (a bar of light sweeping up and down)
//   orbit x y radius count speed (rocks circling) · boost x y (a ring: extra length and speed)
const W1 = [
    { name: 'Lava Leap', sub: 'Release your venom and swing across!', ic: '🕷️', R: 1, gap: 14, dx: 0, dy: 0, w: 34, d: 28, wins: 1, obs: [] },
    { name: 'Hot Steps', sub: 'A little higher this time', ic: '🔥', R: 2, gap: 16, dx: 6, dy: 3, w: 32, d: 28, wins: 3, obs: [] },
    { name: 'Pillar Pass', sub: 'Steer round the stone pillars', ic: '🗿', R: 5, gap: 28, dx: -4, dy: 2, w: 32, d: 28, wins: 6, obs: [['pillar', 0.45, 2, 7, 30]] },
    { name: 'Side Swipe', sub: 'The platform is off to the side', ic: '↪️', R: 8, gap: 40, dx: 20, dy: 0, w: 28, d: 28, wins: 10, obs: [['pillar', 0.4, 9, 9, 34], ['pillar', 0.62, 26, 7, 30]] },
    { name: 'Geyser Gulch', sub: 'Lava geysers erupt: time it!', ic: '🌋', R: 12, gap: 57, dx: -8, dy: 2, w: 30, d: 28, wins: 16, obs: [['geyser', 0.3, 2, 3.2, 0], ['geyser', 0.55, -12, 3.2, 1.1], ['geyser', 0.78, -4, 3.2, 2.2]] },
    { name: 'The Window', sub: 'Thread the window in the wall', ic: '🪟', R: 16, gap: 78, dx: 4, dy: 3, w: 30, d: 30, wins: 25, obs: [['boost', 0.25, -6, 5], ['wall', 0.5, [[-14, 4, 12, 10]]]] },
    { name: 'Zig Zag', sub: 'Left, right, left!', ic: '〰️', R: 21, gap: 86, dx: -12, dy: 0, w: 30, d: 30, wins: 38, obs: [['half', 0.32, -1, 10], ['half', 0.68, 1, -6]] },
    { name: 'Spinner Storm', sub: 'Slip between the spinning blades', ic: '🌀', R: 27, gap: 132, dx: 0, dy: 4, w: 30, d: 30, wins: 56, obs: [['spinner', 0.33, 0, 4, 0.9], ['boost', 0.52, 32, 5], ['spinner', 0.7, 0, 4, -1.1]] },
    { name: 'High Ground', sub: 'Steer UP to the high platform', ic: '⛰️', R: 34, gap: 164, dx: 10, dy: 22, w: 30, d: 30, wins: 82, obs: [['pillar', 0.35, -6, 8, 20], ['beam', 0.62, 8], ['boost', 0.8, 6, 20]] },
    { name: 'Crusher Canyon', sub: 'Dodge the sliding crushers', ic: '🧱', R: 42, gap: 200, dx: -6, dy: 2, w: 30, d: 30, wins: 120, obs: [['crusher', 0.25, 2.6, 0], ['crusher', 0.5, 2.2, 0.5], ['crusher', 0.75, 2.8, 0.25]] },
    { name: 'Needle Eye', sub: 'Three walls, three tiny windows', ic: '🪡', R: 50, gap: 212, dx: 8, dy: 4, w: 28, d: 30, wins: 175, obs: [['wall', 0.25, [[16, 6, 10, 9]]], ['wall', 0.5, [[-16, 2, 10, 9]]], ['boost', 0.62, -4, 6], ['wall', 0.75, [[6, 10, 10, 9]]]] },
    { name: 'Geyser Field', sub: 'Pillars and geysers everywhere', ic: '♨️', R: 60, gap: 280, dx: -10, dy: 0, w: 28, d: 30, wins: 250, obs: [['pillar', 0.18, -14, 8, 30], ['geyser', 0.28, 10, 2.6, 0], ['pillar', 0.4, 18, 8, 30], ['geyser', 0.47, -6, 2.6, 0.9], ['pillar', 0.6, -20, 8, 30], ['geyser', 0.7, 6, 2.6, 1.7], ['pillar', 0.82, 2, 8, 30], ['geyser', 0.9, -14, 2.6, 0.4]] },
    { name: 'Serpent Pass', sub: 'Snake through the walls', ic: '🐍', R: 70, gap: 300, dx: 12, dy: 6, w: 28, d: 30, wins: 360, obs: [['half', 0.22, 1, -6], ['half', 0.47, -1, 6], ['half', 0.72, 1, -6], ['pillar', 0.88, 4, 8, 30]] },
    { name: 'Molten Maze', sub: 'Windows, blades and crushers', ic: '🔥', R: 82, gap: 400, dx: -4, dy: 8, w: 28, d: 30, wins: 520, obs: [['wall', 0.18, [[-18, 4, 11, 10], [18, 12, 11, 10]]], ['spinner', 0.38, 0, 6, 1.2], ['crusher', 0.56, 2.2, 0.3], ['wall', 0.74, [[0, 8, 11, 10]]], ['geyser', 0.88, -10, 2.4, 0.6], ['geyser', 0.88, 12, 2.4, 1.6]] },
    { name: 'Final Escape', sub: 'Everything at once. ESCAPE!', ic: '👑', R: 95, gap: 440, dx: 0, dy: 14, w: 40, d: 40, wins: 750, obs: [['half', 0.12, 1, -12], ['spinner', 0.27, -6, 6, 1.3], ['wall', 0.4, [[20, 6, 10, 9], [-20, 14, 10, 9]]], ['crusher', 0.53, 2.0, 0.6], ['half', 0.65, -1, 14], ['geyser', 0.76, 2, 2.2, 0.2], ['spinner', 0.86, 4, 10, -1.4]] },
];
const W2 = [
    { name: 'Jungle Gate', sub: 'The toxic air eats your venom!', ic: '🌿', R: 100, gap: 257, dx: 0, dy: 2, w: 32, d: 30, wins: 1200, obs: [['pillar', 0.3, -10, 8, 30], ['geyser', 0.55, 8, 3, 0], ['boost', 0.75, 0, 8]] },
    { name: 'Swinging Logs', sub: 'Spiked logs swing across', ic: '🪵', R: 103, gap: 265, dx: 8, dy: 4, w: 30, d: 30, wins: 1600, obs: [['log', 0.33, 0, 3.2, 0], ['boost', 0.5, -12, 9], ['log', 0.66, 4, 3.0, 1.4]] },
    { name: 'Snap Trap', sub: 'The jaws snap shut: time it!', ic: '🐊', R: 106, gap: 272, dx: -6, dy: 2, w: 30, d: 30, wins: 2100, obs: [['boost', 0.2, 6, 6], ['jaws', 0.45, 3.4, 0], ['pillar', 0.72, 8, 8, 30]] },
    { name: 'Vine Windows', sub: 'Through the temple walls', ic: '🏛️', R: 110, gap: 282, dx: 10, dy: 6, w: 30, d: 30, wins: 2800, obs: [['wall', 0.3, [[-12, 8, 12, 10]]], ['wall', 0.65, [[14, 6, 12, 10]]]] },
    { name: 'Toxic Springs', sub: 'Four geysers of goo', ic: '☣️', R: 114, gap: 292, dx: -10, dy: 0, w: 30, d: 30, wins: 3700, obs: [['geyser', 0.2, -8, 2.8, 0], ['geyser', 0.4, 10, 2.8, 0.7], ['boost', 0.5, -20, 6], ['geyser', 0.6, -4, 2.8, 1.4], ['geyser', 0.8, 12, 2.8, 2.1]] },
    { name: 'Log Alley', sub: 'Three logs, three timings', ic: '🪓', R: 118, gap: 302, dx: 6, dy: 4, w: 30, d: 30, wins: 4900, obs: [['log', 0.25, -4, 3.0, 0], ['log', 0.5, 4, 2.6, 1.0], ['log', 0.75, 0, 2.8, 2.0]] },
    { name: 'Thorn Wheels', sub: 'Spinning thorns', ic: '🌵', R: 122, gap: 312, dx: -4, dy: 4, w: 30, d: 30, wins: 6400, obs: [['spinner', 0.3, 0, 5, 1.0], ['boost', 0.48, 34, 6], ['spinner', 0.66, 0, 5, -1.2]] },
    { name: 'Jaw Gauntlet', sub: 'Two snapping jaws and a wall', ic: '🦖', R: 126, gap: 322, dx: 12, dy: 2, w: 28, d: 30, wins: 8500, obs: [['jaws', 0.3, 3.2, 0], ['jaws', 0.6, 3.2, 1.6], ['half', 0.85, -1, 2]] },
    { name: 'Temple Climb', sub: 'Up to the temple roof', ic: '🛕', R: 130, gap: 331, dx: -8, dy: 22, w: 30, d: 30, wins: 11000, obs: [['pillar', 0.3, 6, 8, 20], ['beam', 0.55, 8], ['wall', 0.8, [[-6, 20, 12, 10]]]] },
    { name: 'Boulder Run', sub: 'Mossy boulders slide across', ic: '🪨', R: 135, gap: 344, dx: 4, dy: 2, w: 28, d: 30, wins: 15000, obs: [['crusher', 0.25, 2.4, 0], ['crusher', 0.5, 2.0, 0.4], ['boost', 0.62, 0, 14], ['crusher', 0.75, 2.6, 0.7]] },
    { name: 'Serpent Vines', sub: 'Weave through, then a log', ic: '🐍', R: 140, gap: 356, dx: -12, dy: 4, w: 28, d: 30, wins: 20000, obs: [['half', 0.2, 1, -6], ['half', 0.42, -1, 6], ['half', 0.64, 1, -6], ['log', 0.85, -8, 2.8, 0.5]] },
    { name: 'Spore Storm', sub: 'Geysers, logs and pillars', ic: '🍄', R: 145, gap: 369, dx: 8, dy: 0, w: 28, d: 30, wins: 26000, obs: [['pillar', 0.15, -12, 8, 30], ['geyser', 0.28, 8, 2.6, 0], ['log', 0.42, 0, 2.6, 0.8], ['geyser', 0.56, -10, 2.6, 1.3], ['pillar', 0.7, 14, 8, 30], ['log', 0.84, 4, 2.4, 1.9]] },
    { name: 'Chomp Canyon', sub: 'Jaws, wheel, jaws', ic: '😬', R: 150, gap: 381, dx: -4, dy: 6, w: 28, d: 30, wins: 34000, obs: [['jaws', 0.2, 3.0, 0], ['spinner', 0.45, 0, 6, 1.3], ['jaws', 0.7, 2.8, 1.2], ['boost', 0.86, -4, 10]] },
    { name: 'Overgrowth', sub: 'Windows, a log and a boulder', ic: '🌳', R: 155, gap: 394, dx: 10, dy: 8, w: 28, d: 30, wins: 45000, obs: [['wall', 0.18, [[-16, 6, 11, 10]]], ['log', 0.38, -4, 2.6, 0], ['crusher', 0.56, 2.2, 0.5], ['wall', 0.75, [[14, 10, 11, 10]]], ['geyser', 0.9, 2, 2.4, 0.9]] },
    { name: 'Jungle Escape', sub: 'Everything the jungle has. ESCAPE!', ic: '👑', R: 160, gap: 406, dx: 0, dy: 14, w: 40, d: 40, wins: 60000, obs: [['jaws', 0.12, 3.0, 0], ['log', 0.27, 0, 2.6, 0.6], ['wall', 0.4, [[18, 6, 10, 9], [-18, 14, 10, 9]]], ['crusher', 0.53, 2.0, 0.6], ['spinner', 0.66, -4, 8, -1.3], ['half', 0.78, 1, -8], ['geyser', 0.9, 6, 2.2, 0.3]] },
];
const W3 = [
    { name: 'Void Steps', sub: 'The void drains even more venom', ic: '🔮', R: 166, gap: 317, dx: 0, dy: 3, w: 32, d: 30, wins: 80000, obs: [['pillar', 0.3, 10, 8, 30], ['boost', 0.5, -8, 8], ['pillar', 0.7, -10, 8, 30]] },
    { name: 'Laser Field', sub: 'Lasers sweep up and down', ic: '🔴', R: 171, gap: 326, dx: 6, dy: 4, w: 30, d: 30, wins: 105000, obs: [['laser', 0.35, 1, 20, 3.0, 0], ['laser', 0.7, 3, 22, 2.6, 1.2]] },
    { name: 'Asteroid Belt', sub: 'Rocks orbit in the dark', ic: '☄️', R: 176, gap: 336, dx: -8, dy: 2, w: 30, d: 30, wins: 140000, obs: [['orbit', 0.4, 0, 10, 16, 4, 0.8], ['boost', 0.58, 30, 8], ['orbit', 0.76, -6, 8, 14, 3, -1]] },
    { name: 'Crystal Windows', sub: 'Thread the crystal walls', ic: '💎', R: 181, gap: 345, dx: 10, dy: 6, w: 30, d: 30, wins: 185000, obs: [['wall', 0.3, [[16, 8, 10, 9]]], ['wall', 0.6, [[-14, 14, 10, 9]]], ['boost', 0.85, 6, 10]] },
    { name: 'Prism Spin', sub: 'Crystal blades spinning', ic: '🌀', R: 186, gap: 354, dx: -6, dy: 4, w: 30, d: 30, wins: 245000, obs: [['spinner', 0.3, 0, 6, 1.2], ['spinner', 0.65, 0, 6, -1.4], ['laser', 0.85, 2, 18, 2.6, 0.5]] },
    { name: 'Laser Grid', sub: 'Three lasers, three rhythms', ic: '⚡', R: 192, gap: 366, dx: 6, dy: 2, w: 28, d: 30, wins: 320000, obs: [['laser', 0.25, 1, 20, 2.8, 0], ['laser', 0.5, 1, 22, 2.2, 0.8], ['laser', 0.75, 2, 20, 3.2, 1.6]] },
    { name: 'Gravity Rocks', sub: 'Orbits and crystal spires', ic: '🪐', R: 198, gap: 377, dx: -10, dy: 6, w: 28, d: 30, wins: 420000, obs: [['pillar', 0.2, 12, 8, 30], ['orbit', 0.42, -4, 10, 18, 5, 0.9], ['pillar', 0.62, -16, 8, 30], ['orbit', 0.82, 6, 12, 14, 4, -1.1]] },
    { name: 'Shard Maze', sub: 'Snake through the shards', ic: '🔷', R: 204, gap: 388, dx: 12, dy: 4, w: 28, d: 30, wins: 560000, obs: [['half', 0.2, -1, 6], ['half', 0.44, 1, -6], ['half', 0.68, -1, 6], ['boost', 0.86, 14, 8]] },
    { name: 'Starfall', sub: 'Columns of starlight', ic: '🌠', R: 210, gap: 399, dx: -6, dy: 2, w: 28, d: 30, wins: 740000, obs: [['geyser', 0.18, -6, 2.6, 0], ['geyser', 0.34, 10, 2.6, 0.6], ['geyser', 0.5, -12, 2.6, 1.2], ['geyser', 0.66, 4, 2.6, 1.8], ['geyser', 0.82, -2, 2.6, 0.3]] },
    { name: 'Ring Run', sub: 'Tiny windows, big boosts', ic: '💍', R: 216, gap: 410, dx: 8, dy: 8, w: 28, d: 30, wins: 980000, obs: [['wall', 0.2, [[10, 6, 10, 9]]], ['boost', 0.32, 4, 8], ['wall', 0.45, [[-12, 10, 10, 9]]], ['boost', 0.58, -4, 12], ['wall', 0.72, [[8, 14, 10, 9]]]] },
    { name: 'Event Horizon', sub: 'A huge orbit and lasers', ic: '🕳️', R: 222, gap: 421, dx: -4, dy: 4, w: 28, d: 30, wins: 1300000, obs: [['laser', 0.2, 1, 20, 2.6, 0], ['orbit', 0.5, 0, 12, 22, 6, 0.7], ['laser', 0.8, 2, 22, 2.4, 1.1]] },
    { name: 'Crusher Nebula', sub: 'Crystal crushers and a laser', ic: '🧊', R: 228, gap: 433, dx: 10, dy: 2, w: 28, d: 30, wins: 1700000, obs: [['crusher', 0.22, 2.2, 0], ['crusher', 0.44, 2.0, 0.5], ['laser', 0.62, 1, 20, 2.4, 0.4], ['crusher', 0.8, 2.4, 0.2]] },
    { name: 'Void Serpent', sub: 'Walls and a ring of rocks', ic: '🐉', R: 234, gap: 444, dx: -12, dy: 6, w: 28, d: 30, wins: 2200000, obs: [['half', 0.18, 1, -6], ['half', 0.4, -1, 6], ['orbit', 0.6, -4, 10, 16, 4, 1.1], ['half', 0.8, 1, -4]] },
    { name: 'Cosmic Chaos', sub: 'Laser, blades, rocks, walls', ic: '🌌', R: 240, gap: 455, dx: 6, dy: 8, w: 28, d: 30, wins: 2900000, obs: [['laser', 0.15, 1, 20, 2.4, 0], ['spinner', 0.32, 0, 8, 1.4], ['orbit', 0.5, 4, 12, 16, 5, -0.9], ['wall', 0.68, [[-10, 12, 10, 9]]], ['crusher', 0.84, 2.0, 0.6]] },
    { name: 'Final Void', sub: 'The last escape of all!', ic: '👑', R: 248, gap: 470, dx: 0, dy: 16, w: 40, d: 40, wins: 3800000, obs: [['laser', 0.1, 1, 20, 2.2, 0], ['orbit', 0.24, 0, 10, 18, 5, 1.0], ['wall', 0.38, [[18, 8, 10, 9], [-18, 16, 10, 9]]], ['spinner', 0.52, -4, 8, -1.5], ['jaws', 0.64, 2.8, 0.4], ['log', 0.76, 4, 2.4, 1.0], ['laser', 0.88, 2, 24, 2.0, 0.6]] },
];
export const STAGES = [
    ...W1.map((s) => ({ ...s, world: 1 })),
    ...W2.map((s) => ({ ...s, world: 2 })),
    ...W3.map((s) => ({ ...s, world: 3 })),
];
// The escape portal on top of each world's last platform
export const ESCAPE_WINS = 2500;
export const escapeWins = (w) => (WORLDS[w - 1] || WORLDS[0]).escape;

// ----- Wins Shop: symbiotes. Every one you own adds its Venom per second; wear any one of them
// (your suit's colours, your tentacle's look: a glossy body and a neon gradient from glow to glow2).
// The last eight are sold in the World 2 and World 3 hubs once you get there. -----
export const SYMBIOTES = [
    { id: 'shadow', name: 'Shadow', venom: 3, price: 2, body: 0x16141e, glow: 0xe8f6ff, glow2: 0x7ad8ff },
    { id: 'toxic', name: 'Toxic Slime', venom: 5, price: 4, body: 0x14240e, glow: 0x7aff3a, glow2: 0xf0ff3a },
    { id: 'ember', name: 'Ember Fang', venom: 10, price: 9, body: 0x2a120a, glow: 0xff8a1a, glow2: 0xff2a5a },
    { id: 'frost', name: 'Frostbite', venom: 18, price: 18, body: 0x0e1a2a, glow: 0x7ae8ff, glow2: 0x9a8aff },
    { id: 'thunder', name: 'Thunder', venom: 30, price: 40, body: 0x101a3a, glow: 0x4a9aff, glow2: 0xffe83a },
    { id: 'sunfang', name: 'Sunfang', venom: 55, price: 80, body: 0x2a2208, glow: 0xffd23a, glow2: 0xff6a1a },
    { id: 'viper', name: 'Viper', venom: 100, price: 170, body: 0x0a2416, glow: 0x3affa0, glow2: 0x3ac8ff },
    { id: 'phantom', name: 'Phantom', venom: 180, price: 360, body: 0xd8dce8, glow: 0x8a6aff, glow2: 0xff6ad8 },
    { id: 'bloodmoon', name: 'Blood Moon', venom: 330, price: 750, body: 0x5a0a10, glow: 0xff3a3a, glow2: 0xffa03a },
    { id: 'nightshade', name: 'Nightshade', venom: 600, price: 1600, body: 0x2a0a3a, glow: 0xff5ae8, glow2: 0x8a3aff },
    { id: 'antidote', name: 'Antidote', venom: 1100, price: 3300, body: 0xeef0f6, glow: 0x1ac8ff, glow2: 0x7a3aff },
    { id: 'chimera', name: 'Chimera', venom: 1900, price: 7000, body: 0x1a2a6a, glow: 0xff4a3a, glow2: 0x3a8aff },
    { id: 'crimson', name: 'Crimson Web', venom: 3500, price: 15000, body: 0xb8141e, glow: 0x3a8aff, glow2: 0xff3a5a },
    { id: 'golden', name: 'Golden King', venom: 6200, price: 31000, body: 0xc8961a, glow: 0xfff2a0, glow2: 0xff9a1a },
    { id: 'galaxy', name: 'Galaxy', venom: 11000, price: 65000, body: 0x1a0a3a, glow: 0xb48aff, glow2: 0x3af0ff, stars: true },
    { id: 'overlord', name: 'Rainbow Overlord', venom: 20000, price: 136000, body: 0x101014, glow: 0xff5ad8, glow2: 0x3af0ff, rainbow: true },
    { id: 'junglefang', name: 'Jungle Fang', venom: 38000, price: 300000, body: 0x0e2a12, glow: 0x46ff5a, glow2: 0xffe23a, world: 2 },
    { id: 'swampking', name: 'Swamp King', venom: 70000, price: 650000, body: 0x1a2a0e, glow: 0xb8ff3a, glow2: 0x3affc8, world: 2 },
    { id: 'sporelord', name: 'Spore Lord', venom: 130000, price: 1400000, body: 0x2a0e2a, glow: 0xff7ae8, glow2: 0x9aff3a, world: 2 },
    { id: 'hydra', name: 'Emerald Hydra', venom: 240000, price: 3000000, body: 0x062a1e, glow: 0x3affa0, glow2: 0x3a8aff, world: 2 },
    { id: 'wraith', name: 'Crystal Wraith', venom: 450000, price: 7000000, body: 0x0e1a2e, glow: 0x7af6ff, glow2: 0xff9ae8, world: 3 },
    { id: 'nebula', name: 'Nebula', venom: 850000, price: 16000000, body: 0x1a0a30, glow: 0xff5ad8, glow2: 0x5a7aff, stars: true, world: 3 },
    { id: 'reaper', name: 'Void Reaper', venom: 1600000, price: 36000000, body: 0x08060c, glow: 0xff2a4a, glow2: 0x8a2aff, world: 3 },
    { id: 'emperor', name: 'Cosmic Emperor', venom: 3000000, price: 80000000, body: 0x120a1e, glow: 0xffd23a, glow2: 0x3af0ff, rainbow: true, stars: true, world: 3 },
];
export const symById = Object.fromEntries(SYMBIOTES.map((s) => [s.id, s]));
// the plain black suit you start with (not for sale)
export const BASE_SUIT = { id: '', name: 'Venom', body: 0x120e1c, glow: 0xa05aff, glow2: 0x3af0ff };
export const suitOf = (id) => symById[id] || BASE_SUIT;
export const symAvailable = (p, s) => (s.world || 1) <= (p.world || 1);

// ----- the Train Zone: stand on a pad to multiply your Venom. Unlocked by rebirths or bought with
// Wins; the World 2 and World 3 hubs have their own, bigger pads. -----
export const TRAIN_PADS = [
    { mult: 2, reb: 0 },
    { mult: 4, reb: 1 },
    { mult: 8, reb: 2 },
    { mult: 15, reb: 3 },
    { mult: 25, reb: 5 },
    { mult: 40, reb: 8 },
    { mult: 60, wins: 1500 },
    { mult: 140, wins: 6000 },
    { mult: 300, wins: 60000, world: 2 },
    { mult: 700, wins: 500000, world: 2 },
    { mult: 1500, wins: 3000000, world: 2 },
    { mult: 4000, wins: 20000000, world: 3 },
    { mult: 10000, wins: 80000000, world: 3 },
    { mult: 25000, wins: 300000000, world: 3 },
];
export const padUnlocked = (p, i) => {
    const d = TRAIN_PADS[i];
    if (!d || (d.world || 1) > (p.world || 1)) return false;
    if (d.wins) return !!(p.pads && p.pads[i]);
    return (p.rebirths || 0) >= d.reb;
};

// ----- rebirth: back to level 1 (Venom resets), keep everything else, +multiplier forever -----
export const rebirthLevel = (r) => 15 + 10 * (r || 0);
export const rebirthMult = (r) => 1 + (r || 0);

// ----- passes (owned forever) and products, all in Wins -----
export const PASSES = {
    DoubleVenom: { name: 'x2 Venom', price: 900, ic: '🧪', desc: 'Double Venom forever' },
    DoubleWins: { name: 'x2 Wins', price: 2500, ic: '🏆', desc: 'Double Wins from every pad forever' },
    FastTentacle: { name: 'Fast Tentacle', price: 400, ic: '⚡', desc: 'Your tentacle flies 25% faster' },
    LongTentacle: { name: 'Long Tentacle', price: 1500, ic: '📏', desc: 'Your tentacle is 15% longer' },
    DoubleJump: { name: 'x2 Jump', price: 250, ic: '🦘', desc: 'Jump again in mid-air' },
};
export const PRODUCTS = {
    VenomBoost: { name: 'x2 Venom Boost', price: 60, ic: '⏱️', desc: 'Double Venom for 15 minutes' },
    WinsBoost: { name: 'x2 Wins Boost', price: 150, ic: '⏱️', desc: 'Double Wins for 15 minutes' },
};
export const priceOf = (kind, key) => ((kind === 'pass' ? PASSES : PRODUCTS)[key] || {}).price;

// ----- Venom per second and the Wins multiplier -----
// onPad: the Train Zone pad you're standing on (-1 for none)
export function symbioteVenom(p) {
    let v = 0;
    for (const s of SYMBIOTES) if (p.syms && p.syms[s.id]) v += s.venom;
    return v;
}
export function venomRate(p, onPad, now, friends) {
    let r = CFG.baseVenom + symbioteVenom(p);
    if (onPad >= 0 && padUnlocked(p, onPad)) r *= TRAIN_PADS[onPad].mult;
    r *= rebirthMult(p.rebirths);
    if (p.passes && p.passes.DoubleVenom) r *= 2;
    if ((p.venomBoostUntil || 0) > now) r *= 2;
    r *= 1 + CFG.friendBoost * Math.min(CFG.friendMax, friends || 0);
    return r;
}
export function winsMult(p, now, friends) {
    let m = 1;
    if (p.passes && p.passes.DoubleWins) m *= 2;
    if ((p.boostUntil || 0) > now) m *= 2;
    m *= 1 + CFG.friendBoost * Math.min(CFG.friendMax, friends || 0);
    return m;
}

// ----- playtime gifts (minutes played this session) -----
export const GIFTS = [
    { min: 2, wins: 5 }, { min: 5, wins: 10 }, { min: 10, venomBoost: true }, { min: 15, wins: 25 },
    { min: 20, boost: true }, { min: 30, wins: 60 }, { min: 45, wins: 120 }, { min: 60, wins: 250 },
];
// ----- daily rewards (7-day streak) -----
export const DAILY = [
    { wins: 10 }, { wins: 20 }, { venomBoost: true }, { wins: 50 }, { boost: true }, { wins: 120 }, { wins: 300, sym: 'frost' },
];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
export const rewardText = (r) => [
    r.wins ? '+' + fmt(r.wins) + ' Wins' : '',
    r.boost ? '15 min x2 Wins' : '',
    r.venomBoost ? '15 min x2 Venom' : '',
    r.sym ? 'the ' + symById[r.sym].name + ' symbiote' : '',
].filter(Boolean).join(' + ');

export const CODES = {
    VENOM: { wins: 25 },
    ESCAPE: { wins: 40 },
    SYMBIOTE: { venomBoost: true },
    LEGION: { wins: 100 },
    RELEASE: { boost: true },
};

// Player outfits for the blocky fallback body (cycle by join order); the reference's black suit first
export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x24242c, socks: 0x1c1c22, hair: 0xc8641a },
    { shirt: 0x3ac8ff, shorts: 0x2a2a4a, socks: 0xffffff, hair: 0xffd028 },
    { shirt: 0xff7ab0, shorts: 0x3a3a5a, socks: 0xffffff, hair: 0x3a2618 },
    { shirt: 0x6aff5a, shorts: 0x2a3a2a, socks: 0xffffff, hair: 0x3a2618 },
    { shirt: 0xffd028, shorts: 0x3a2a1a, socks: 0xffffff, hair: 0xb8541c },
    { shirt: 0xc45aff, shorts: 0x2a1a3a, socks: 0xffffff, hair: 0xff8ad8 },
];
export const SKINS = [0xf2c9a0, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

// ----- formatting -----
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10) + u[i];
}
export const fmtComma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export function playtimeText(s) {
    s = Math.floor(s || 0);
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
