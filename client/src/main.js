import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, solids, prompts, tickers,
    billboard, buildRig, animRig, airPose, floatText, updateEffects, lerpAngle, updateSky, setMood, SUN_DIRECTION,
} from './engine.js';
import { S, actions, net } from './state.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, step as surfStep, setVolume, audioSuspended, loopSound, setMusicIntensity, setMusicWorld } from './audio.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, unpackAvatar } from './avatar.js';
import { pad, pollGamepad, rumble, onGamepadConnection } from './gamepad.js';
import {
    render, updateFx, dust, sparkleColumn, ring, fireworks, setQuality, getQuality, autoQualityAllowed, splash,
    coinBurst, confetti, updateAmbient, setSpeedLines, fxWarmGroup, fxShowAll, venomBurst, lavaSplash, geyserBurst, auraFx, venomSparks,
} from './fx.js';
import {
    buildWorld, warmUp, SPAWN, SPAWN_YAW, renderBoards, updateWorld, cullZones, refreshLobby, moodOf, zoneSolids, ensureWorld, worldBuilt,
    alwaysZone, hubZone, THEMES, spinners, crushers, geysers, logs, jaws, lasers, orbits, boosts, spinnerAngle, crusherX, geyserState,
    logCenter, logAngle, jawsGap, laserY, orbitAngle, padSpots, launchPads, lavaFalls, showSigns, setOrb, resetOrbs, orbColor,
} from './world.js';
import { Tentacle, tentacleFrame } from './tentacle.js';
import { makeSuit } from './venom.js';
import { guideGeometry, guideMaterial } from './materials.js';
import { outfitUniforms, venomizeTree } from './venomMaterial.js';
import {
    updateHud, toast, showStageTitle, flash, teleportFx, renderProgress, animateCounters, bumpWins, openDailyOnJoin, refreshModal,
    refreshDaily, openModal, notEnough, promptEl, promptTxtEl, codeResult, closeTop, anyPopup, setGoal, setMeter, setLaunch,
    setTrainTag, showPadWin, showEscaped, showLevelUp, showReborn, showOffline, cheer, showStageClear, showWorldTitle, setWorldLoading, setStreak, setHome,
} from './ui.js';
import {
    CFG, STAGES, KITS, SKINS, TRAIN_PADS, WORLDS, STAGES_PER_WORLD, fmt, clamp, levelOf, tentacleLen, headSpeed, segments, padUnlocked, venomFor, suitOf,
    firstStageOf, worldOfStage, SYMBIOTES, symAvailable,
} from '../../shared/config.js';
import {
    LAVA_Y, HW, WALL_TOP, LOBBY, PLATFORMS, LAUNCH, ESCAPES, TRAIN, OBSTACLES, ROUTES, ORBS, HUBS, WORLD_X, stageAt, onPlatform, trainPadAt,
    checkpointSpot, worldOfX, portalAt,
} from '../../shared/course.js';

// =====================================================================================
// Local player
// =====================================================================================
const HWP = 1, PH = 5, STEP = 1.25, PIVOT = 2.6, CHEST = 3.4;
const P = {
    pos: SPAWN.clone(), vel: new V3(), kv: new V3(), hv: new V3(), onGround: false, ground: null, facing: SPAWN_YAW, moving: false,
    animPhase: 0, airTime: 0, peakY: 0, stage: -1, lastStepN: 0, squash: 1, squashV: 0, jumpPress: -9, coyote: 0, jumps: 0,
    mode: 'walk', modeT: 0, deathT: -9, onLaunch: -1, onTrain: -1, world: 1,
};
// Which world and stretch you're in (and the solids and prompts near you)
function locate() {
    P.world = worldOfX(P.pos.x);
    P.stage = stageAt(P.pos.x, P.pos.z);
    refreshNear(P.stage, P.world);
}
// In the lobby or a hub (before the first launch pad's edge)
const atStart = () => P.pos.z < LOBBY.z1;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let shake = 0;
function addShake(a) { if (!reduceMotion) shake = Math.min(1.2, shake + a); }
let rig = null, headLabel, nameLabelText = '';
const level = () => levelOf(shownVenom());

// The sparkly forcefield bubble you get for a moment after spawning
const shieldMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uA: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vP = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
            float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
            vec3 q = floor(vP * 5.0 + vec3(0.0, uTime * 2.0, 0.0));
            float sp = step(0.93, h(q)) * (0.5 + 0.5 * sin(uTime * 9.0 + h(q + 1.7) * 30.0));
            vec3 c = mix(vec3(0.55, 0.85, 1.0), vec3(0.75, 1.0, 0.85), 0.5 + 0.5 * sin(uTime * 2.0 + vP.y));
            gl_FragColor = vec4(c, (f * 0.7 + sp * 0.5 + 0.06) * uA);
        }`,
});
const shieldGeo = new T.SphereGeometry(3.6, 28, 18);
tickers.push((dt, t) => { shieldMat.uniforms.uTime.value = t; });
function setShield(g, secs) {
    const u = g.userData;
    if (!u.shield) { u.shield = new T.Mesh(shieldGeo, shieldMat); u.shield.position.y = 2.6; u.shield.renderOrder = 7; g.add(u.shield); }
    u.shieldT = secs;
    u.shield.visible = secs > 0;
}
function tickShield(g, dt) {
    const u = g.userData;
    if (!u.shield || u.shieldT <= 0) return;
    u.shieldT -= dt;
    u.shield.visible = u.shieldT > 0;
    u.shield.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.03);
}

// ----- a character: rig (feet, yaw) -> pivot (hips) -> body (blocky or Bloxity) + the symbiote suit -----
function buildCharacter(kit, skin) {
    const g = new T.Group();
    const pivot = new T.Group(); pivot.position.y = PIVOT; g.add(pivot);
    const k = KITS[kit % KITS.length];
    const body = buildRig({ ...k, skin: SKINS[skin % SKINS.length] });
    body.position.y = -PIVOT;
    pivot.add(body);
    const suit = makeSuit();
    body.add(suit.group);
    suit.setRoot(g);
    // the venom spreads over this body's outfit too (the blocky one, until a Bloxity avatar loads)
    suit.setBlocky(body);
    g.userData = { pivot, body, baseBody: body, suit, fxScale: 1 };
    return g;
}
// Arms forward while the tentacle grows; hanging on with one hand while zipping
function castPose(g) { const u = g.userData; u.arms[0].rotation.set(-1.5, 0, 0.15); u.arms[1].rotation.set(-1.5, 0, -0.15); u.legs[0].rotation.set(0.25, 0, 0); u.legs[1].rotation.set(-0.25, 0, 0); }
function zipPose(g) { const u = g.userData; u.arms[1].rotation.set(-3.0, 0, 0); u.arms[0].rotation.set(-2.2, 0, 0.3); u.legs[0].rotation.set(0.5, 0, 0); u.legs[1].rotation.set(0.2, 0, 0); }

// ----- Bloxity avatars: replace the blocky body's meshes, keep the pivot and the suit -----
function dressRig(group, avatar) {
    const u = group.userData, body = u.baseBody;
    body.children.forEach((c) => { if (c !== u.suit.group) c.visible = false; });
    body.add(avatar.root);
    u.blox = avatar;
    u.suit.setAvatar(avatar.root);
}
let localAvatar = null, localAvatarReq = 0;
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !rig) { a.dispose(); return; }
    if (localAvatar) localAvatar.dispose();
    localAvatar = a;
    dressRig(rig, a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (localAvatar && av) { localAvatar.setProportions(av.proportions); localAvatar.setEquipped(av, BX.getSkinTextureUrl()); if (rig) rig.userData.suit.setAvatar(localAvatar.root); }
    net.send('avatar', { av: packAvatar(av) });
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const b = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#1a1a3a', px: 44 }], 9, 1024, new V3(0, 10, 0), group);
    group.userData.bubbleLbl = b;
    setTimeout(() => { if (group.userData.bubbleLbl === b) { group.remove(b); b.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}
const nameLines = (name, lv, reb) => [
    { t: name || ' ', c: '#ffffff', s: '#1a1a3a', px: 58 },
    { t: '🕷️ Lv ' + (lv || 1) + (reb ? '  ♻️' + reb : ''), c: '#c8ff7a', s: '#1a1a3a', px: 40 },
];

function buildPlayer(kit, skin) {
    if (rig) scene.remove(rig);
    rig = buildCharacter(kit, skin);
    scene.add(rig);
    nameLabelText = '';
    headLabel = billboard(nameLines(S.name, 1, 0), 6.5, 512, new V3(0, 8.2, 0), rig);
    // like Roblox, you don't see your own name tag (it would sit over every sign you look at)
    headLabel.visible = false;
    rig.position.copy(P.pos);
    localAvatar = null;
    setupLocalAvatar();
}

// =====================================================================================
// Collision (boxes), from the sibling engine
// =====================================================================================
let nearBoxes = [], nearPrompts = prompts, nearZoneKey = null;
function refreshNear(stage, world) {
    const w = world || P.world || 1, key = stage + '|' + w + '|' + solids.length;
    if (key === nearZoneKey) return;
    nearZoneKey = key;
    const zs = new Set([stage - 1, stage, stage + 1]), AZ = alwaysZone(w), HZ = hubZone(w), f = firstStageOf(w);
    const ok = (o) => o.zone === undefined || o.zone === AZ || (o.zone === -1 ? w === 1 && stage <= 0 : o.zone === HZ ? stage <= f : o.zone >= 0 && zs.has(o.zone) && worldOfStage(o.zone) === w);
    nearBoxes = solids.filter(ok);
    nearPrompts = prompts.filter(ok);
}
const overlaps = (c, x, y, z) => !c.off && c.max.x > x - HWP && c.min.x < x + HWP && c.max.y > y && c.min.y < y + PH && c.max.z > z - HWP && c.min.z < z + HWP;
function freeAt(x, y, z) {
    for (const c of nearBoxes) if (overlaps(c, x, y, z)) return false;
    return true;
}
function moveAxis(axis, d) {
    if (d === 0) return;
    const p = P.pos;
    p[axis] += d;
    for (const c of nearBoxes) {
        if (!overlaps(c, p.x, p.y, p.z)) continue;
        if (axis === 'y') {
            if (d < 0) { if (c.max.y - p.y > Math.max(STEP, -d + 0.05)) continue; p.y = c.max.y; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; }
            else { if (p.y + PH - c.min.y > d + 0.05) continue; p.y = c.min.y - PH - 1e-4; if (P.vel.y > 0) P.vel.y = 0; }
        } else {
            const rise = c.max.y - p.y;
            if (rise > 0 && rise <= STEP && (P.onGround || P.vel.y <= 0) && freeAt(p.x, c.max.y + 0.01, p.z)) { p.y = c.max.y + 0.001; continue; }
            if (d > 0) p[axis] = c.min[axis] - HWP - 1e-4; else p[axis] = c.max[axis] + HWP + 1e-4;
        }
    }
}
function groundProbe(maxDrop) {
    const p = P.pos;
    let best = -Infinity, bs = null;
    for (const c of nearBoxes) {
        if (c.off) continue;
        if (c.max.x <= p.x - HWP || c.min.x >= p.x + HWP || c.max.z <= p.z - HWP || c.min.z >= p.z + HWP) continue;
        if (c.max.y <= p.y + 0.01 && c.max.y >= p.y - maxDrop && c.max.y > best) { best = c.max.y; bs = c; }
    }
    if (bs) { p.y = best; P.onGround = true; P.ground = bs; P.vel.y = Math.max(0, P.vel.y); }
    return !!bs;
}
const inRect = (p, r, slack) => Math.abs(p.x - r.x) <= r.s / 2 + (slack || 0) && Math.abs(p.z - r.z) <= r.s / 2 + (slack || 0);

function teleport(pos, yaw, fx) {
    P.pos.copy(pos); P.vel.set(0, 0, 0); P.kv.set(0, 0, 0); P.hv.set(0, 0, 0);
    P.facing = yaw || 0; cam.yaw = (yaw || 0) + Math.PI;
    P.peakY = pos.y; P.airTime = 0;
    if (P.mode !== 'walk') endTentacle(true);
    locate();
    cpSent = -2;
    sendMove(true);
    if (fx) { teleportFx(); sfx('teleport'); }
}
function teleportLobby() {
    teleport(SPAWN, SPAWN_YAW, true);
    net.send('lobby');
    newRun(-1);
    if (rig) { setShield(rig, CFG.spawnShield); sfx('shield'); }
}
// A fresh run (the server starts one at the same moments): no crossings, no pads, every orb back
function newRun(at) {
    run.crossed.clear(); run.claimed.clear(); run.orbs.clear(); run.at = at;
    resetOrbs();
}
// ----- going to another world: built the first time (a loading card meanwhile), then the server
// moves you to its hub (World 1: the lobby) -----
let worldLoading = false, pendingWorld = null, cardUp = false, cardSafety = 0;
async function loadWorld(w) {
    if (worldBuilt(w)) return;
    worldLoading = true;
    setWorldLoading(w);
    cardUp = true;
    clearTimeout(cardSafety);
    cardSafety = setTimeout(() => { cardUp = false; setWorldLoading(0); }, 9000);
    try { await ensureWorld(w, renderer, pause); } finally { worldLoading = false; }
}
// Once you're there: a few frames are drawn behind the card (the very first look at a new place
// costs the GPU a little), then it lifts
function liftCard() {
    if (!cardUp) return;
    cardUp = false;
    clearTimeout(cardSafety);
    let n = 0;
    const step = () => { if (++n < 14) requestAnimationFrame(step); else setWorldLoading(0); };
    requestAnimationFrame(step);
}
async function goWorld(w, after) {
    if (w > (S.world || 1)) { toast('🔒 Escape World ' + (w - 1) + ' to unlock World ' + w + '!', '#ff8a9a'); sfx('denied'); return; }
    if (worldLoading || P.mode !== 'walk') return;
    await loadWorld(w);
    pendingWorld = { w, after };
    net.send('world', { w });
}
actions.goWorld = (w) => goWorld(w);
actions.teleportLobby = () => teleportLobby();
actions.teleportTo = (i) => { if (PLATFORMS[i] && i < (S.maxStage || 0)) net.send('tp', { i }); };
// Back to your checkpoint (the platform you last stood on), or the lobby without one
function respawn(fx) {
    const spot = checkpointSpot(S.stage);
    if (spot) teleport(new V3(spot.x, spot.y + 0.2, spot.z), spot.yaw, fx !== false);
    else { teleport(SPAWN, SPAWN_YAW, fx !== false); net.send('lobby'); newRun(-1); }
    if (rig) setShield(rig, CFG.spawnShield);
}
// Into the lava: back to your checkpoint
const FELL = {
    lava: ['🌋 You fell in the lava!', '#ffa05a', '#ff6a1a'],
    toxic: ['☣️ You fell in the toxic goo!', '#b8ff6a', '#6aff2a'],
    void: ['🌌 You fell into the void!', '#d8a8ff', '#a45aff'],
};
const themeHere = () => THEMES[WORLDS[(P.world || 1) - 1].theme];
function die(why) {
    if (clockT - P.deathT < 0.8) return;
    P.deathT = clockT;
    const f = FELL[WORLDS[(P.world || 1) - 1].liquid] || FELL.lava, sp = themeHere().splash;
    flash(f[2], 600); sfx('lava'); addShake(0.8); rumble(0.7, 280);
    lavaSplash(new V3(P.pos.x, LAVA_Y + 0.5, P.pos.z), sp[0], sp[1]);
    // what sent you in (for the play stats, and a better hint): the tentacle ran out, a landing missed
    // (into the liquid or off a side), a hazard, or walking off an edge
    const recent = clockT - lastZip.t < 5, tag = !recent ? 'walk' : lastZip.reason === 'empty' ? 'short' : lastZip.reason === 'hazard' ? 'hazard' : 'missed';
    if (tag === 'short') toast('😬 Your tentacle was too short! Level up: train on a pad or buy a symbiote', '#ffd24a');
    else toast((tag === 'hazard' ? '💥 Ouch!' : f[0]) + ' Back to your checkpoint', f[1]);
    net.send('died', { why: tag });
    if (P.mode !== 'walk') endTentacle(true);
    setTimeout(() => respawn(true), 260);
}

// =====================================================================================
// The run, as the client sees it (the server decides; this only drives the HUD and the guide)
// =====================================================================================
const run = { at: -1, crossed: new Set(), claimed: new Set(), orbs: new Set() };
let cpSent = -2, padLock = 0, escLock = 0, portalLock = 0, titleShown = new Set();
function checkCourse() {
    if (!P.onGround || P.mode !== 'walk') return;
    // standing on a platform: it's your checkpoint
    const i = P.stage, pl = PLATFORMS[i];
    // (the bonus pillar beside it counts too: landing straight on it is the skill shot)
    const onPillar = pl && Math.abs(P.pos.y - pl.pillar.top) < 1 && inRect(P.pos, pl.pillar, 0.3);
    if (i >= 0 && i !== cpSent && (onPillar || (onPlatform(i, P.pos.x, P.pos.y, P.pos.z, 0) && Math.abs(P.pos.y - pl.top) < 1))) {
        cpSent = i;
        net.send('cp', { i });
    }
    // the Wins pads
    if (clockT > padLock) for (const s of padSpots) {
        if (Math.abs(s.i - P.stage) > 1 || Math.abs(P.pos.y - s.y) > 1.6 || !inRect(P.pos, s, 0.4)) continue;
        const key = s.i + (s.b ? 'b' : '');
        if (run.claimed.has(key)) continue;
        padLock = clockT + 1.2;
        net.send('pad', { i: s.i, b: s.b });
    }
    // the world's escape portal
    const E = ESCAPES[P.world - 1];
    if (E && P.stage === firstStageOf(P.world) + STAGES_PER_WORLD - 1 && clockT > escLock && Math.hypot(P.pos.x - E.x, P.pos.z - E.z) < E.r && Math.abs(P.pos.y - E.y) < 3) {
        escLock = clockT + 4;
        net.send('escape', { w: P.world });
    }
    // the world portals in the lobby, the portal home in a hub
    if (atStart() && clockT > portalLock) {
        const pw = portalAt(P.pos.x, P.pos.y, P.pos.z);
        if (pw) { portalLock = clockT + 3; goWorld(pw); }
    }
}

// =====================================================================================
// The venom tentacle: cast (the symbiote bursts out), grow (you steer its head across the lava),
// a tug as it grabs on, then zip (you're pulled along it to the head)
// =====================================================================================
const TT = {
    tent: null, yaw: 0, pitch: 0, len: 0, speed: 0, used: 0, reason: '', hitBox: null, hitTop: false,
    zipS: 0, zipLen: 0, zipSpeed: 0, dir: new V3(), zipDir: new V3(), origin: new V3(), pad: -1, steerX: 0, steerY: 0, releaseLock: 0,
    sx: 0, sy: 0, boostT: 0, boosted: new Set(), orbN: 0,
};
// Aim assist (on by default on touch screens and controllers): with the stick near the middle, the
// head drifts toward the stretch's good line (through windows, round pillars, through boost rings)
let assistPref = null;
const assistOn = () => { if (assistPref === null) assistPref = storageGet('ve_assist'); return assistPref !== '0'; };
actions.getAssist = () => assistOn();
actions.setAssist = (on) => { assistPref = on ? '1' : '0'; storageSet('ve_assist', assistPref); };
function assistPoint(i, tip) {
    const r = ROUTES[i];
    if (!r) return null;
    for (const p of r) if (p.z > tip.z + 6) return p;
    return r[r.length - 1];
}
// The venom orbs of each stretch
const orbsOf = new Map();
for (const o of ORBS) { if (!orbsOf.has(o.i)) orbsOf.set(o.i, []); orbsOf.get(o.i).push(o); }
const orbByKey = new Map(ORBS.map((o) => [o.key, o]));
function collectOrb(o, at) {
    run.orbs.add(o.key);
    setOrb(o.key, false);
    net.send('orb', { k: o.key });
    TT.orbN++;
    sfx('orb', TT.orbN);
    const c = orbColor(P.world);
    splash(at, c, 10, 0.9); ring(at, c, 3.2, 0.35);
}
function hitBoost(b, at) {
    TT.boosted.add(b);
    TT.len += tentacleLen(level(), S, P.world) * CFG.boostLen;
    TT.boostT = CFG.boostSecs;
    sfx('boost'); addShake(0.25); rumble(0.4, 160);
    ring(at, 0x5affe0, 6, 0.45); splash(at, 0x8affea, 14, 1.2);
    floatText('⚡ BOOST!', '#8affea', at.clone().add(new V3(0, 3, 0)), 3.2);
}
const HEAD_R = 1.1, HEAD_TOP = WALL_TOP - 2.5;
function launchPadUnder() {
    for (let k = 0; k < LAUNCH.length; k++) {
        const l = LAUNCH[k];
        if (Math.abs(P.pos.y - l.y) < 0.9 && inRect(P.pos, l, 0.6)) return k;
    }
    return -1;
}
let tooShortT = -9;
function startCast() {
    if (P.mode !== 'walk' || !P.onGround) return false;
    const k = launchPadUnder();
    if (k < 0) return false;
    const st = STAGES[k], L = level();
    if (st && tentacleLen(L, S, P.world) < tentacleLen(st.R, null, P.world) * 0.6) {
        if (clockT - tooShortT > 1.5) {
            tooShortT = clockT;
            toast('😬 Too short! Stage ' + (k + 1) + ' needs Level ' + st.R + ' (you\'re ' + L + '). Train or buy a symbiote first', '#ffd24a');
            sfx('denied'); nudge('#btnTrain'); nudge('#btnSyms');
        }
        return true;
    }
    P.mode = 'cast'; P.modeT = 0;
    homeOffer = -1;
    TT.pad = k;
    P.hv.set(0, 0, 0); P.kv.set(0, 0, 0); P.vel.y = 0;
    // aim where the camera looks
    TT.yaw = cam.yaw + Math.PI; TT.pitch = 0.1;
    P.facing = TT.yaw;
    if (rig) rig.userData.suit.setForm(true);
    venomBurst(P.pos.clone().setY(P.pos.y + 2.8), suitGlow());
    sfx('venom'); addShake(0.35); rumble(0.5, 200);
    net.send('launch');
    seenLaunch = true;
    return true;
}
const suitGlow = () => { const s = suitColors(); return s.glow; };
// ----- BACK HOME: once you've claimed a platform's Wins (or your tentacle is too short for the next
// stage), one tap takes you home to train and shop (World 1: the lobby; World 2 / 3: its hub) -----
let homeOffer = -1;
function homeShown() {
    if (P.mode !== 'walk' || atStart() || P.onLaunch >= 0 || anyPopup()) return false;
    const i = P.stage;
    if (i < 0 || !onPlatformLoose(i)) return false;
    if (homeOffer === i) return true;
    const st = STAGES[i + 1];
    return !!st && worldOfStage(i + 1) === P.world && tentacleLen(level(), S, P.world) < tentacleLen(st.R, null, P.world) * 0.8;
}
actions.goHome = () => {
    if (P.mode !== 'walk' || worldLoading) return;
    homeOffer = -1;
    if (P.world === 1) teleportLobby(); else goWorld(P.world);
    toast('🏠 Back home! Train your Venom and buy symbiotes, then go again', '#ffffff');
};
// a HUD button bounces for a moment (where to go next)
function nudge(sel) { const el = $(sel); if (!el) return; el.classList.remove('nudge'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('nudge'))); clearTimeout(el._nt); el._nt = setTimeout(() => el.classList.remove('nudge'), 3600); }
function beginGrow() {
    P.mode = 'grow'; P.modeT = 0;
    const L = level();
    TT.len = tentacleLen(L, S, P.world); TT.speed = headSpeed(L, S);
    TT.used = 0; TT.reason = ''; TT.hitBox = null; TT.hitTop = false;
    TT.sx = 0; TT.sy = 0; TT.boostT = 0; TT.boosted.clear(); TT.orbN = 0;
    dirFrom(TT.yaw, TT.pitch, TT.dir);
    TT.origin.set(P.pos.x, P.pos.y + CHEST, P.pos.z).addScaledVector(TT.dir, 1.2);
    if (!TT.tent) TT.tent = new Tentacle();
    TT.tent.setSuit(S.wear || '');
    TT.tent.reset(TT.origin, TT.dir);
    TT.releaseLock = clockT + 0.25;
    loopSound('stretch', 1);
}
const dirFrom = (yaw, pitch, out) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
// Where the head would hit something moving from a to b: null, or { reason, box, top }
const tmpCP = new V3();
const tmpLC = { x: 0, y: 0 };
function headHit(a, b, t) {
    if (b.y < LAVA_Y + 0.7) return { reason: 'lava' };
    const w = P.world, z = stageAt(b.x, b.z);
    const zones = [z - 1, z, z + 1, alwaysZone(w)];
    if (w === 1 && z <= 0) zones.push(-1);
    if (z <= firstStageOf(w) + 1) zones.push(hubZone(w));
    for (const zz of zones) for (const c of zoneSolids(zz)) {
        if (c.off) continue;
        tmpCP.set(clamp(b.x, c.min.x, c.max.x), clamp(b.y, c.min.y, c.max.y), clamp(b.z, c.min.z, c.max.z));
        if (tmpCP.distanceToSquared(b) >= HEAD_R * HEAD_R) continue;
        // coming down onto a top: it grabs on and you'll land there
        const over = b.x > c.min.x - 0.4 && b.x < c.max.x + 0.4 && b.z > c.min.z - 0.4 && b.z < c.max.z + 0.4;
        if (over && a.y >= c.max.y - 0.25 && c.mat !== 'wall') return { reason: 'top', box: c, top: true };
        return { reason: 'side', box: c };
    }
    // the moving hazards near the head
    if (qaNoHazards) return null;
    for (const s of spinners) {
        if (Math.abs(s.zone - z) > 1 || Math.abs(b.z - s.z) > s.t / 2 + HEAD_R) continue;
        const ang = spinnerAngle(s, t), dx = b.x - s.x, dy = b.y - s.y;
        for (let k = 0; k < 2; k++) {
            const a2 = ang + k * Math.PI / 2, ux = Math.cos(a2), uy = Math.sin(a2);
            const along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux);
            if (Math.abs(along) < s.len + 0.6 && across < s.t / 2 + HEAD_R) return { reason: 'hazard', what: 'spinner' };
        }
    }
    for (const c of crushers) {
        if (Math.abs(c.zone - z) > 1) continue;
        const cx = crusherX(c, t);
        if (Math.abs(b.x - cx) < c.w / 2 + HEAD_R && Math.abs(b.z - c.z) < c.d / 2 + HEAD_R && b.y < c.top + HEAD_R) return { reason: 'hazard', what: 'crusher' };
    }
    for (const g of geysers) {
        if (Math.abs(g.zone - z) > 1) continue;
        const gs = geyserState(g, t);
        if (gs.h > 2 && Math.hypot(b.x - g.x, b.z - g.z) < g.r + HEAD_R && b.y < LAVA_Y + gs.h) return { reason: 'hazard', what: 'geyser' };
    }
    for (const l of logs) {
        const rr = l.r + 0.6 + HEAD_R;
        if (Math.abs(l.zone - z) > 1 || Math.abs(b.z - l.z) > rr) continue;
        // the log is a segment across the canyon, tilted with the swing
        logCenter(l, t, tmpLC);
        const ang = logAngle(l, t), ux = Math.cos(ang), uy = Math.sin(ang);
        const along = clamp((b.x - tmpLC.x) * ux + (b.y - tmpLC.y) * uy, -l.half, l.half);
        if ((b.x - tmpLC.x - ux * along) ** 2 + (b.y - tmpLC.y - uy * along) ** 2 < rr * rr) return { reason: 'hazard', what: 'log' };
    }
    for (const j of jaws) {
        if (Math.abs(j.zone - z) > 1 || Math.abs(b.z - j.z) > j.d / 2 + HEAD_R || b.y > j.top + HEAD_R) continue;
        if (Math.abs(b.x - j.x0) > jawsGap(j, t) - HEAD_R) return { reason: 'hazard', what: 'jaws' };
    }
    for (const l of lasers) {
        if (Math.abs(l.zone - z) > 1 || Math.abs(b.z - l.z) > 0.35 + HEAD_R) continue;
        if (Math.abs(b.y - laserY(l, t)) < 0.35 + HEAD_R) return { reason: 'hazard', what: 'laser' };
    }
    for (const o of orbits) {
        const rr = o.rock * 0.62 + HEAD_R;
        if (Math.abs(o.zone - z) > 1 || Math.abs(b.z - o.z) > rr) continue;
        const a0 = orbitAngle(o, t);
        for (let k = 0; k < o.n; k++) {
            const a2 = a0 + k / o.n * Math.PI * 2;
            if ((b.x - o.x - Math.cos(a2) * o.r) ** 2 + (b.y - o.y - Math.sin(a2) * o.r) ** 2 < rr * rr) return { reason: 'hazard', what: 'orbit' };
        }
    }
    return null;
}
const tA = new V3(), tB = new V3();
function updateGrow(dt, st) {
    // steering: A / D (or the arrows, the stick, the on-screen arrows) turn; W / S tilt
    let sx = TT.steerX, sy = TT.steerY;
    if (keys.KeyD || keys.ArrowRight) sx += 1;
    if (keys.KeyA || keys.ArrowLeft) sx -= 1;
    if (keys.KeyW || keys.ArrowUp) sy += 1;
    if (keys.KeyS || keys.ArrowDown) sy -= 1;
    sx += touchMove.x + pad.lx; sy -= touchMove.y + pad.ly;
    sx += botInput.steer || 0; sy += botInput.tilt || 0;
    sx = clamp(sx, -1, 1); sy = clamp(sy, -1, 1);
    // keys are all-or-nothing: ease into a turn (and out of it) so the head sweeps smoothly
    const ke = Math.min(1, dt * 14);
    TT.sx += (sx - TT.sx) * ke; TT.sy += (sy - TT.sy) * ke;
    const turn = Math.sqrt(TT.speed / 30);
    TT.yaw -= TT.sx * CFG.steerYaw * turn * dt;
    TT.pitch = clamp(TT.pitch + TT.sy * CFG.steerPitch * turn * dt, -CFG.maxPitch, CFG.maxPitch);
    if (assistOn() && TT.pad >= 0 && !botInput.noAssist) {
        const tip = TT.tent.tip, q = assistPoint(TT.pad, tip);
        if (q) {
            const dx = q.x - tip.x, dz = q.z - tip.z, kx = CFG.assist * (1 - Math.min(1, Math.abs(TT.sx) * 1.6)), ky = CFG.assist * (1 - Math.min(1, Math.abs(TT.sy) * 1.6));
            let e = Math.atan2(dx, dz) - TT.yaw;
            e = Math.atan2(Math.sin(e), Math.cos(e));
            TT.yaw += e * kx * dt * 1.8;
            const wantP = clamp(Math.atan2(q.y - tip.y, Math.max(4, Math.hypot(dx, dz))), -0.55, 0.7);
            TT.pitch += (wantP - TT.pitch) * ky * dt * 1.4;
        }
    }
    meterSteer += (TT.sx - meterSteer) * Math.min(1, dt * 10);
    dirFrom(TT.yaw, TT.pitch, TT.dir);
    // fly the head forward in small steps, checking what it touches (a boost ring: faster for a moment)
    if (TT.boostT > 0) TT.boostT -= dt;
    const total = TT.speed * (TT.boostT > 0 ? CFG.boostSpeed : 1) * dt;
    const orbs = orbsOf.get(TT.pad) || [];
    const n = Math.max(1, Math.ceil(total / 0.7));
    let hit = null;
    tA.copy(TT.tent.tip);
    for (let i = 0; i < n && !hit; i++) {
        const stepLen = Math.min(total / n, TT.len - TT.used);
        if (stepLen <= 0) break;
        tB.copy(tA).addScaledVector(TT.dir, stepLen);
        if (tB.y > HEAD_TOP) { tB.y = HEAD_TOP; if (TT.pitch > 0) TT.pitch = Math.max(0, TT.pitch - dt * 4); }
        hit = headHit(tA, tB, st);
        for (const o of orbs) if (!run.orbs.has(o.key) && (tB.x - o.x) ** 2 + (tB.y - o.y) ** 2 + (tB.z - o.z) ** 2 < 7.8) collectOrb(o, tB.clone());
        for (const bo of boosts) if (bo.zone === TT.pad && !TT.boosted.has(bo) && (tA.z - bo.z) * (tB.z - bo.z) <= 0 && Math.hypot(tB.x - bo.x, tB.y - bo.y) < bo.r - 0.2) hitBoost(bo, tB.clone());
        if (hit) {
            if (hit.top) tB.y = hit.box.max.y + 0.7;
            else if (hit.reason === 'lava') tB.y = LAVA_Y + 0.5;
            else tB.copy(tA);
        }
        TT.used += tA.distanceTo(tB);
        tA.copy(tB);
    }
    TT.tent.moveTip(tA);
    loopSound('stretch', 1);
    const wantRelease = (pressedJump() || keys.KeyE) && clockT > TT.releaseLock;
    if (hit) endGrow(hit.reason, hit);
    else if (TT.used >= TT.len - 0.01) endGrow('empty');
    else if (wantRelease) endGrow('release');
}
let meterSteer = 0;
function endGrow(reason, hit) {
    TT.reason = reason; TT.hitBox = hit && hit.box; TT.hitTop = !!(hit && hit.top);
    P.mode = 'tug'; P.modeT = 0;
    loopSound('stretch', 0);
    const tip = TT.tent.tip;
    if (reason === 'top' || reason === 'side') { sfx('latch'); splash(tip, suitColors().glow, 10, 0.8); dust(tip, 8, 1.1, 0x9aa0ac); TT.tent.flash = 1; addShake(0.25); }
    else if (reason === 'lava' || reason === 'hazard') { sfx('sizzle'); lavaSplash(tip.clone()); TT.tent.flash = 0.6; }
    else sfx('snap');
    TT.zipLen = TT.tent.length();
    TT.zipSpeed = Math.max(CFG.zipSpeed, TT.zipLen / CFG.zipMaxSecs);
    TT.zipS = 0;
}
function beginZip() {
    P.mode = 'zip'; P.modeT = 0;
    sfx('zip');
    loopSound('zip', 1);
}
const zipPos = new V3();
function updateZip(dt) {
    const ramp = Math.min(1, 0.35 + P.modeT * 2.6), left = TT.zipLen - TT.zipS;
    const ease = left < 8 ? 0.55 + 0.45 * left / 8 : 1;
    TT.zipS = Math.min(TT.zipLen, TT.zipS + Math.max(14, TT.zipSpeed * ramp * ease) * dt);
    TT.tent.pointAt(TT.zipS, zipPos, TT.zipDir);
    P.pos.set(zipPos.x, zipPos.y - CHEST, zipPos.z);
    if (TT.zipDir.lengthSq() > 0.01) P.facing = Math.atan2(TT.zipDir.x, TT.zipDir.z);
    TT.tent.setStart(TT.zipS / CFG.segLen);
    locate();
    if (TT.zipS >= TT.zipLen - 0.01) finishZip();
}
let lastZip = { t: -99, reason: '' };
function finishZip() {
    loopSound('zip', 0);
    lastZip = { t: clockT, reason: TT.reason };
    const tip = TT.tent.tip, d = TT.zipDir.lengthSq() > 0.01 ? TT.zipDir : TT.dir;
    P.pos.set(tip.x, tip.y - CHEST, tip.z);
    P.vel.set(0, 0, 0); P.kv.set(0, 0, 0); P.hv.set(0, 0, 0);
    let landed = false;
    // the highest top just under the head (within your height): you drop onto it
    let under = null;
    for (const c of nearBoxes) {
        if (c.off || c.mat === 'wall' || tip.x < c.min.x - 0.3 || tip.x > c.max.x + 0.3 || tip.z < c.min.z - 0.3 || tip.z > c.max.z + 0.3) continue;
        if (c.max.y <= tip.y + 0.3 && c.max.y >= tip.y - CHEST - 1.5 && (!under || c.max.y > under.max.y)) under = c;
    }
    if (TT.hitTop && TT.hitBox) {
        P.pos.y = TT.hitBox.max.y + 0.02;
        landed = true;
    } else if (under && TT.reason !== 'side') {
        P.pos.y = under.max.y + 0.02;
        TT.hitBox = under;
        landed = true;
    } else {
        if (TT.reason === 'side') P.pos.addScaledVector(new V3(d.x, 0, d.z).normalize(), -1.7);
        // grabbed a side close under the top: climb up onto it
        const c = TT.hitBox;
        if (c && TT.reason === 'side' && c.mat !== 'wall' && c.max.y - P.pos.y < CHEST + 2.2 && c.max.y >= P.pos.y - 1) {
            P.pos.set(clamp(tip.x, c.min.x + 1.2, c.max.x - 1.2), c.max.y + 0.02, clamp(tip.z + d.z * 1.5, c.min.z + 1.2, c.max.z - 1.2));
            landed = true;
            sfx('mantle');
        } else {
            // flung off the end with a little of the zip's speed
            const h = Math.hypot(d.x, d.z) || 1;
            if (TT.reason !== 'side') P.kv.set(d.x / h * 16, 0, d.z / h * 16);
            P.vel.y = TT.reason === 'side' ? 0 : Math.max(6, d.y * 16);
        }
    }
    if (!landed && !freeAt(P.pos.x, P.pos.y, P.pos.z)) {
        // never end up inside a block: pop out above it if it's low, else back off
        for (let k = 0; k < 12 && !freeAt(P.pos.x, P.pos.y, P.pos.z); k++) P.pos.addScaledVector(new V3(d.x, 0, d.z).normalize(), -0.6);
    }
    P.onGround = landed; P.ground = landed ? TT.hitBox : null;
    if (landed) { dust(P.pos, 12, 1.4); ring(P.pos, suitColors().glow, 6, 0.45); P.squashV -= 7; sfx('land'); addShake(0.3); }
    P.peakY = P.pos.y; P.airTime = 0;
    cam.yaw = Math.atan2(d.x, d.z) + Math.PI;
    cam.pitch = 0.32;
    P.jumpPress = -9;
    endTentacle(false);
}
function endTentacle(instant) {
    P.mode = 'walk'; P.modeT = 0;
    loopSound('stretch', 0); loopSound('zip', 0);
    if (TT.tent) TT.tent.hide();
    if (rig) rig.userData.suit.setForm(false);
    void instant;
}
// the HUD's tentacle meter: segments left / segments in total
function meterState() {
    if (P.mode === 'grow' || P.mode === 'tug') return { on: true, left: Math.max(0, segments(TT.len - TT.used) - (TT.used >= TT.len - 0.01 ? 1 : 0)), total: segments(TT.len), steer: meterSteer };
    if (P.mode === 'cast') { const L = tentacleLen(level(), S, P.world); return { on: true, left: segments(L), total: segments(L), steer: 0 }; }
    return { on: false };
}
const suitColors = () => suitOf(S.wear || '');

// =====================================================================================
// The guide: what to do next (the top banner) and the chevron ribbon to it
// =====================================================================================
const guide = new T.Mesh(guideGeometry(), guideMaterial());
guide.frustumCulled = false; guide.renderOrder = 4; guide.visible = false;
scene.add(guide);
let seenLaunch = false, escapedUntil = 0, escapedText = '';
const goalTarget = new V3();
function updateGoal(dt) {
    let text = '', target = null, act = null;
    const w = P.world, L = level(), myLen = tentacleLen(L, S, w);
    const i = P.stage, start = atStart(), last = firstStageOf(w) + STAGES_PER_WORLD - 1;
    if (P.mode === 'cast' || P.mode === 'grow') text = isTouch ? 'Steer with the joystick! Tap JUMP to let go' : 'Steer with A / D (W / S up and down) · SPACE to let go';
    else if (P.mode === 'tug' || P.mode === 'zip') text = '';
    else if (clockT < escapedUntil) text = escapedText;
    else if (!start && i >= 0 && run.crossed.has(i) && !run.claimed.has(String(i)) && onPlatformLoose(i)) {
        const s = padSpots.find((p) => p.i === i && !p.b);
        text = '🏆 Step on the Wins pad for +' + fmt(STAGES[i].wins) + ' Wins!';
        if (s) target = goalTarget.set(s.x, s.y, s.z);
    } else if (!start && i === last && onPlatformLoose(i)) {
        const E = ESCAPES[w - 1];
        text = '👑 Walk into the ESCAPE portal!' + (w < WORLDS.length && (S.world || 1) <= w ? ' (it unlocks World ' + (w + 1) + ')' : '');
        target = goalTarget.set(E.x, E.y, E.z);
    } else {
        const next = start ? firstStageOf(w) : i + 1, lp = LAUNCH[next];
        // training on a pad: aim for the furthest stage you've reached, not the first one
        const aim = start && P.onTrain >= 0 ? Math.max(next, Math.min(last, S.maxStage || 0)) : next;
        const st = STAGES[aim];
        if (st && lp && (start || onPlatformLoose(i))) {
            const need = tentacleLen(st.R, null, w);
            if (myLen < need * 0.8) {
                const b = bestTrainPad(), sym = affordableSym();
                if (sym) {
                    text = '🛒 Stage ' + (aim + 1) + ' needs Level ' + st.R + '. Tap: buy ' + sym.name + ' for +' + fmt(sym.venom) + ' Venom every second!';
                    act = () => actions.buySym(sym.id);
                } else if (P.onTrain >= 0 && padUnlocked(S, P.onTrain)) {
                    text = '⚡ Training x' + fmt(TRAIN_PADS[P.onTrain].mult) + '! Level ' + L + ' → ' + Math.ceil(st.R * 0.8) + ' for Stage ' + (aim + 1) + '. Stay on the pad!';
                } else {
                    text = '⚡ Stage ' + (aim + 1) + ' needs Level ' + st.R + ' (you\'re ' + L + '). Tap to train on the x' + (b >= 0 ? fmt(TRAIN_PADS[b].mult) : 2) + ' Venom pad!';
                    act = () => actions.goTrain && actions.goTrain();
                    if (start && b >= 0 && TRAIN[b].w === w) target = goalTarget.set(TRAIN[b].x, 0, TRAIN[b].z);
                }
            } else if (start && P.onTrain >= 0 && Math.hypot(lp.x - P.pos.x, lp.z - P.pos.z) > 30) {
                // trained up: straight back to the launch pad
                text = '✅ Level ' + L + ': strong enough for Stage ' + (aim + 1) + '! Tap to go to the launch pad';
                act = () => { if (P.mode === 'walk') teleport(new V3(lp.x, lp.y + 0.3, lp.z - 2), 0, true); };
                target = goalTarget.set(lp.x, lp.y, lp.z);
            } else if (!(S.totalWins > 0) && !seenLaunch) {
                text = 'Jump to the pad to earn your first Win!';
                target = goalTarget.set(lp.x, lp.y, lp.z);
            } else {
                text = P.onLaunch >= 0 ? '🕷️ Press SPACE to RELEASE YOUR VENOM!' : '🕷️ Jump on the glowing pad and release your venom → Stage ' + (next + 1);
                if (P.onLaunch < 0) target = goalTarget.set(lp.x, lp.y, lp.z);
            }
            if (isTouch && P.onLaunch >= 0) text = '🕷️ Tap RELEASE VENOM!';
        }
    }
    setGoal(text, act);
    // the ribbon: from your feet to the target
    const show = !!target && P.mode === 'walk' && Math.hypot(target.x - P.pos.x, target.z - P.pos.z) > 7;
    guide.visible = show;
    if (show) {
        const u = guide.material.uniforms;
        const dx = target.x - P.pos.x, dz = target.z - P.pos.z, d = Math.hypot(dx, dz);
        u.uA.value.set(P.pos.x + dx / d * 2.2, P.pos.y + 0.5, P.pos.z + dz / d * 2.2);
        u.uB.value.set(target.x, target.y + 0.6, target.z);
        u.uH.value = Math.min(6, d * 0.08);
        u.uLen.value = d;
        u.uAlpha.value = Math.min(1, (d - 7) / 6);
    }
    void dt;
}
const onPlatformLoose = (i) => onPlatform(i, P.pos.x, P.pos.y, P.pos.z, 2);
function bestTrainPad() { let b = -1; for (let k = 0; k < TRAIN_PADS.length; k++) if (padUnlocked(S, k)) b = k; return b; }
// the cheapest symbiote you can buy right now (and haven't), or null
function affordableSym() {
    let best = null;
    for (const s of SYMBIOTES) if (!(S.syms && S.syms[s.id]) && symAvailable(S, s) && (S.wins || 0) >= s.price && (!best || s.price < best.price)) best = s;
    return best;
}
actions.trainPad = (i) => {
    if (padUnlocked(S, i)) return;
    const d = TRAIN_PADS[i];
    if (d.wins) actions.unlockPadConfirm && actions.unlockPadConfirm(i);
    else toast('🔒 ' + d.mult + 'x Venom unlocks at ' + d.reb + ' rebirth' + (d.reb > 1 ? 's' : '') + '!', '#d68aff');
};
// "Train" button: straight onto your best pad (in whichever world it is)
actions.goTrain = () => {
    const b = bestTrainPad();
    if (b < 0 || P.mode !== 'walk') return;
    goWorld(TRAIN[b].w, { pad: b });
};
actions.goPad = (i) => { if (padUnlocked(S, i) && P.mode === 'walk') goWorld(TRAIN[i].w, { pad: i }); };

// =====================================================================================
// Friend Boost
// =====================================================================================
let friendNames = [], friendsT = 3, friendSyncT = 5;
async function refreshFriends() {
    if (!BX.bloxity.ready || !BX.identity().loggedIn) return;
    const list = await BX.getFriends();
    friendNames = list.map((f) => f.displayName || f.username).filter(Boolean);
    syncFriends();
}
function syncFriends() {
    const room = net.room;
    if (!room || !room.state || !room.state.players || !friendNames.length) return;
    const here = [];
    room.state.players.forEach((p, id) => { if (id !== room.sessionId && friendNames.includes(p.name)) here.push(p.name); });
    net.send('friends', { names: here });
}

// =====================================================================================
// Other players (with their own tentacles)
// =====================================================================================
const remotes = new Map();
let joinSynced = false;
const rHead = new V3();
class Remote {
    constructor(p) {
        this.rig = buildCharacter(p.kit, p.skin);
        this.rig.position.set(p.x, p.y, p.z);
        this.rig.rotation.y = p.ry;
        scene.add(this.rig);
        this.label = billboard(nameLines(p.name, p.level, p.rebirths), 6, 512, new V3(0, 8.2, 0), this.rig);
        this.labelKey = '';
        this.av = null; this.blox = null; this.dead = false; this.phase = 0; this.vel = 0;
        this.lastX = p.x; this.lastZ = p.z; this.stepN = 0;
        this.tent = null; this.tentState = 0; this.head = new V3();
        this.setAvatar(p.av);
        if (Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 14 && p.y < 4) setShield(this.rig, CFG.spawnShield);
    }
    setAvatar(av) {
        this.av = av;
        const data = av ? unpackAvatar(av) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); this.rig.userData.suit.setAvatar(this.blox.root); return; }
        if (this.loading) return;
        this.loading = true;
        createAvatar(data).then((a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.blox = a;
            dressRig(this.rig, a);
            if (this.av !== av) this.setAvatar(this.av);
        });
    }
    update(p, dt, t) {
        const r = this.rig, u = r.userData;
        const here = worldOfX(p.x) === P.world;
        if (r.visible !== here) r.visible = here;
        if (!here) {
            if (this.tentState && this.tent) this.tent.hide();
            this.tentState = 0;
            r.position.set(p.x, p.y, p.z);
            return;
        }
        const zipping = p.tent === 2;
        const k = 1 - Math.exp(-dt * (zipping ? 22 : 12));
        const far = (r.position.x - p.x) ** 2 + (r.position.z - p.z) ** 2 + (r.position.y - p.y) ** 2 > (zipping ? 1e6 : 900);
        if (far) r.position.set(p.x, p.y, p.z);
        else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; }
        r.rotation.y = lerpAngle(r.rotation.y, p.ry, k);
        if (p.av !== this.av) this.setAvatar(p.av);
        const moved = Math.hypot(r.position.x - this.lastX, r.position.z - this.lastZ);
        this.vel += ((dt > 0 ? moved / dt : 0) - this.vel) * Math.min(1, dt * 6);
        this.lastX = r.position.x; this.lastZ = r.position.z;
        const air = p.anim === 2, cast = p.anim === 3, zip = p.anim === 4;
        this.casting = cast;
        const moving = p.anim === 1 && this.vel > 1;
        this.phase += dt * (moving ? Math.min(18, 4 + this.vel * 0.3) : 0);
        if (cast) castPose(u.body); else if (zip || air) zip ? zipPose(u.body) : airPose(u.body); else if (moving) animRig(u.body, this.phase, 0.85); else animRig(u.body, 0, 0);
        if (this.blox) this.blox.update(dt, { moving, air: air || zip, speed: this.vel, t, pose: cast ? 'cast' : zip ? 'zip' : undefined });
        const stepN = Math.floor(this.phase / Math.PI);
        if (moving && stepN !== this.stepN && camera.position.distanceToSquared(r.position) < 900) stepQuiet();
        this.stepN = stepN;
        u.pivot.position.y = PIVOT + (moving ? Math.abs(Math.sin(this.phase)) * 0.16 : 0);
        this.lean = (this.lean || 0) + ((moving ? 0.13 : zip ? 0.35 : 0) - (this.lean || 0)) * Math.min(1, dt * 8);
        u.pivot.rotation.set(this.lean, 0, 0);
        // the suit
        u.suit.setSuit(p.sym || ''); u.suit.setLevel(p.level || 1); u.suit.setForm(cast || zip || p.tent > 0);
        u.suit.update(dt, t);
        if (camera.position.distanceToSquared(r.position) < 3600) { const sc = suitOf(p.sym || ''); venomSparks(r.position, sc.glow, sc.glow2 ?? sc.glow, dt * (cast || zip ? 20 : moving ? 6 : 2), !!sc.rainbow); }
        // their tentacle: built from the head positions they send
        if (p.tent === 1 || p.tent === 2) {
            rHead.set(p.hx, p.hy, p.hz);
            if (!this.tent) this.tent = new Tentacle();
            if (this.tentState === 0) {
                const yaw = p.ry;
                this.tent.setSuit(p.sym || '');
                this.tent.reset(new V3(r.position.x + Math.sin(yaw) * 1.2, r.position.y + CHEST, r.position.z + Math.cos(yaw) * 1.2), new V3(Math.sin(yaw), 0, Math.cos(yaw)));
                this.head.copy(this.tent.tip);
            }
            if (p.tent === 1) {
                this.head.lerp(rHead, 1 - Math.exp(-dt * 14));
                this.tent.moveTip(this.head);
            } else {
                // reeling in behind them as they zip
                const pts = this.tent.pts;
                let best = this.tent.start | 0;
                for (let i = best; i < pts.length; i++) if (pts[i].distanceToSquared(r.position) < pts[best].distanceToSquared(r.position)) best = i;
                this.tent.setStart(Math.max(this.tent.start, best - 0.5));
            }
            this.tent.update(dt);
        } else if (this.tentState) this.tent.hide();
        this.tentState = p.tent;
        tickShield(r, dt);
        const key = p.name + '|' + p.level + '|' + p.rebirths;
        if (key !== this.labelKey) { this.labelKey = key; this.label.userData.set(nameLines(p.name, p.level, p.rebirths)); }
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        if (this.tent) this.tent.dispose();
        scene.remove(this.rig);
    }
}
let quietT = 0;
function stepQuiet() { if (clockT - quietT < 0.06) return; quietT = clockT; surfStep('stud', false); }

const seenIds = new Set();
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    const seen = seenIds;
    seen.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            S.name = p.name; S.friends = p.friends;
            if (!rig || rig.userData.kit !== p.kit) { buildPlayer(p.kit, p.skin); rig.userData.kit = p.kit; setShield(rig, CFG.spawnShield); }
            return;
        }
        seen.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p); remotes.set(id, r);
            if (joinSynced) BX.playerJoined(p.name); else BX.playerInRoom(p.name);
        }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seen.has(id)) { r.dispose(); remotes.delete(id); }
    joinSynced = true;
}

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2641` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) $('#loading').textContent = 'Waking up a server…';
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        $('#loading').textContent = 'Waking up a server…';
        const until = Date.now() + 60000;
        while (Date.now() < until) {
            await new Promise((res) => setTimeout(res, 2000));
            if (await serverUp(url)) break;
        }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const tent = P.mode === 'grow' || P.mode === 'tug' ? 1 : P.mode === 'zip' ? 2 : 0;
    const a = P.mode === 'cast' || tent === 1 ? 3 : tent === 2 ? 4 : !P.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), ry: +P.facing.toFixed(3), a, t: tent };
    if (tent && TT.tent) { const h = TT.tent.tip; m.hx = +h.x.toFixed(2); m.hy = +h.y.toFixed(2); m.hz = +h.z.toFixed(2); }
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a + ',' + tent + ',' + (m.hx || 0) + ',' + (m.hz || 0);
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    net.send('move', m);
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function playerUid() {
    let uid = storageGet('ve_uid');
    if (!uid) {
        uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        storageSet('ve_uid', uid);
    }
    return uid;
}
const sessionOf = (id) => (net.room && id === net.room.sessionId ? rig : remotes.get(id) && remotes.get(id).rig);
// Venom shown: the server's last total, counted up at its rate in between (at most a little ahead)
let qaVenom = null, qaNoHazards = false;
function shownVenom() {
    if (qaVenom !== null) return qaVenom;
    const dt = Math.min(1.25, Math.max(0, (performance.now() - (S.vAt || 0)) / 1000));
    return (S.venom || 0) + (S.rate || 0) * dt;
}
S.shownVenom = shownVenom;

let lastWins = null, lastStage = -2;
async function connect(name, endpoint) {
    const client = new Client(endpoint || await serverEndpoint());
    const id = BX.identity();
    const room = await client.joinOrCreate('venom', {
        uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()),
        save: storageGet('ve_save') || '',
    });
    net.room = room;
    joinSynced = false;
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); net.bloxity = !!m.bloxity; });
    room.onMessage('authed', () => { net.bloxity = true; });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r) playEmoteOn(r.blox, m.id); });
    room.onMessage('chat', (m) => {
        toast(m.name + ': ' + m.text, '#ffffff');
        chatBubble(sessionOf(m.s), m.text);
    });
    BX.updateRoom(room.roomId);
    BX.gameplayStart();
    room.onMessage('profile', (m) => {
        if (m.save) storageSet('ve_save', m.save);
        delete m.save;
        const first = lastWins === null;
        const { venom, ...rest } = m;
        Object.assign(S, rest);
        if (first) { S.venom = venom; S.vAt = performance.now(); }
        S.profileAt = Date.now();
        if (!first && S.wins > lastWins) bumpWins();
        lastWins = S.wins;
        if (S.stage !== lastStage) { lastStage = S.stage; }
        setStreak(S.streak || 0);
        refreshLobby();
        refreshModal(); refreshDaily();
        openDailyOnJoin();
    });
    room.onMessage('v', (m) => { S.venom = m.v; S.rate = m.r; S.onPad = m.pad; S.venomAll = m.all; S.vAt = performance.now(); });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('announce', (m) => toast(m.text, m.color));
    room.onMessage('levelUp', (m) => {
        const len = tentacleLen(m.level, S, P.world);
        showLevelUp(m.level, len);
        sfx('levelUp');
        if (rig) { sparkleColumn(P.pos, 0xb48aff); ring(P.pos, 0xc8ff7a, 7, 0.6); }
    });
    room.onMessage('cpOk', (m) => {
        S.stage = m.i;
        run.at = m.i;
        if (m.crossed) run.crossed.add(m.i);
        // teleported (or respawned) here: this platform's pads won't pay this run, so don't ask
        else if (!run.crossed.has(m.i)) { run.claimed.add(String(m.i)); run.claimed.add(m.i + 'b'); }
        if (m.crossed && !titleShown.has(m.i)) {
            titleShown.add(m.i);
            showStageClear(m.i, STAGES[m.i]);
            cheer();
            sfx('checkpoint'); rumble(0.4, 180);
            sparkleColumn(P.pos, 0xffd028); confetti(P.pos);
        }
    });
    room.onMessage('padNo', (m) => {
        if (m.why === 'cross') toast('Cross the lava to this platform to earn its Wins!', '#6fe0ff');
        else if (m.why === 'wait') toast('This pad pays again in ' + m.left + 's', '#6fe0ff');
        // try again in a moment (the checkpoint may still be on its way)
        padLock = clockT + (m.why === 'wait' ? Math.min(6, m.left || 3) : 2.5);
    });
    room.onMessage('earn', (m) => {
        floatText('+' + fmt(m.n) + ' 🏆', '#ffd028', P.pos.clone().add(new V3(0, 6.5, 0)), 4.4);
        if (m.streak > 0) floatText('🔥 STREAK +' + Math.round(m.streak * 100) + '%', '#ffb04a', P.pos.clone().add(new V3(0, 8.6, 0)), 3.4);
        if (m.why === 'pad' || m.why === 'bonus') {
            homeOffer = m.i;
            run.claimed.add(m.i + (m.why === 'bonus' ? 'b' : ''));
            if (m.why === 'pad') run.claimed.add(String(m.i));
            showPadWin(m.n, m.why === 'bonus');
            sfx(m.why === 'bonus' ? 'bonus' : 'win'); rumble(0.5, 220);
            sparkleColumn(P.pos, m.why === 'bonus' ? 0xc45aff : 0xffd028);
            ring(P.pos, m.why === 'bonus' ? 0xc45aff : 0xffd028, 8, 0.6);
            coinBurst(P.pos.clone().add(new V3(0, 3, 0)));
        }
    });
    room.onMessage('broke', (m) => { notEnough(m); sfx('denied'); });
    room.onMessage('escaped', (m) => {
        const w = m.w || 1;
        if (m.unlocked) S.world = Math.max(S.world || 1, m.unlocked);
        showEscaped(m);
        sfx('escape'); rumble(0.8, 600);
        fireworks(P.pos, 16, () => sfx('firework'));
        sparkleColumn(P.pos, 0xffd028);
        newRun(-1); titleShown.clear();
        refreshLobby();
        escapedUntil = clockT + 6.4;
        escapedText = m.unlocked ? '🎉 ESCAPED! Next stop: World ' + m.unlocked + '…' : '🎉 ESCAPED! Back to ' + (w > 1 ? 'the hub' : 'the lobby') + ' in a moment…';
        // then on to the world it unlocked (or back to this world's start for another go)
        setTimeout(() => {
            if (P.world !== w || P.stage !== firstStageOf(w) + STAGES_PER_WORLD - 1 || P.mode !== 'walk') return;
            const to = m.unlocked || w;
            if (to > 1) goWorld(to);
            else { teleportLobby(); toast('🔁 Train up and escape again!', '#7de8ff'); }
        }, 6500);
    });
    room.onMessage('tpTo', async (m) => {
        const spot = checkpointSpot(m.i);
        if (!spot) return;
        await loadWorld(worldOfStage(m.i));
        newRun(m.i); titleShown.clear();
        teleport(new V3(spot.x, spot.y + 0.2, spot.z), spot.yaw, true);
        liftCard();
        if (rig) setShield(rig, CFG.spawnShield);
        showStageTitle(m.i);
    });
    room.onMessage('worldTo', async (m) => {
        const w = m.w || 1;
        await loadWorld(w);
        const after = pendingWorld && pendingWorld.w === w ? pendingWorld.after : null;
        pendingWorld = null;
        newRun(w === 1 ? -1 : firstStageOf(w) - 1); titleShown.clear();
        S.stage = w === 1 ? -1 : -w;
        if (after && after.pad >= 0) teleport(new V3(TRAIN[after.pad].x, 0.6, TRAIN[after.pad].z), Math.PI / 2, true);
        else if (w === 1) teleport(SPAWN, SPAWN_YAW, true);
        else { const h = HUBS[w - 1].spawn; teleport(new V3(h.x, h.y + 0.2, h.z), h.yaw, true); }
        liftCard();
        if (rig) setShield(rig, CFG.spawnShield);
        portalLock = clockT + 1.5;
        if (!after) showWorldTitle(w);
    });
    room.onMessage('orbOk', (m) => {
        const o = orbByKey.get(m.k);
        if (o) floatText('+' + fmt(m.n) + ' 🕷️', '#c8ff7a', new V3(o.x, o.y + 2, o.z), 2.6);
    });
    room.onMessage('reborn', (m) => {
        showReborn(m.rebirths);
        sfx('rebirth'); flash('#d68aff', 900); addShake(0.6);
        newRun(-1); titleShown.clear();
        if (P.stage >= 0 || P.world !== 1) teleportLobby();
        if (rig) { sparkleColumn(P.pos, 0xb45aff); ring(P.pos, 0xd68aff, 12, 0.9); confetti(P.pos); }
    });
    room.onMessage('codeResult', (m) => codeResult(m));
    room.onMessage('boards', renderBoards);
    room.onMessage('fx', (m) => {
        sparkleColumn(P.pos, m.kind === 'sym' ? 0x7aff3a : 0xffd028);
        ring(P.pos, 0xffd028, 10, 0.8);
        confetti(P.pos);
        sfx('buy');
        if (m.kind === 'sym' && rig) venomBurst(P.pos.clone().setY(P.pos.y + 2.8), suitGlow());
    });
    room.onMessage('offlineOffer', (m) => {
        const tryShow = (n) => { if (anyPopup() && n < 60) setTimeout(() => tryShow(n + 1), 1000); else showOffline(m.venom, m.secs); };
        setTimeout(() => tryShow(0), 1800);
    });
    room.onMessage('earnVenom', (m) => { toast('🕷️ +' + fmt(m.n) + ' Venom collected while you were away!', '#c8ff7a'); sfx('bonus'); });
    room.onLeave((code, reason) => {
        console.warn('[net] left room', code, reason || '');
        net.room = null;
        if (code !== 1000) $('#disconnected').hidden = false;
    });
    return room;
}

// =====================================================================================
// Camera & input
// =====================================================================================
const cam = { yaw: SPAWN_YAW + Math.PI, pitch: 0.3, dist: 20, target: new V3() };
let camSens = 1;
const keys = {};
const touchMove = { x: 0, y: 0 };
let touchJump = false, running = false;

function pressJump() { P.jumpPress = clockT; }
const pressedJump = () => { if (clockT - P.jumpPress < 0.2) { P.jumpPress = -9; return true; } return false; };
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' && !e.repeat && running) pressJump();
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyE' && running && P.mode === 'walk' && activePrompt) usePrompt();
    if (e.code === 'KeyH' && running && homeShown()) actions.goHome();
    if (e.code === 'Escape') {
        if (closeTop()) return;
        if (running && BX.isEmbedded()) BX.showPortalMenu();
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const drags = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }); canvas.focus(); });
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    const k = (e.pointerType === 'touch' ? 0.008 : 0.005) * camSens;
    if (P.mode === 'grow') {
        // dragging steers the tentacle
        TT.yaw -= (e.clientX - d.x) * k * 0.9;
        TT.pitch = clamp(TT.pitch - (e.clientY - d.y) * k * 0.9, -CFG.maxPitch, CFG.maxPitch);
    } else {
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.6, 1.35);
    }
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => {
    const d = drags.get(e.pointerId);
    drags.delete(e.pointerId);
    // a click without dragging lets go of the tentacle
    if (d && e.type === 'pointerup' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7 && performance.now() - d.t0 < 350 && running && P.mode === 'grow') pressJump();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2.5, 8, 60); e.preventDefault(); }, { passive: false });

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
(function joystick() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null;
    const set = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const hold = (el, on, off) => {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
        el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    hold($('#jumpBtn'), () => { touchJump = true; pressJump(); }, () => { touchJump = false; });
    // the meter's arrows steer too (any pointer)
    for (const [sel, sx, sy] of [['#steerL', -1, 0], ['#steerR', 1, 0], ['#steerU', 0, 1], ['#steerD', 0, -1]]) {
        const el = $(sel);
        if (!el) continue;
        hold(el, () => { TT.steerX = sx || TT.steerX; TT.steerY = sy || TT.steerY; }, () => { if (sx) TT.steerX = 0; if (sy) TT.steerY = 0; });
    }
})();
actions.release = () => { if (P.mode === 'walk') { if (!startCast()) toast('Stand on a glowing launch pad first!', '#7af6ff'); } else if (P.mode === 'grow') pressJump(); };

// The sun's shadow camera follows you in steps of one shadow-map texel
const LZ = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZ).normalize(), LY = LZ.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZ, p.dot(LZ));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZ, 160);
}
// Ray against the boxes near the player (camera collision)
const AXES = ['x', 'y', 'z'];
function rayHit(o, d, maxT) {
    let best = maxT;
    for (const c of nearBoxes) {
        if (c.off || (c.max.x - c.min.x < 1.5 && c.max.z - c.min.z < 1.5)) continue;
        let t0 = 0, t1 = best, miss = false;
        for (const a of AXES) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < c.min[a] || o[a] > c.max[a]) { miss = true; break; } continue; }
            let ta = (c.min[a] - o[a]) / d[a], tb = (c.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
const camDir = new V3(), camGoal = new V3(), camPos = new V3(), chaseLook = new V3(), chasePos = new V3(), chaseWant = new V3(), flatDir = new V3();
let camD = 20, baseFov = camera.fov, chaseK = 0;
function updateCamera(dt) {
    const t = performance.now() / 1000;
    const chase = P.mode === 'grow' || P.mode === 'tug' || P.mode === 'zip' || P.mode === 'cast';
    if (!chase) {
        cam.target.lerp(camGoal.set(P.pos.x, P.pos.y + 5, P.pos.z), 1 - Math.exp(-dt * 16));
        const cp = Math.cos(cam.pitch);
        camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
        const camWant = Math.max(2.5, rayHit(cam.target, camDir, cam.dist) - 0.8);
        camD = camWant < camD ? camWant : camD + (camWant - camD) * (1 - Math.exp(-dt * 3.5));
        camPos.copy(cam.target).addScaledVector(camDir, camD);
        chaseK = Math.max(0, chaseK - dt * 2.5);
        if (chaseK > 0) camPos.lerp(chasePos, chaseK);
        camera.position.copy(camPos);
        camera.lookAt(cam.target);
    } else {
        // following the tentacle's head as it flies (or you, as you zip along it)
        let at, dir;
        if (P.mode === 'zip') { at = tB.set(P.pos.x, P.pos.y + CHEST, P.pos.z); dir = TT.zipDir; }
        else if (P.mode === 'cast') { at = tB.set(P.pos.x, P.pos.y + CHEST, P.pos.z); dir = dirFrom(TT.yaw, TT.pitch, tA); }
        else { at = TT.tent.tip; dir = TT.dir; }
        // behind and above the head (or you), a little to one side: the tentacle runs away below the view
        const back = P.mode === 'zip' ? 13 : 16.5, up = P.mode === 'zip' ? 5.2 : 8.5;
        flatDir.set(dir.x, 0, dir.z);
        if (flatDir.lengthSq() < 1e-4) flatDir.set(0, 0, 1);
        flatDir.normalize();
        chaseWant.copy(at).addScaledVector(flatDir, -back);
        chaseWant.y = at.y + up + Math.max(0, -dir.y) * 5 - Math.max(0, dir.y) * 3;
        chaseWant.x += flatDir.z * 3.2; chaseWant.z -= flatDir.x * 3.2;
        const X0 = WORLD_X[P.world - 1];
        chaseWant.x = clamp(chaseWant.x, X0 - HW + 1.5, X0 + HW - 1.5);
        chaseWant.y = Math.max(chaseWant.y, LAVA_Y + 2.5);
        if (chaseK === 0) chasePos.copy(camera.position);
        chaseK = Math.min(1, chaseK + dt * 3);
        chasePos.lerp(chaseWant, 1 - Math.exp(-dt * (P.mode === 'zip' ? 10 : 7)));
        chaseLook.copy(at).addScaledVector(dir, 11); chaseLook.y -= 1;
        camera.position.copy(camPos.copy(camera.position).lerp(chasePos, chaseK));
        camera.lookAt(chaseLook);
        cam.target.copy(P.pos).setY(P.pos.y + 5);
    }
    if (shake > 0.001) {
        const s = shake * shake * 0.9;
        camera.position.x += (Math.random() * 2 - 1) * s;
        camera.position.y += (Math.random() * 2 - 1) * s;
        shake = Math.max(0, shake - dt * 2.2);
    }
    const fovBase = innerWidth < innerHeight ? 85 : 70;
    const want = fovBase + (P.mode === 'grow' ? 6 : P.mode === 'zip' ? 14 : 0);
    baseFov += (want - baseFov) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - baseFov) > 0.01) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    snapShadow(P.mode === 'grow' ? TT.tent.tip : P.pos);
    const camStage = stageAt(camera.position.x, camera.position.z), here = Math.max(camStage, P.stage);
    cullZones(here, P.world);
    const m = moodOf(here, P.world);
    setMood(m.mood);
    setMusicWorld(P.world);
    setMusicIntensity(atStart() ? 0 : 1 + Math.min(2, Math.floor((P.stage - firstStageOf(P.world)) / 5)));
    updateSky(camera.position, t, dt);
    updateAmbient(camera.position, t, m.amb);
}

// Proximity prompts
let activePrompt = null, promptX = -1, promptY = -1;
const projV = new V3();
function updatePrompt() {
    let best = null, bd = Infinity;
    if (P.mode === 'walk') for (const p of nearPrompts) {
        const d = Math.hypot(p.pos.x - P.pos.x, p.pos.z - P.pos.z);
        if (d < p.r && d < bd && Math.abs(P.pos.y - p.pos.y) < 6) { bd = d; best = p; }
    }
    activePrompt = best;
    if (!best || anyPopup()) { promptEl.hidden = true; return; }
    projV.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (projV.z > 1) { promptEl.hidden = true; return; }
    promptEl.hidden = false;
    const px = Math.round((projV.x + 1) / 2 * innerWidth), py = Math.round((1 - projV.y) / 2 * innerHeight);
    if (px !== promptX || py !== promptY) { promptX = px; promptY = py; promptEl.style.transform = `translate(${px}px, ${py}px) translate(-50%, -110%)`; }
    const txt = best.label();
    if (promptTxtEl.textContent !== txt) promptTxtEl.textContent = txt;
    promptEl.classList.toggle('passive', !!(best.passive && best.passive()));
}
function usePrompt() { if (activePrompt && !(activePrompt.passive && activePrompt.passive())) activePrompt.act(); }
promptEl.addEventListener('click', usePrompt);

// Controller: popups first, then gameplay
let padJumpWas = false;
function padButtons() {
    if (pad.jump && !padJumpWas && running) pressJump();
    padJumpWas = pad.jump;
    const p = pad.pressed;
    if (!p.size) return;
    if (p.has('B') && closeTop()) return;
    if (!running) return;
    if (p.has('X') && activePrompt) usePrompt();
    if (p.has('Y')) openModal('shop');
    if (p.has('BACK')) openModal('teleport');
    if (p.has('START')) openModal('config');
    if (p.has('UP')) cam.dist = clamp(cam.dist - 4, 8, 60);
    if (p.has('DOWN')) cam.dist = clamp(cam.dist + 4, 8, 60);
}
onGamepadConnection((g, on) => { if (running) toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected', on ? '#7dff6b' : '#ffb51c'); });

// =====================================================================================
// Main update
// =====================================================================================
const botInput = { f: 0, r: 0, jump: false, steer: 0, tilt: 0 };
let qaWalk = 0;
let clockT = 0, hudT = 0, fallsT = 0;
const tmpF = new V3(), tmpR = new V3(), mv = new V3();
function update(dt) {
    clockT += dt;
    const t = clockT, st = net.now() / 1000;
    let f = botInput.f, r = botInput.r;
    if (P.mode === 'walk') {
        if (keys.KeyW || keys.ArrowUp) f += 1;
        if (keys.KeyS || keys.ArrowDown) f -= 1;
        if (keys.KeyD || keys.ArrowRight) r += 1;
        if (keys.KeyA || keys.ArrowLeft) r -= 1;
        f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
        cam.yaw -= pad.rx * 2.8 * dt;
        cam.pitch = clamp(cam.pitch + pad.ry * 1.8 * dt, -0.6, 1.35);
    } else { f = 0; r = 0; }
    tmpF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    tmpR.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    mv.set(0, 0, 0).addScaledVector(tmpF, f).addScaledVector(tmpR, r);
    if (mv.lengthSq() > 1) mv.normalize();
    if (anyPopup() && !isTouch) mv.set(0, 0, 0);
    P.moving = mv.lengthSq() > 0.01;

    updateWorld(dt, t, Math.max(P.stage, stageAt(camera.position.x, camera.position.z)), P.pos);
    P.modeT += dt;
    S.here = P.world;

    if (P.mode === 'walk') {
        // ----- jump (or release your venom on a launch pad) -----
        P.onLaunch = P.onGround ? launchPadUnder() : -1;
        const jumped = clockT - P.jumpPress < 0.2;
        if (P.onGround) { P.coyote = 0.1; P.jumps = 0; } else P.coyote -= dt;
        if (jumped && P.onLaunch >= 0 && startCast()) { P.jumpPress = -9; }
        else if (jumped && (P.onGround || P.coyote > 0)) {
            P.vel.y = CFG.jumpV; P.onGround = false; P.coyote = 0; P.jumpPress = -9; P.ground = null;
            sfx('jump'); P.squashV += 5;
        } else if (jumped && !P.onGround && S.passes && S.passes.DoubleJump && P.jumps < 1) {
            P.jumps++; P.vel.y = CFG.jumpV * 0.92; P.jumpPress = -9;
            sfx('jump2'); ring(P.pos, 0x9affd8, 4, 0.35); dust(P.pos, 6, 0.8, 0xffffff);
        }
        P.vel.y -= CFG.grav * dt;
        const ws = qaWalk || CFG.walk;
        P.hv.set(mv.x * ws, 0, mv.z * ws);
        const vx = P.hv.x + P.kv.x, vz = P.hv.z + P.kv.z;
        P.kv.multiplyScalar(Math.exp(-dt * (P.onGround ? 9 : 0.8)));
        const dist = Math.max(Math.abs(vx), Math.abs(vz), Math.abs(P.vel.y)) * dt;
        const n = Math.max(1, Math.ceil(dist / 0.5));
        const sdt = dt / n;
        const wasOn = P.onGround;
        P.onGround = false; P.ground = null;
        let vy = P.vel.y + 0.5 * CFG.grav * dt;
        for (let i = 0; i < n; i++) {
            moveAxis('x', vx * sdt); moveAxis('z', vz * sdt);
            const before = P.vel.y;
            moveAxis('y', vy * sdt);
            if (P.vel.y !== before) vy = P.vel.y;
        }
        if (!P.onGround && wasOn && P.vel.y <= 0) groundProbe(0.7);
        else if (!P.onGround && P.vel.y <= 0) groundProbe(0.05);
        if (P.onGround) {
            if (P.airTime > 0.25 && P.ground) { surfStep('stud', true); dust(P.pos, P.airTime > 0.8 ? 10 : 5, P.airTime > 0.8 ? 1.3 : 0.9); P.squashV -= P.airTime > 0.8 ? 8 : 4; }
            P.airTime = 0; P.peakY = P.pos.y;
        } else { P.airTime += dt; P.peakY = Math.max(P.peakY, P.pos.y); }
        if (P.moving) P.facing = lerpAngle(P.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 14));
        locate();
        if (P.pos.y < LAVA_Y + 0.6) die('lava');
        checkCourse();
        P.onTrain = P.onGround ? trainPadAt(P.pos.x, P.pos.y, P.pos.z) : -1;
    } else if (P.mode === 'cast') {
        if (P.modeT >= 0.32) beginGrow();
    } else if (P.mode === 'grow') {
        updateGrow(dt, st);
    } else if (P.mode === 'tug') {
        if (P.modeT >= 0.16) beginZip();
    } else if (P.mode === 'zip') {
        updateZip(dt);
    }
    if (TT.tent) TT.tent.update(dt);
    tentacleFrame(t);

    if (S.name && headLabel) {
        const key = S.name;
        if (key !== nameLabelText) { nameLabelText = key; headLabel.userData.set(nameLines(S.name, level(), S.rebirths)); }
    }
    updateEffects(dt);
    updateFx(dt);
    for (const fn of tickers) fn(dt, t);
    // sparks where the lava falls hit the lava, while you're near
    fallsT -= dt;
    if (fallsT <= 0) {
        fallsT = 0.12;
        for (const l of lavaFalls) if (l.world === P.world && Math.abs(l.z - camera.position.z) < 120 && Math.random() < 0.6) splash(new V3(l.x, LAVA_Y + 0.4, l.z + (Math.random() - 0.5) * l.w), l.c[Math.random() < 0.5 ? 0 : 1], 3, 0.8);
    }

    syncRemotes(dt, t);
    friendsT -= dt; friendSyncT -= dt;
    if (friendsT <= 0) { friendsT = 30; friendSyncT = 5; refreshFriends(); }
    else if (friendSyncT <= 0) { friendSyncT = 5; syncFriends(); }

    // ----- the local character -----
    if (rig) {
        const u = rig.userData, L = level();
        rig.position.copy(P.pos);
        rig.rotation.y = P.facing;
        const walking = P.mode === 'walk' && P.onGround && P.moving;
        P.animPhase += dt * (walking ? Math.min(18, 4 + CFG.walk * 0.3) : 0);
        if (P.mode === 'cast' || P.mode === 'grow' || P.mode === 'tug') castPose(u.body);
        else if (P.mode === 'zip') zipPose(u.body);
        else if (!P.onGround) airPose(u.body);
        else if (P.moving) animRig(u.body, P.animPhase, 0.85);
        else animRig(u.body, 0, 0);
        if (localAvatar) localAvatar.update(dt, { moving: walking, air: P.mode === 'walk' && !P.onGround, speed: CFG.walk, t, pose: P.mode === 'zip' ? 'zip' : P.mode !== 'walk' ? 'cast' : undefined });
        u.suit.setSuit(S.wear || ''); u.suit.setLevel(L); u.suit.update(dt, t);
        const stepN = Math.floor(P.animPhase / Math.PI);
        if (walking && stepN !== P.lastStepN) surfStep(P.ground && P.ground.mat === 'grass' ? 'grass' : 'stud', false);
        P.lastStepN = stepN;
        const runBob = walking ? Math.abs(Math.sin(P.animPhase)) * 0.18 : 0;
        u.pivot.position.y = PIVOT + runBob;
        const leanTo = P.mode === 'zip' ? 0.5 : walking ? 0.14 : P.mode === 'walk' && !P.onGround ? -0.06 : 0;
        P.lean = (P.lean || 0) + (leanTo - (P.lean || 0)) * Math.min(1, dt * 9);
        u.pivot.rotation.set(P.lean, 0, 0);
        P.squashV += (1 - P.squash) * 180 * dt;
        P.squashV *= Math.exp(-12 * dt);
        P.squash = clamp(P.squash + P.squashV * dt, 0.72, 1.28);
        rig.scale.set(1 / Math.sqrt(P.squash), P.squash, 1 / Math.sqrt(P.squash));
        tickShield(rig, dt);
        // a sparkle aura while training on a pad
        if (P.onTrain >= 0 && padUnlocked(S, P.onTrain)) auraFx(P.pos, false, dt);
        // venom sparks in the suit's two glow colours, more of them the stronger it is
        const sc = suitColors();
        venomSparks(P.pos, sc.glow, sc.glow2 ?? sc.glow, dt * (P.mode !== 'walk' ? 26 : walking ? 7 + Math.min(10, L / 6) : 2.5 + Math.min(4, L / 15)), !!sc.rainbow);
    }
    const zipping = P.mode === 'zip';
    setSpeedLines(!reduceMotion && (zipping || P.mode === 'grow') ? (zipping ? 0.75 : 0.35) : 0, dt);

    // the tornado over your launch pad would wash the view out while you're inside it
    // (and over anyone casting from it, so their black monster form isn't tinted by it)
    for (const lp of launchPads) {
        let busy = P.onLaunch === lp.i || (P.mode !== 'walk' && TT.pad === lp.i);
        if (!busy) for (const r of remotes.values()) if (r.tentState === 1 || r.casting) { const q = r.rig.position; if (Math.abs(q.x - lp.x) < lp.s && Math.abs(q.z - lp.z) < lp.s && Math.abs(q.y - lp.y) < 3) { busy = true; break; } }
        lp.swirl.visible = !busy;
    }
    const cp = S.stage ?? -1;
    showSigns(atStart() ? firstStageOf(P.world) : cp < -1 ? firstStageOf(-cp) : cp + 1);
    sendMove(false);
    updatePrompt();
    updateGoal(dt);
    animateCounters(dt);
    setMeter(meterState());
    setLaunch(P.mode === 'walk' && P.onLaunch >= 0, isTouch);
    setHome(homeShown(), isTouch);
    S.flying = P.mode !== 'walk';
    infoT -= dt;
    if (infoT <= 0) { infoT = 60; sendClientInfo(); }
    hudT -= dt;
    if (hudT <= 0) {
        hudT = 0.1;
        updateHud();
        renderProgress(P.stage, P.world, atStart());
        setTrainTag(P.onTrain >= 0 ? (padUnlocked(S, P.onTrain) ? TRAIN_PADS[P.onTrain].mult : -1) : 0);
    }
}

// =====================================================================================
// Boot
// =====================================================================================
let lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, showFps = false;
const fpsWatch = { t: 0, low: 0 };
let fpsSum = 0, fpsN = 0, infoT = 8;
function sendClientInfo() {
    if (!net.room || !fpsN) return;
    net.send('client', { touch: isTouch, q: getQuality(), fps: Math.round(fpsSum / fpsN) });
}
function watchFps(fps) {
    if (running && !document.hidden) { fpsSum += fps; fpsN++; }
    if (!running || document.hidden || !autoQualityAllowed()) return;
    fpsWatch.t += 0.5;
    if (fpsWatch.t < 2) return;
    fpsWatch.low = fps < 40 ? fpsWatch.low + 0.5 : 0;
    if (fpsWatch.low < 2.5) return;
    fpsWatch.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Phones with 120 Hz screens draw every other frame (a steady 60 fps runs cooler and longer than
// chasing 120)
let rafMs = 16.7, rafLast = 0, halfRate = false, rafN = 0;
function frame(now) {
    const raw = now - (rafLast || now);
    rafLast = now;
    if (raw > 0) rafMs += (Math.min(40, raw) - rafMs) * 0.05;
    if (isTouch && rafMs < 10.5) halfRate = true; else if (rafMs > 13) halfRate = false;
    if (halfRate && (++rafN & 1)) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) { if (showFps) $('#fps').textContent = Math.round(fpsFrames / fpsAcc) + ' FPS'; watchFps(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running && !worldLoading) { update(dt); updateCamera(dt); render(); }
    requestAnimationFrame(frame);
}

let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('ve_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            $('#loading').textContent = 'Waking up a server…';
            await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        }
    }
}
async function play() {
    if (joining || running) return;
    joining = true;
    const err = $('#connectErr'), retry = $('#playBtn');
    err.hidden = true; retry.hidden = true;
    $('#loading').hidden = false;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        $('#loading').textContent = 'Joining…';
        BX.loadingStep('Joining a server…');
        const room = await joinTask;
        const me = room.state.players && room.state.players.get(room.sessionId);
        S.name = me ? me.name : S.name;
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        $('#loading').hidden = true;
        err.hidden = false;
        err.textContent = 'Could not reach the game server. Check your connection and try again.';
        retry.hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    running = true;
    S.joinedAt = Date.now();
    startMusic();
    $('#start').hidden = true;
    $('#hud').hidden = false;
    $('#touch').hidden = !isTouch;
    if (!rig) buildPlayer(0, 0);
    teleport(SPAWN, SPAWN_YAW);
    setShield(rig, CFG.spawnShield);
    cam.target.set(P.pos.x, P.pos.y + 5, P.pos.z);
    showTips();
    toast('🕷️ Welcome to +1 VENOM ESCAPE! Every second your venom grows', '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Click or tap anywhere for the music!', '#7de8ff'); }, 3500);
    canvas.focus();
    BX.loadingEnd();
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => {
        const t0 = performance.now();
        (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })();
    });
}
function showTips() {
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = isTouch
        ? '<span>Joystick to move · JUMP on a glowing pad to release your venom · steer with the joystick</span>'
        : pad.connected
            ? k('L', 'Move / steer') + k('A', 'Jump · Release venom') + k('X', 'Use') + k('R', 'Camera')
            : k('WASD', 'Move') + k('Space', 'Jump · Release venom on a pad') + k('A/D W/S', 'Steer the tentacle') + k('E', 'Use') + k('Drag', 'Camera');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 11000);
    setTimeout(() => { el.hidden = true; }, 11900);
}
function unlockAudioOnGesture() {
    const unlock = () => {
        resumeAudio();
        if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true);
    };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) respawn(true); }
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { playEmoteOn(localAvatar, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}

// ----- build the world and warm up the GPU while the loading screen is up -----
const pause = () => new Promise((r) => setTimeout(r, 0));
async function prepareWorld() {
    const step = (t) => { $('#loading').textContent = t; BX.loadingStep(t); };
    step('Loading fonts…');
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('800 40px Montserrat')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback font */ }
    step('Pouring the lava…');
    await buildWorld(pause);
    refreshNear(-1, 1);
    step('Preparing graphics…');
    camera.position.set(SPAWN.x, 12, SPAWN.z - 20); camera.lookAt(SPAWN.x, 4, SPAWN.z + 10); camera.updateMatrixWorld();
    // stand-ins for the warm-up: the player model with its suit (every tier, the monster form),
    // a tentacle, the shield, one of each effect. Never disposed (that keeps their shaders alive).
    const extras = [fxWarmGroup()];
    const sb = new T.Mesh(shieldGeo, shieldMat); sb.position.copy(SPAWN); extras.push(sb);
    const blocky = buildCharacter(0, 0); blocky.position.copy(SPAWN);
    blocky.userData.suit.setLevel(50); blocky.userData.suit.setForm(true); blocky.userData.suit.update(1, 0);
    extras.push(blocky);
    const warmTent = new Tentacle();
    warmTent.reset(SPAWN.clone().setY(3), new V3(0, 0, 1));
    warmTent.moveTip(SPAWN.clone().add(new V3(0, 3, 12)));
    warmTent.update(1 / 60);
    try {
        const base = await Promise.race([loadBase(), new Promise((r) => setTimeout(r, 4000))]);
        const a = base ? await createAvatar(null) : null;
        if (a) {
            a.root.position.copy(SPAWN);
            a.update(1 / 60, { t: 0 });
            const U = outfitUniforms(), venomVariants = avatarVariants(a.root);
            venomizeTree(a.root, U);
            venomizeTree(venomVariants, U, { clone: true });
            extras.push(a.root, avatarVariants(a.root), venomVariants);
        }
    } catch (e) { /* the player model's shaders compile when it first shows instead */ }
    for (const o of extras) scene.add(o);
    fxShowAll(true);
    await warmUp(renderer, camera, pause);
    render();
    fxShowAll(false);
    for (const o of extras) scene.remove(o);
    warmTent.hide();
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
function avatarVariants(root) {
    const tex = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    const g = new T.Group();
    g.position.copy(SPAWN);
    let sk = null;
    root.traverse((c) => { if (!sk && c.isSkinnedMesh) sk = c; });
    if (sk) {
        const s = new T.SkinnedMesh(sk.geometry, new T.MeshLambertMaterial({ map: tex }));
        s.bind(sk.skeleton, sk.bindMatrix);
        s.castShadow = s.receiveShadow = true;
        g.add(s);
    }
    const m = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), new T.MeshLambertMaterial({ map: tex }));
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return g;
}
actions.geyser = (g) => { if (worldOfX(g.x) === P.world && Math.abs(g.z - camera.position.z) < 150) { geyserBurst(new V3(g.x, LAVA_Y + 1, g.z), g.c); if (Math.abs(g.z - P.pos.z) < 90) sfx('geyser'); } };
async function boot() {
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#playBtn').addEventListener('click', play);
    $('#reconnectBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// Dev-only hooks for automated QA runs (stripped from production builds)
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        audio: () => audioDebug(), input: (o) => Object.assign(botInput, o), jump: () => pressJump(), solids, cam, P, S, TT, run, scene, camera, net, renderer: () => renderer,
        teleport: (x, y, z, yaw) => teleport(new V3(x, y, z), yaw || 0),
        walk: (n) => { qaWalk = n; }, quality: (q) => setQuality(q),
        // n frames at 60 fps (the pinned clock moving along with them)
        step: (n) => { for (let i = 0; i < n; i++) { if (net.fixedNow !== null) net.fixedNow += 1000 / 60; update(1 / 60); } return window.__qa.state(); },
        clock: (ms) => { net.fixedNow = ms; },
        walkTo: (x, z, secs) => {
            for (let i = 0; i < Math.round((secs || 4) * 60); i++) {
                const dx = x - P.pos.x, dz = z - P.pos.z;
                if (Math.hypot(dx, dz) < 0.8) break;
                cam.yaw = Math.atan2(dx, dz) + Math.PI;
                botInput.f = 1; update(1 / 60);
            }
            botInput.f = 0;
            return window.__qa.state();
        },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; },
        face: (yaw) => { cam.yaw = yaw + Math.PI; P.facing = yaw; },
        // pretend to be level L (Venom set locally; the server corrects it on its next tick)
        level: (L) => { qaVenom = L ? venomFor(L) + 1 : null; },
        noHazards: (on) => { qaNoHazards = !!on; },
        state: () => ({ x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), onGround: P.onGround, mode: P.mode, stage: P.stage, world: P.world, cp: S.stage, wins: S.wins, level: level(), used: +TT.used.toFixed(1), len: TT.len, reason: TT.reason, launch: P.onLaunch, orbs: run.orbs.size, loading: worldLoading }),
        world: (w) => goWorld(w), ensure: async (w) => { await loadWorld(w); liftCard(); }, assist: (on) => actions.setAssist(on),
        frame: () => { updateCamera(1 / 60); render(); },
        course: { PLATFORMS, LAUNCH, ESCAPES, STAGES, OBSTACLES, ROUTES, ORBS, HUBS, WORLD_X, HW, LAVA_Y }, tentacleLen, headSpeed,
    };
}
void canvas; void venomFor; void WALL_TOP;
