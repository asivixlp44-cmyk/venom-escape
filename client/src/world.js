// The world: the lobby (a green studded yard in grass-topped brick walls: the Train Zone pads, the
// Win Shop's symbiote statues, the leaderboards, the rebirth portal, the first launch pad on the lava's
// edge), the lava canyon running north between tall brick walls with terraces of voxel trees, lava
// falls pouring down them, every stage's obstacles and stone platform (Wins pad, bonus pillar, launch
// pad, the STAGE sign) and the golden escape portal at the end. Every collider and animation lives here.
//
// Static geometry is merged per zone (a few stages each) and material: a few draw calls per zone,
// frustum culled as a whole. Moving parts (spinners, crushers, geysers) and signs live in their
// stage's own zone, drawn and animated only near the camera. Everything matte (Lambert) or unlit,
// shaded with soft gradients baked into the vertex colours; built in slices so the page never freezes.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
    T, V3, scene, camera, mat, studVCMaterial, solids, prompts, tickers, solidBox, billboard, texFrom, sharedTex, fitFont,
} from './engine.js';
import {
    liquidMaterial, liquidFallMaterial, lavaTime, padTime, padMaterial, swirlMaterial, swirlVCMaterial, swirlGeo, beamMaterial, hazardMaterial,
    geyserMaterial, neon, glowMaterial, canvas, flowify, shiny, hazardTick, HUE_GLSL,
} from './materials.js';
import { venomLight, VENOM_GLSL } from './venomMaterial.js';
import { statueMeshes, symIcon } from './venom.js';
import { S, actions, net } from './state.js';
import {
    CFG, STAGES, SYMBIOTES, TRAIN_PADS, WORLDS, STAGES_PER_WORLD, padUnlocked, fmt, rngFrom, rebirthLevel, levelOf, worldOfStage, firstStageOf, escapeWins, symAvailable,
} from '../../shared/config.js';
import {
    LAVA_Y, HW, WALL_TOP, LOBBY, SPAWN as SPAWN_PT, TRAIN, TRAIN_SIGN, SHOP, SHOP_WALK, SHOP_SIGN, BOARDS, REBIRTH, UPDATE_BOARD,
    LAUNCH, PLATFORMS, OBSTACLES, ESCAPES, ORBS, HUB, HUBS, WORLD_X, WORLD_PORTALS, stageAt, worldPlatforms,
} from '../../shared/course.js';

export const SPAWN = new V3(SPAWN_PT.x, SPAWN_PT.y + 0.2, SPAWN_PT.z);
export const SPAWN_YAW = SPAWN_PT.yaw;
const N = STAGES.length;
const serverT = () => net.now() / 1000;
const css = (h) => '#' + (h >>> 0).toString(16).padStart(6, '0');
const FONT = 'Fredoka, "Arial Rounded MT Bold", sans-serif';
const TITLE = 'Montserrat, Fredoka, sans-serif';

// The palette: the reference's bright Roblox plastic
export const C = {
    grass: 0x56d43a, grassD: 0x3ab42a, grassL: 0x7aea4a, brick: 0xc8643c, brickD: 0xa24c2c, stone: 0x9aa0ac, stoneT: 0xbabec8,
    stoneD: 0x6a707c, path: 0xd6d9e0, pathD: 0xb8bcc6, purple: 0x8a7ad8, purpleD: 0x6a5ab8, trunk: 0x8a5a2a, leaf: 0x5ce03a,
    leafD: 0x3ec02a, white: 0xf2f4f8, black: 0x1c1c24, gold: 0xffc828, red: 0xe8302a, wood: 0x9a6a3a,
};
const TRAIN_COLORS = [0x3a9aff, 0x46e84a, 0xffd23a, 0xff8a2a, 0xff3a4a, 0xff5ad8, 0xb45aff, 0xffe9a0, 0x9aff3a, 0x3affc8, 0xffe23a, 0x5af0ff, 0xff7ae8, 0xfff2a0];
// Each world's look: walls, their caps (grass, jungle moss, glowing crystal), stone, the liquid, trees
// (voxel, jungle, crystal clusters), glows and pads
export const THEMES = {
    lava: { brick: 0xc8643c, brickD: 0xa24c2c, wall: 0xb4583a, cap: 0x56d43a, capD: 0x3ab42a, capGlow: false, stone: 0x9aa0ac, stoneT: 0xbabec8, stoneD: 0x6a707c, pillar: 0x8a909c, pillarD: 0x7a808c, neon: 0xffd23a, tree: 'voxel', floor: 0x56d43a, path: 0xd6d9e0, liquid: 'lava', warm: [1.0, 0.45, 0.12], glow: 'rgba(255,150,40,', pool: 0xff8a2a, geyser: 0xffa040, lip: 0x3a3e48, hub: 0x2a2c36, launch: [0x3af0ff, 0x1a1040], swirl: [0x6a3aff, 0x3af0ff], banner: ['#ff7a2a', '#a82a0a'], splash: [0xffb02a, 0xff6a1a], led: [0xffd23a, 0xff6a2a], lipGlow: 0xffb23a },
    toxic: { brick: 0x6e7a4a, brickD: 0x4e5a34, wall: 0x7a6a4a, cap: 0x2ecc40, capD: 0x1e8a2a, capGlow: false, stone: 0x8a8f72, stoneT: 0xa8ad8a, stoneD: 0x5e6450, pillar: 0x7a8a5a, pillarD: 0x5a6a42, neon: 0xb8ff3a, tree: 'jungle', floor: 0x3aa830, path: 0xb8b090, liquid: 'toxic', warm: [0.45, 1.0, 0.2], glow: 'rgba(150,255,60,', pool: 0x8aff3a, geyser: 0x9aff3a, lip: 0x2a3420, hub: 0x24301a, launch: [0x9aff3a, 0x0a2a10], swirl: [0x3aff8a, 0xd8ff3a], banner: ['#5ae83a', '#1a6a1a'], splash: [0xd8ff3a, 0x6ae01a], led: [0xb8ff3a, 0x3affc8], lipGlow: 0xb8ff3a },
    void: { brick: 0x2e2850, brickD: 0x1e1a38, wall: 0x2a2a48, cap: 0x7a5aff, capD: 0x5af0ff, capGlow: true, stone: 0x4a4a6e, stoneT: 0x6a6a92, stoneD: 0x2e2e4a, pillar: 0x3a3060, pillarD: 0x2a2248, neon: 0x5af0ff, tree: 'crystal', floor: 0x2a2448, path: 0x4a4470, liquid: 'void', warm: [0.75, 0.3, 1.0], glow: 'rgba(200,90,255,', pool: 0xc85aff, geyser: 0xff7ae8, lip: 0x5af0ff, hub: 0x1a1430, launch: [0xff7ae8, 0x1a0a40], swirl: [0xff5ad8, 0x5af0ff], banner: ['#9a5aff', '#2a0a6a'], splash: [0xff8ae8, 0x8a6aff], led: [0x5af0ff, 0xff5ad8], lipGlow: 0x5af0ff },
};
let TH = THEMES.lava;
const themeOf = (w) => THEMES[(WORLDS[(w || 1) - 1] || WORLDS[0]).theme];
function setTheme(w) { TH = themeOf(w); }

// =====================================================================================
// Zones: -1 the lobby, one per stage (its moving parts, pads and signs), the static groups
// (100 + stage / 3, frustum culled), each world's always-drawn group (its canyon walls and liquid:
// -2 for World 1, -12 / -13) and the World 2 / 3 hubs (-22 / -23). Only the world you're in is drawn.
// =====================================================================================
const zoneGroups = new Map();
const zoneWorld = new Map();
export function zoneGroup(z) {
    let g = zoneGroups.get(z);
    if (!g) {
        g = new T.Group(); g.name = 'zone' + z; g.visible = false; g.matrixWorldAutoUpdate = false; scene.add(g); zoneGroups.set(z, g);
        zoneWorld.set(z, z === -1 || z === -2 ? 1 : z <= -20 ? -20 - z : z <= -10 ? -10 - z : z >= 100 ? worldOfStage((z - 100) * 3) : worldOfStage(z));
    }
    return g;
}
const staticZone = (i) => (i < 0 ? i : 100 + Math.floor(i / 3));
export const alwaysZone = (w) => (w === 1 ? -2 : -10 - w);
export const hubZone = (w) => -20 - w;
let culledFor = null;
// The world you're in; in it, the stage the camera is in and a couple either side are drawn and animated
export function cullZones(stage, world) {
    const s = stage ?? -1, w = world || 1, key = s + '|' + w;
    if (key === culledFor) return;
    culledFor = key;
    for (const [z, g] of zoneGroups) {
        const inWorld = zoneWorld.get(z) === w;
        let vis;
        if (!inWorld) vis = false;
        else if (z === -2 || z <= -10 && z > -20 || z >= 100) vis = true;
        else if (z === -1) vis = s <= 1;
        else if (z <= -20) vis = s <= firstStageOf(w) + 1;
        else vis = z >= s - 1 && z <= s + 2;
        g.visible = vis;
        g.matrixWorldAutoUpdate = vis;
    }
}
const anim = (o) => { o.userData.anim = true; return o; };
const frozen = new Set();
function freezeStatic() {
    const wp = new V3();
    for (const g of zoneGroups.values()) {
        if (frozen.has(g)) continue;
        frozen.add(g);
        g.updateMatrixWorld(true);
        // the per-frame matrix walk only visits the parts that move (three walks every child of
        // everything otherwise: thousands of frozen pieces, in every world, every frame); a hidden
        // zone isn't walked at all
        const moving = new Set();
        g.traverse((o) => { if (o.userData.anim) for (let p = o; p && p !== g; p = p.parent) moving.add(p); });
        const movers = g.children.filter((c) => moving.has(c));
        g.updateMatrixWorld = function (force) { if (this.visible) for (const o of movers) o.updateMatrixWorld(force); };
        g.traverse((o) => {
            if (!o.userData.anim) o.matrixAutoUpdate = false;
            if (o.isSprite && !o.userData.keepFar) { o.getWorldPosition(wp); spriteLOD.push({ sp: o, w: zoneWorld.get([...zoneGroups.entries()].find(([, gg]) => gg === g)[0]), x: wp.x, y: wp.y, z: wp.z, far2: (o.userData.far || 120) ** 2, near2: (o.userData.near || 0) ** 2 }); }
        });
    }
}
const spriteLOD = [];

// ----- static geometry, merged per zone and material at the end -----
const geoBatches = new Map();
function batchFor(zone, material, cast) {
    const k = zone + '|' + material.uuid + '|' + (cast ? 1 : 0);
    let b = geoBatches.get(k);
    if (!b) { b = { zone, material, cast, list: [], pos: [], nrm: [], uv: [], idx: [], col: [] }; geoBatches.set(k, b); }
    return b;
}
const white3 = new T.Color(0xffffff);
// Plain one-colour materials fold into two shared vertex-colour ones (matte / unlit)
let smoothVCm = null, basicVCm = null, neonVCm = null;
const smoothVC = () => smoothVCm || (smoothVCm = new T.MeshLambertMaterial({ vertexColors: true }));
const basicVC = () => basicVCm || (basicVCm = new T.MeshBasicMaterial({ vertexColors: true }));
const neonVC = () => neonVCm || (neonVCm = flowify(new T.MeshBasicMaterial({ vertexColors: true })));
function fold(material, color) {
    if ((material.vertexColors && !material.userData.flow) || material.map || material.transparent || material.alphaTest > 0 || material.side !== T.FrontSide || material.isShaderMaterial) return null;
    if (material.isMeshLambertMaterial && (!material.emissive || material.emissive.getHex() === 0)) return { m: smoothVC(), c: color ?? material.color };
    if (material.isMeshBasicMaterial && material.toneMapped !== false) return { m: material.userData.flow ? neonVC() : basicVC(), c: color ?? material.color };
    return null;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function addGeo(zone, geo, material, cast, color, shade) {
    const f = fold(material, color);
    if (f) { material = f.m; color = f.c; }
    const b = batchFor(zone, material, cast);
    const vc = !!material.vertexColors;
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name) && !(vc && name === 'color')) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (vc && (!geo.attributes.color || color !== undefined)) {
        const c = color !== undefined ? new T.Color(color) : white3, p = geo.attributes.position, n = p.count, a = new Float32Array(n * 3);
        let y0 = 0, y1 = 1;
        if (shade) { geo.computeBoundingBox(); y0 = shade[2] ?? geo.boundingBox.min.y; y1 = Math.max(y0 + 1e-3, shade[3] ?? geo.boundingBox.max.y); }
        for (let i = 0; i < n; i++) {
            const k = shade ? shade[0] + (shade[1] - shade[0]) * clamp01((p.getY(i) - y0) / (y1 - y0)) : 1;
            a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
        }
        geo.setAttribute('color', new T.BufferAttribute(a, 3));
    }
    if (!geo.index) { const idx = []; for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i); geo.setIndex(idx); }
    b.list.push(geo);
}
const BOX_FACES = [[2, 1, 0, -1, -1, 1, 2, 1], [2, 1, 0, 1, -1, -1, 2, 1], [0, 2, 1, 1, 1, 1, 0, 2], [0, 2, 1, 1, -1, -1, 0, 2], [0, 1, 2, 1, -1, 1, 0, 1], [0, 1, 2, -1, -1, -1, 0, 1]];
const vcTmp = new T.Color(), warmTmp = new T.Color();
// Axis-aligned boxes straight into their batch's vertex arrays. shade: [bottom, top(, y0, y1)]
// brightness by height. warm: the lava's orange light on the lower part (height above the lava it
// fades out at)
function addBoxFast(zone, material, cast, sx, sy, sz, x, y, z, uvDiv, color, skipBottom, shade, warm) {
    const f = fold(material, color);
    if (f) { material = f.m; color = f.c; }
    const b = batchFor(zone, material, cast);
    const vc = !!material.vertexColors;
    if (vc) vcTmp.set(color ?? 0xffffff);
    const size = [sx, sy, sz], c = [x, y, z], v = [0, 0, 0], n = [0, 0, 0];
    const ya = shade ? shade[2] ?? y - sy / 2 : 0, yb = shade ? shade[3] ?? y + sy / 2 : 1;
    for (let fi = 0; fi < 6; fi++) {
        if (skipBottom && fi === 3) continue;
        const [u, vv, w, ud, vd, ws, su, sv] = BOX_FACES[fi];
        const base = b.pos.length / 3;
        const wu = size[u], hv = size[vv], dw = size[w] / 2 * ws;
        const us = uvDiv ? size[su] / uvDiv : 1, vs = uvDiv ? size[sv] / uvDiv : 1;
        for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
            v[u] = (ix * wu - wu / 2) * ud; v[vv] = (iy * hv - hv / 2) * vd; v[w] = dw;
            b.pos.push(v[0] + c[0], v[1] + c[1], v[2] + c[2]);
            n[0] = n[1] = n[2] = 0; n[w] = ws;
            b.nrm.push(n[0], n[1], n[2]);
            b.uv.push(ix * us + (uvDiv ? (c[su] - size[su] / 2) / uvDiv : 0), (1 - iy) * vs + (uvDiv ? (c[sv] - size[sv] / 2) / uvDiv : 0));
            if (vc) {
                const wy = v[1] + y;
                const k = shade ? shade[0] + (shade[1] - shade[0]) * clamp01((wy - ya) / (yb - ya)) : 1;
                let r = vcTmp.r * k, g = vcTmp.g * k, bb = vcTmp.b * k;
                if (warm) {
                    const h = clamp01(1 - (wy - LAVA_Y) / warm);
                    warmTmp.setRGB(TH.warm[0], TH.warm[1], TH.warm[2]);
                    r += (warmTmp.r - r) * h * 0.55; g += (warmTmp.g - g) * h * 0.55; bb += (warmTmp.b - bb) * h * 0.55;
                }
                b.col.push(r, g, bb);
            }
        }
        b.idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
}
function flushGeo() {
    for (const b of geoBatches.values()) {
        const parts = [...b.list];
        if (b.pos.length) {
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3));
            g.setAttribute('normal', new T.Float32BufferAttribute(b.nrm, 3));
            g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
            if (b.col.length) g.setAttribute('color', new T.Float32BufferAttribute(b.col, 3));
            g.setIndex(b.idx);
            parts.push(g);
        }
        if (!parts.length) continue;
        const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts);
        if (!geo) { console.warn('[world] could not merge a batch', b.zone); continue; }
        const mesh = new T.Mesh(geo, b.material);
        mesh.receiveShadow = true; mesh.castShadow = !!b.cast;
        mesh.matrixAutoUpdate = false;
        if (b.material.transparent) mesh.renderOrder = 2;
        zoneGroup(b.zone).add(mesh);
        if (parts.length > 1) for (const g of parts) g.dispose();
    }
    geoBatches.clear();
}
// a studded block (merged), and its collider unless o.solid === false
function studBox(zone, sx, sy, sz, x, y, z, color, o) {
    o = o || {};
    addBoxFast(zone, studVCMaterial(), o.cast, sx, sy, sz, x, y, z, 8, color, o.skipBottom, o.shade, o.warm);
    if (o.solid !== false) return solidBox(x, y, z, sx, sy, sz, { zone: o.solidZone ?? (zone >= 100 ? curStage : zone), mat: o.mat || 'stud', ...(o.extra || {}) });
    return null;
}
let curStage = -1;
function plainBox(zone, sx, sy, sz, x, y, z, material, o) {
    addBoxFast(zone, material, o && o.cast, sx, sy, sz, x, y, z, (o && o.uvDiv) ?? 0, o && o.color, o && o.skipBottom, o && o.shade, o && o.warm);
}
// a box by its edges
const boxE = (zone, x0, x1, y0, y1, z0, z1, color, o) => studBox(zone, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, o);
function bakeMesh(zone, mesh, cast) {
    mesh.updateWorldMatrix(true, false);
    addGeo(zone, mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mesh.material, cast);
    mesh.parent.remove(mesh);
}
function painted(g, color) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new T.Color(color);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
}
// rectangle minus holes (a wall with windows): the solid pieces left
function subtractRect(a0, a1, b0, b1, holes) {
    const cuts = new Set([a0, a1]);
    for (const h of holes) { if (h.a0 > a0 && h.a0 < a1) cuts.add(h.a0); if (h.a1 > a0 && h.a1 < a1) cuts.add(h.a1); }
    const as = [...cuts].sort((p, q) => p - q), out = [];
    for (let i = 0; i < as.length - 1; i++) {
        const lo = as[i], hi = as[i + 1];
        const cut = holes.filter((h) => h.a0 <= lo + 1e-6 && h.a1 >= hi - 1e-6).map((h) => [Math.max(b0, h.b0), Math.min(b1, h.b1)]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
        let cur = b0;
        for (const [p, q] of cut) { if (p > cur) out.push({ a0: lo, a1: hi, b0: cur, b1: p }); cur = Math.max(cur, q); }
        if (cur < b1) out.push({ a0: lo, a1: hi, b0: cur, b1 });
    }
    const merged = [];
    for (const r of out) {
        const m = merged.find((o) => o.a1 === r.a0 && o.b0 === r.b0 && o.b1 === r.b1);
        if (m) m.a1 = r.a1; else merged.push({ ...r });
    }
    return merged;
}

// =====================================================================================
// Signs: canvas text, every letter fitted with its outline (fitFont) so nothing is ever cut off
// =====================================================================================
function outlined(x, text, cx, cy, maxW, px, fill, stroke, family, weight, sw) {
    const p = fitFont(x, text, maxW, px, weight || 700, family || FONT, sw || 0.26);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (stroke) { x.lineWidth = Math.max(4, p * (sw || 0.26)); x.strokeStyle = stroke; x.strokeText(text, cx, cy); }
    if (Array.isArray(fill)) {
        const g = x.createLinearGradient(0, cy - p / 2, 0, cy + p / 2);
        fill.forEach((c, i) => g.addColorStop(i / (fill.length - 1), c));
        x.fillStyle = g;
    } else x.fillStyle = fill;
    x.fillText(text, cx, cy);
    return p;
}
// A flat sign facing `yaw` (0 = facing -z, toward a player coming up the canyon)
function signPlane(zone, key, W, H, draw, worldW, pos, yaw, o) {
    const tex = sharedTex('sign|' + key, () => { const c = canvas(W, H); draw(c.getContext('2d'), W, H); return c; });
    const m = new T.Mesh(new T.PlaneGeometry(worldW, worldW * H / W), shiny(new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false, forceSinglePass: true })));
    m.position.set(pos.x, pos.y, pos.z);
    m.rotation.y = yaw ?? Math.PI;
    if (o && o.order) m.renderOrder = o.order;
    zoneGroup(zone).add(m);
    return m;
}
// A floating label that always faces you
// far: hidden beyond this many studs; near: hidden when you're right under it
function label(zone, lines, worldW, pos, far, W, near) {
    const sp = billboard(lines, worldW, W || 512, new V3(pos.x, pos.y, pos.z), zoneGroup(zone), true);
    sp.userData.far = far || 110;
    sp.userData.near = near || 0;
    return sp;
}

// =====================================================================================
// Voxel trees: a trunk and three tiers of leafy blocks, some with apples
// =====================================================================================
function tree(zone, x, y, z, r, scale) {
    if (TH.tree === 'jungle') return jungleTree(zone, x, y, z, r, scale);
    if (TH.tree === 'crystal') return crystals(zone, x, y, z, r, scale);
    const s = scale || 1, h = (4 + r() * 3) * s;
    addBoxFast(zone, mat(C.trunk), true, 1.6 * s, h, 1.6 * s, x, y + h / 2, z, 0, C.trunk, true, [0.7, 1]);
    const tiers = [[7.5, 2.4], [5.6, 2.2], [3.6, 2]];
    let ty = y + h;
    const leaf = r() < 0.5 ? C.leaf : 0x6ae84a;
    for (const [w, th] of tiers) {
        const ws = w * s, ths = th * s;
        addBoxFast(zone, mat(leaf), true, ws, ths, ws, x, ty + ths / 2, z, 0, leaf, false, [0.78, 1.08]);
        ty += ths * 0.85;
    }
    if (r() < 0.45) for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2;
        addBoxFast(zone, mat(C.red), false, 0.7 * s, 0.7 * s, 0.7 * s, x + Math.cos(a) * 3.5 * s, y + h + 0.6 * s + r() * 2 * s, z + Math.sin(a) * 3.5 * s, 0, C.red);
    }
}
// A jungle tree: a tall trunk, a wide dark canopy in two layers, vines hanging off it
function jungleTree(zone, x, y, z, r, scale) {
    const s = (scale || 1) * 1.1, h = (8 + r() * 5) * s;
    addBoxFast(zone, mat(0x5a3a1a), true, 1.8 * s, h, 1.8 * s, x, y + h / 2, z, 0, 0x5a3a1a, true, [0.6, 1]);
    const leaf = r() < 0.5 ? 0x1e8a2a : 0x2aa83a;
    addBoxFast(zone, mat(leaf), true, 10 * s, 2.4 * s, 10 * s, x, y + h + 1.2 * s, z, 0, leaf, false, [0.7, 1.05]);
    addBoxFast(zone, mat(leaf), true, 6.4 * s, 2 * s, 6.4 * s, x + 0.8 * s, y + h + 3.2 * s, z - 0.6 * s, 0, 0x3ac84a, false, [0.8, 1.1]);
    for (let k = 0; k < 5; k++) {
        const a = r() * Math.PI * 2, d = 3 + r() * 1.6, l = (2 + r() * 4) * s;
        addBoxFast(zone, mat(0x2a7a1a), false, 0.4, l, 0.4, x + Math.cos(a) * d * s, y + h - l / 2, z + Math.sin(a) * d * s, 0, 0x2a7a1a, true);
    }
    if (r() < 0.4) addBoxFast(zone, neon(0xd8ff3a, 1.1), false, 0.9 * s, 0.9 * s, 0.9 * s, x + 2.4 * s, y + h - 0.6, z + 1.4 * s, 0);
}
// A glowing toxic mushroom: a pale stem and a neon cap
const SHROOM_C = [0xb8ff3a, 0xff7ae8, 0x3affc8];
function glowShroom(zone, x, y, z, r) {
    const s = 0.55 + r() * 0.5, c = SHROOM_C[Math.floor(r() * SHROOM_C.length)];
    addBoxFast(zone, mat(0xe8e0c8), false, 0.6 * s, 2 * s, 0.6 * s, x, y + s, z, 0, 0xe8e0c8, true);
    addBoxFast(zone, neon(c, 1.0), false, 2.2 * s, 0.8 * s, 2.2 * s, x, y + 2.2 * s, z, 0);
    addBoxFast(zone, mat(0x2a3a1a), false, 1.8 * s, 0.2, 1.8 * s, x, y + 1.72 * s, z, 0, 0x2a3a1a);
}
// A cluster of glowing crystal spires (the void's "trees")
const CRYSTAL_C = [0x5af0ff, 0xff7ae8, 0xb48aff, 0x7a8aff];
function crystals(zone, x, y, z, r, scale) {
    const s = scale || 1, n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
        const h = (4 + r() * 7) * s, rad = (0.8 + r() * 0.9) * s;
        const g = new T.ConeGeometry(rad, h, 4);
        g.rotateZ((r() - 0.5) * 0.5); g.rotateX((r() - 0.5) * 0.5);
        g.translate(x + (r() - 0.5) * 3 * s, y + h / 2 - 0.4, z + (r() - 0.5) * 3 * s);
        addGeo(zone, g, neon(CRYSTAL_C[Math.floor(r() * CRYSTAL_C.length)], 1.05), false);
    }
    addBoxFast(zone, mat(0x1a1430), true, 3.4 * s, 1, 3.4 * s, x, y + 0.3, z, 0, 0x2a2048);
}
// a grass cap on top of a wall (moss in the jungle, glowing crystal in the void), overhanging a little,
// with drips down its face(s)
function grassCap(zone, x0, x1, z0, z1, top, r, drips) {
    if (TH.capGlow) addBoxFast(zone, neon(TH.cap, 0.95), false, x1 - x0 + 0.6, 1.4, z1 - z0 + 0.6, (x0 + x1) / 2, top + 0.7, (z0 + z1) / 2, 0, undefined, true);
    else studBox(zone, x1 - x0 + 0.6, 1.4, z1 - z0 + 0.6, (x0 + x1) / 2, top + 0.7, (z0 + z1) / 2, TH.cap, { solid: false, shade: [0.85, 1.1] });
    if (!drips) return;
    const dm = TH.capGlow ? neon(TH.capD, 1.1) : mat(TH.capD);
    const long = TH.tree === 'jungle' ? 2 : 1;
    for (const d of drips) {
        // d: { x or z: fixed face position, along: [a0, a1], axis: 'x' | 'z', out: +1/-1 }
        for (let a = d.along[0]; a < d.along[1]; a += 2) {
            const len = (0.8 + r() * r() * 4.5) * long, w = TH.capGlow ? 0.5 : 2;
            if (r() < (TH.capGlow ? 0.6 : 0.18)) continue;
            const yc = top - len / 2, col = TH.capGlow ? (r() < 0.5 ? TH.capD : TH.cap) : r() < 0.5 ? TH.cap : TH.capD;
            if (d.axis === 'z') addBoxFast(zone, dm, false, 0.5, len, w, d.pos + d.out * 0.25, yc, a + 1, 0, col, true);
            else addBoxFast(zone, dm, false, w, len, 0.5, a + 1, yc, d.pos + d.out * 0.25, 0, col, true);
        }
    }
}

// =====================================================================================
// The lobby
// =====================================================================================
export const lobbyState = { padLabels: [], padMeshes: [], shopLabels: [], statues: [], rebirthLabel: null, boards: {} };
function buildLobby() {
    const Z = -1, r = rngFrom(5);
    const { x0, x1, z0, z1 } = LOBBY;
    // the green studded floor
    studBox(Z, x1 - x0, -(LAVA_Y - 4), z1 - z0, (x0 + x1) / 2, (LAVA_Y - 4) / 2, (z0 + z1) / 2, C.grass, { mat: 'grass', shade: [0.55, 1, LAVA_Y - 4, 0], warm: 6 });
    // tiled paths (decals a hair above the floor)
    const path = (ax0, ax1, az0, az1, color) => addBoxFast(Z, studVCMaterial(), false, ax1 - ax0, 0.08, az1 - az0, (ax0 + ax1) / 2, 0.04, (az0 + az1) / 2, 8, color || C.path, true);
    path(-6, 6, -70, z1);                           // the main path, south to north
    path(-15, 15, -46, -22);                        // the spawn plaza
    path(-55, -15, -37, -31);                       // to the Train Zone
    path(-56, -38, -68, 28, C.pathD);               // along the pads
    path(15, SHOP_WALK.x - SHOP_WALK.w / 2, -37, -31); // to the Win Shop
    path(SHOP_WALK.x - SHOP_WALK.w / 2, SHOP_WALK.x + SHOP_WALK.w / 2, SHOP_WALK.z0, SHOP_WALK.z1, C.purple);
    path(-44, 44, -73, -64);                        // along the boards
    // the venom emblem on the spawn plaza
    const emb = new T.Mesh(new T.PlaneGeometry(18, 18), new T.MeshBasicMaterial({ map: sharedTex('emblem', drawEmblem), transparent: true, depthWrite: false, toneMapped: false, forceSinglePass: true }));
    emb.rotation.x = -Math.PI / 2; emb.position.set(0, 0.1, -34); emb.renderOrder = 1;
    zoneGroup(Z).add(emb);
    // walls: west, east, south (brick, studded, a grass cap with drips), terraces behind them with trees
    const top = LOBBY.wallTop;
    const brick = (bx0, bx1, bz0, bz1, t) => studBox(-2, bx1 - bx0, t - (-4), bz1 - bz0, (bx0 + bx1) / 2, (t - 4) / 2, (bz0 + bz1) / 2, C.brick, { shade: [0.72, 1.02], mat: 'wall', extra: { bound: true } });
    brick(x0 - 14, x0, z0 - 14, z1, top); brick(x1, x1 + 14, z0 - 14, z1, top); brick(x0, x1, z0 - 14, z0, top);
    grassCap(-2, x0 - 14, x0, z0 - 14, z1, top, r, [{ axis: 'z', pos: x0, out: 1, along: [z0, z1] }]);
    grassCap(-2, x1, x1 + 14, z0 - 14, z1, top, r, [{ axis: 'z', pos: x1, out: -1, along: [z0, z1] }]);
    grassCap(-2, x0, x1, z0 - 14, z0, top, r, [{ axis: 'x', pos: z0, out: 1, along: [x0, x1] }]);
    ledStrip(-2, 'z', x0, z0, z1, top - 3.2, 1, null, true);
    ledStrip(-2, 'z', x1, z0, z1, top - 3.2, -1, null, true);
    ledStrip(-2, 'x', z0, x0, x1, top - 3.2, 1, null, true);
    // terraces and trees behind
    boxE(-2, x0 - 40, x0 - 14, -4, top + 10, z0 - 40, z1, C.brickD, { solid: false, shade: [0.7, 1] });
    boxE(-2, x1 + 14, x1 + 40, -4, top + 10, z0 - 40, z1, C.brickD, { solid: false, shade: [0.7, 1] });
    boxE(-2, x0 - 14, x1 + 14, -4, top + 10, z0 - 40, z0 - 14, C.brickD, { solid: false, shade: [0.7, 1] });
    for (const [a0, a1, b0, b1] of [[x0 - 40, x0 - 14, z0 - 40, z1], [x1 + 14, x1 + 40, z0 - 40, z1], [x0 - 14, x1 + 14, z0 - 40, z0 - 14]]) {
        studBox(-2, a1 - a0, 1.4, b1 - b0, (a0 + a1) / 2, top + 10.7, (b0 + b1) / 2, C.grass, { solid: false });
    }
    for (let z = z0 + 4; z < z1; z += 14 + r() * 6) { tree(-2, x0 - 7, top + 1.4, z, r); tree(-2, x1 + 7, top + 1.4, z + 5, r); tree(-2, x0 - 26, top + 11.4, z + 3, r, 1.2); tree(-2, x1 + 26, top + 11.4, z - 2, r, 1.2); }
    for (let x = x0 + 6; x < x1; x += 15 + r() * 6) { tree(-2, x, top + 1.4, z0 - 7, r); tree(-2, x + 4, top + 11.4, z0 - 26, r, 1.2); }
    // a few trees, bushes and mushrooms inside the yard
    for (const [tx, tz] of [[-30, 20], [24, 22], [-58, -72], [58, -72], [-24, -60], [24, -50]]) tree(Z, tx, 0, tz, r, 0.9);
    for (let k = 0; k < 26; k++) {
        const x = x0 + 4 + r() * (x1 - x0 - 8), z = z0 + 4 + r() * (z1 - z0 - 8);
        if (Math.abs(x) < 17 || (x < -36 && x > -58) || (x > 32 && x < 60) || z < -64) continue;
        if (r() < 0.5) mushroom(Z, x, z, r); else bush(Z, x, z, r);
    }
    buildTrainZone();
    buildShop();
    buildBoards();
    buildRebirth();
    buildUpdateBoard();
    buildProps(r);
    for (const p of WORLD_PORTALS) portal(Z, p, p.w, false);
}
function mushroom(zone, x, z, r) {
    const s = 0.7 + r() * 0.6;
    addBoxFast(zone, mat(0xf4ecd8), true, 0.8 * s, 1.6 * s, 0.8 * s, x, 0.8 * s, z, 0, 0xf4ecd8, true);
    addBoxFast(zone, mat(0xe8302a), true, 2.6 * s, 1 * s, 2.6 * s, x, 1.9 * s, z, 0, 0xe8302a, false, [0.8, 1.1]);
    for (let k = 0; k < 3; k++) addBoxFast(zone, mat(0xffffff), false, 0.5 * s, 0.1, 0.5 * s, x + (r() - 0.5) * 1.6 * s, 2.42 * s, z + (r() - 0.5) * 1.6 * s, 0, 0xffffff);
}
function bush(zone, x, z, r, y0) {
    const s = 0.8 + r() * 0.6;
    for (let k = 0; k < 3; k++) addBoxFast(zone, mat(C.leafD), true, (1.4 + r()) * s, (1.2 + r() * 1.4) * s, (1.2 + r()) * s, x + (r() - 0.5) * 1.6 * s, (y0 || 0) + 0.8 * s, z + (r() - 0.5) * 1.6 * s, 0, r() < 0.5 ? C.leafD : C.leaf, true, [0.75, 1.05]);
}
function drawEmblem() {
    const c = canvas(512), x = c.getContext('2d');
    x.translate(256, 256);
    x.strokeStyle = 'rgba(20,20,30,0.85)'; x.lineCap = 'round'; x.lineJoin = 'round';
    x.fillStyle = 'rgba(20,20,30,0.85)';
    // the spider: a body, a head and eight bent legs
    x.beginPath(); x.ellipse(0, 40, 62, 92, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(0, -78, 44, 46, 0, 0, Math.PI * 2); x.fill();
    x.lineWidth = 22;
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
        const y0 = -40 + k * 34, a = -0.9 + k * 0.55;
        x.beginPath(); x.moveTo(s * 40, y0); x.lineTo(s * (120 + k * 10), y0 + Math.sin(a) * 90 - 40); x.lineTo(s * (190 - k * 6), y0 + Math.sin(a) * 160 + (k > 1 ? 60 : -40)); x.stroke();
    }
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = '#000';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 6, -80); x.lineTo(s * 34, -100); x.lineTo(s * 16, -62); x.closePath(); x.fill(); }
    return c;
}

// ----- the Train Zone -----
function buildTrainZone() {
    const Z = -1;
    TRAIN.forEach((p, i) => { if (p.w === 1) trainPad(Z, p, i); });
    // the big blue TRAIN ZONE banner on the west wall
    signPlane(Z, 'trainzone', 1024, 300, (x, W, H) => banner(x, W, H, '#2a6aff', '#123a9a', 'TRAIN ZONE', '🕷️'), 34, { x: TRAIN_SIGN.x + 0.3, y: TRAIN_SIGN.y, z: TRAIN_SIGN.z }, Math.PI / 2);
}
function trainPad(Z, p, i) {
    {
        const d = TRAIN_PADS[i], col = TRAIN_COLORS[i];
        // a raised frame and the glowing pad itself
        studBox(Z, p.s + 1.6, 0.5, p.s + 1.6, p.x, 0.25, p.z, 0x3a3f4c, { solid: false });
        const m = new T.Mesh(new T.PlaneGeometry(p.s, p.s), padMaterial(col, 0x101830, true, 0.8));
        m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.52, p.z);
        zoneGroup(Z).add(m);
        lobbyState.padMeshes[i] = m;
        // venom wisps rising off unlocked pads
        const sw = new T.Mesh(swirlGeo(3.2, 4.4, 7), swirlMaterial(col, 0xffffff, 0.55));
        sw.position.set(p.x, 0.5, p.z);
        zoneGroup(Z).add(sw);
        lobbyState.padMeshes[i].userData.swirl = sw;
        lobbyState.padLabels[i] = label(Z, padLines(i), 8.5, { x: p.x, y: 7.4, z: p.z }, 44, 512, 5);
        prompts.push({ pos: new V3(p.x, 0, p.z), r: 6.5, zone: Z, label: () => (padUnlocked(S, i) ? '⚡ Training ' + d.mult + 'x Venom!' : d.wins ? 'Unlock ' + fmt(d.mult) + 'x Venom (' + fmt(d.wins) + ' Wins)' : '🔒 Needs ' + d.reb + ' Rebirth' + (d.reb > 1 ? 's' : '')), act: () => actions.trainPad && actions.trainPad(i), passive: () => padUnlocked(S, i) });
    }
}
function padLines(i) {
    const d = TRAIN_PADS[i], on = padUnlocked(S, i);
    return [
        { t: fmt(d.mult) + 'x Venom', c: '#ffffff', s: '#12204a', px: 66 },
        { t: on ? 'Unlocked' : d.wins ? '🏆 ' + fmt(d.wins) + ' Wins' : '🔒 ' + d.reb + ' Rebirth' + (d.reb > 1 ? 's' : ''), c: on ? '#7dff6b' : d.wins ? '#ffd028' : '#ff5a6a', s: '#12204a', px: 44 },
    ];
}
function banner(x, W, H, c0, c1, text, ic) {
    x.fillStyle = '#0c1430'; roundRect(x, 6, 6, W - 12, H - 12, 40); x.fill();
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c0); g.addColorStop(1, c1);
    x.fillStyle = g; roundRect(x, 20, 20, W - 40, H - 40, 30); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(x, 30, 26, W - 60, H * 0.32, 22); x.fill();
    x.font = '170px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ic, 150, H / 2 + 6);
    outlined(x, text, W / 2 + 70, H / 2 + 6, W - 330, 170, '#ffffff', '#0c1430', TITLE, 800, 0.2);
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); }

// ----- the Win Shop: a statue per symbiote -----
function buildShop() {
    const Z = -1, swirls = [];
    SHOP.forEach((p, i) => { if (p.w === 1) statue(Z, p, i, swirls); });
    // every statue's swirl in one mesh
    const sm = new T.Mesh(mergeGeometries(swirls), swirlVCMaterial());
    swirls.forEach((g) => g.dispose());
    zoneGroup(Z).add(sm);
    signPlane(Z, 'winshop', 1024, 300, (x, W, H) => banner(x, W, H, '#ffe24a', '#e8a414', 'WIN SHOP', '🏆'), 34, { x: SHOP_SIGN.x - 0.3, y: SHOP_SIGN.y, z: SHOP_SIGN.z }, -Math.PI / 2);
}
function statue(Z, p, i, swirls) {
    {
        const sym = SYMBIOTES[i];
        studBox(Z, 6.4, 1.6, 6.4, p.x, 0.8, p.z, 0x8a90a0, { shade: [0.75, 1.05], mat: 'stone' });
        studBox(Z, 5.4, 0.3, 5.4, p.x, 1.75, p.z, 0x2a2c36, { solid: false });
        // the statue is baked into the lobby's merged batches (no draw calls of its own)
        const st = statueMeshes(i, sym);
        st.position.set(p.x, 1.9, p.z);
        st.rotation.y = p.w > 1 ? -Math.PI / 2 : i % 2 ? -Math.PI / 2 : Math.PI / 2;
        zoneGroup(Z).add(st);
        st.updateMatrixWorld(true);
        [...st.children].forEach((m) => bakeMesh(Z, m, true));
        const sg = swirlGeo(2.2, 3.2, 9);
        sg.translate(p.x, 1.9, p.z);
        swirls.push(painted(sg, sym.glow));
        lobbyState.shopLabels[i] = label(Z, shopLines(i), 7.2, { x: p.x, y: 11.6 + (i % 2) * 0.6, z: p.z }, 24, 512, 4);
        prompts.push({ pos: new V3(p.x, 0, p.z), r: 7, zone: Z, label: () => shopPrompt(i), act: () => actions.buySym && actions.buySym(sym.id) });
    }
}
function shopLines(i) {
    const s = SYMBIOTES[i], own = !!(S.syms && S.syms[s.id]), wear = S.wear === s.id;
    return [
        { t: s.name, c: '#ffffff', s: '#12204a', px: 50 },
        { t: '+' + fmt(s.venom) + ' VENOM/sec', c: '#c8ff7a', s: '#12204a', px: 46 },
        { t: wear ? '✔ Wearing' : own ? 'Owned' : !symAvailable(S, s) ? '🔒 World ' + s.world : fmt(s.price) + ' Wins Required', c: wear ? '#7dff6b' : own ? '#7de8ff' : '#ffd028', s: '#12204a', px: 44 },
    ];
}
function shopPrompt(i) {
    const s = SYMBIOTES[i];
    if (S.wear === s.id) return '✔ Wearing ' + s.name;
    if (S.syms && S.syms[s.id]) return 'Wear ' + s.name;
    return 'Buy ' + s.name + ' (' + fmt(s.price) + ' Wins)';
}
// Re-draws the Train Zone and Win Shop labels when your progress changes (only what changed)
const labelKeys = [];
export function refreshLobby() {
    TRAIN.forEach((p, i) => {
        if (!lobbyState.padLabels[i]) return;
        const on = padUnlocked(S, i), key = 'p' + i + on;
        if (labelKeys[i] === key) return;
        labelKeys[i] = key;
        lobbyState.padLabels[i].userData.set(padLines(i));
        const m = lobbyState.padMeshes[i];
        m.material = padMaterial(TRAIN_COLORS[i], 0x101830, on, 0.8);
        m.userData.swirl.visible = on;
    });
    SYMBIOTES.forEach((s, i) => {
        if (!lobbyState.shopLabels[i]) return;
        const key = 's' + !!(S.syms && S.syms[s.id]) + (S.wear === s.id) + symAvailable(S, s);
        if (labelKeys[20 + i] === key) return;
        labelKeys[20 + i] = key;
        lobbyState.shopLabels[i].userData.set(shopLines(i));
    });
    const rk = 'r' + (S.rebirths || 0);
    if (labelKeys[50] !== rk && lobbyState.rebirthLabel) { labelKeys[50] = rk; lobbyState.rebirthLabel.userData.set(rebirthLines()); }
    for (const p of portals) {
        const k = 'w' + (S.world || 1);
        if (p.key === k) continue;
        p.key = k;
        p.lb.userData.set(portalLines(p.w, p.home));
        if (!p.home) p.disc.material = (S.world || 1) >= p.w ? p.on : p.off;
    }
}

// ----- leaderboards -----
function buildBoards() {
    const Z = -1;
    for (const b of BOARDS) {
        // a stone frame with a little roof, like the reference
        boxE(Z, b.x - 9.5, b.x + 9.5, 0, 23, b.z - 1, b.z + 0.6, 0x8a9ab8, { shade: [0.7, 1.05] });
        boxE(Z, b.x - 10.5, b.x + 10.5, 23, 24.6, b.z - 1.4, b.z + 1.6, 0xa8b8d4, { solid: false });
        const tex = texFrom(drawBoard(b, []));
        const m = new T.Mesh(new T.PlaneGeometry(17, 20), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
        m.position.set(b.x, 12, b.z + 0.65);
        zoneGroup(Z).add(m);
        lobbyState.boards[b.key] = { m, b, key: '' };
    }
}
function drawBoard(b, rows) {
    const W = 512, H = 600, c = canvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a3a6a'); g.addColorStop(1, '#141c3a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 12; k++) x.fillRect(0, 90 + k * 42, W, 21);
    outlined(x, b.ic + ' ' + b.title, W / 2, 48, W - 40, 56, ['#ffffff', '#ffe28a'], '#0a1028');
    rows.slice(0, 10).forEach((r, k) => {
        const y = 112 + k * 47;
        x.textAlign = 'left';
        outlined(x, '#' + (k + 1), 46, y, 70, 34, k === 0 ? '#ffd028' : k === 1 ? '#e8ecf4' : k === 2 ? '#ff9a4a' : '#ffffff', '#0a1028');
        x.font = '700 32px ' + FONT;
        const nm = r.n.length > 14 ? r.n.slice(0, 13) + '…' : r.n;
        x.textAlign = 'left'; x.fillStyle = '#ffffff'; x.lineWidth = 6; x.strokeStyle = '#0a1028';
        fitFont(x, nm, 250, 32, 700, FONT, 0.2);
        x.strokeText(nm, 90, y); x.fillText(nm, 90, y);
        x.textAlign = 'right'; x.fillStyle = '#9aff7a';
        fitFont(x, fmt(r.v), 140, 32, 700, FONT, 0.2);
        x.strokeText(fmt(r.v), W - 24, y); x.fillText(fmt(r.v), W - 24, y);
    });
    if (!rows.length) outlined(x, 'Be the first!', W / 2, 300, W - 60, 40, '#ffffff', '#0a1028');
    return c;
}
export function renderBoards(m) {
    for (const key of Object.keys(lobbyState.boards)) {
        const e = lobbyState.boards[key], rows = (m && m[key]) || [];
        const k = JSON.stringify(rows);
        if (k === e.key) continue;
        e.key = k;
        e.m.material.map.dispose();
        e.m.material.map = texFrom(drawBoard(e.b, rows));
        e.m.material.needsUpdate = true;
    }
}

// ----- the rebirth portal -----
function rebirthLines() {
    const r = S.rebirths || 0;
    return [{ t: '♻️ REBIRTH', c: '#e8b4ff', s: '#2a0a4a', px: 64 }, { t: 'Level ' + rebirthLevel(r) + ' → x' + (r + 2) + ' Venom', c: '#ffffff', s: '#2a0a4a', px: 40 }];
}
function buildRebirth() {
    const Z = -1, p = REBIRTH;
    studBox(Z, 12, 1, 12, p.x, 0.5, p.z, 0x4a3a7a, { shade: [0.8, 1.05] });
    const ring = new T.Mesh(new T.TorusGeometry(5.2, 0.7, 10, 36), mat(0x8a4aff));
    ring.position.set(p.x, 7, p.z); ring.castShadow = true;
    zoneGroup(Z).add(ring);
    bakeMesh(Z, ring, true);
    const disc = new T.Mesh(new T.CircleGeometry(4.6, 36), swirlMaterial(0xb45aff, 0xff7ae8, 1));
    disc.position.set(p.x, 7, p.z);
    zoneGroup(Z).add(disc);
    const sw = new T.Mesh(swirlGeo(3, 5, 12), swirlMaterial(0x9a4aff, 0xffffff, 0.6));
    sw.position.set(p.x, 1, p.z);
    zoneGroup(Z).add(sw);
    for (const sx of [-1, 1]) studBox(Z, 1.4, 6.4, 1.4, p.x + sx * 5.2, 3.2, p.z, 0x3a2a5a);
    lobbyState.rebirthLabel = label(Z, rebirthLines(), 11, { x: p.x, y: 15, z: p.z }, 90);
    prompts.push({ pos: new V3(p.x, 0, p.z), r: 8, zone: Z, label: () => 'Rebirth', act: () => actions.openRebirth && actions.openRebirth() });
}
// ----- "UPDATE! EVENT SOON!": the chalkboard from the reference -----
function buildUpdateBoard() {
    const Z = -1, p = UPDATE_BOARD;
    boxE(Z, p.x - 6, p.x + 6, 1.6, 10, p.z - 0.4, p.z + 0.4, C.wood, { solid: false });
    for (const sx of [-1, 1]) studBox(Z, 0.8, 2, 0.8, p.x + sx * 4.5, 0.8, p.z, C.wood);
    signPlane(Z, 'update', 512, 360, (x, W, H) => {
        x.fillStyle = '#16302a'; x.fillRect(0, 0, W, H);
        outlined(x, '???', W / 2, H / 2 + 10, W - 80, 150, '#ffffff', null, FONT, 700);
    }, 11, { x: p.x, y: 5.8, z: p.z - 0.45 }, Math.PI);
    label(Z, [{ t: 'UPDATE!', c: '#7dff6b', s: '#0a1a0a', px: 52 }, { t: 'EVENT SOON!', c: '#ffffff', s: '#0a1a0a', px: 58 }], 12, { x: p.x, y: 13.5, z: p.z }, 90);
}
// ----- props: a red car, a helicopter, a little house (the reference's lobby clutter, tidied) -----
function buildProps(r) {
    const Z = -1;
    const car = (x, z, col, yaw) => {
        const g = new T.Group();
        const part = (sx, sy, sz, px, py, pz, c) => { const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), mat(c)); m.position.set(px, py, pz); m.castShadow = true; g.add(m); };
        part(4.4, 1.4, 8.4, 0, 1.4, 0, col); part(3.8, 1.3, 4.2, 0, 2.7, -0.5, col); part(3.6, 1, 0.2, 0, 2.7, 1.62, 0x9ad8ff);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(0.8, 1.5, 1.5, sx * 2.3, 0.75, sz * 2.7, 0x1c1c24);
        part(0.8, 0.4, 0.2, 1.4, 1.5, 4.22, 0xfff6c8); part(0.8, 0.4, 0.2, -1.4, 1.5, 4.22, 0xfff6c8);
        g.position.set(x, 0, z); g.rotation.y = yaw;
        zoneGroup(Z).add(g);
        g.updateMatrixWorld(true);
        [...g.children].forEach((m) => bakeMesh(Z, m, true));
        solidBox(x, 1.6, z, 6, 3.2, 8.6, { zone: Z });
    };
    car(-24, -56, 0xe8302a, 0.4);
    car(26, -60, 0x3a8aff, -0.3);
    // a little house with a pink roof
    boxE(Z, 30, 42, 0, 7, 8, 18, 0xf2ecdc, { shade: [0.85, 1.05] });
    boxE(Z, 29, 43, 7, 8.4, 7, 19, 0xff6a9a, { solid: false });
    boxE(Z, 31.5, 40.5, 8.4, 9.8, 9.5, 16.5, 0xff6a9a, { solid: false });
    boxE(Z, 34.5, 37.5, 0, 4.6, 7.8, 8.1, C.wood, { solid: false });
    void r;
}

// =====================================================================================
// The canyon: walls from the liquid up (brick, jungle stone, void rock), a cap with drips, terraces
// of the world's trees beyond. One per world, each at its own x.
// =====================================================================================
const themeKey = (w) => (WORLDS[(w || 1) - 1] || WORLDS[0]).theme;
// a terrace's top: grass or moss (studded), or dark rock in the void (its crystals do the glowing)
const capStrip = (Z, sx, sz, x, y, z) => studBox(Z, sx, 1.4, sz, x, y, z, TH.capGlow ? TH.brickD : TH.cap, { solid: false });
function buildCanyon(w) {
    const r = rngFrom(11 + (w - 1) * 7), X0 = WORLD_X[w - 1], AZ = alwaysZone(w), f = firstStageOf(w);
    const plats = worldPlatforms(w), endZ = plats[plats.length - 1].ze;
    const z0 = LOBBY.z1, z1 = endZ + 80;
    // the liquid, the whole length of the canyon (and a moat round the far end)
    const lg = new T.PlaneGeometry(HW * 2, z1 - z0 + 20, 1, 1);
    lg.rotateX(-Math.PI / 2);
    const lm = new T.Mesh(lg, liquidMaterial(TH.liquid));
    lm.position.set(X0, LAVA_Y, (z0 + z1) / 2 + 10);
    lm.matrixAutoUpdate = false; lm.updateMatrix();
    zoneGroup(AZ).add(lm);
    // the walls, cut into pieces along z so each piece culls with its stretch of the canyon
    const cuts = [z0];
    for (const p of plats) cuts.push(p.ze);
    cuts[cuts.length - 1] = z1;
    // the later worlds' trees are bigger: fewer of them
    const sp = w === 1 ? 1 : 1.3;
    for (let k = 0; k < cuts.length - 1; k++) {
        const a = cuts[k], b = cuts[k + 1], Z = staticZone(f + k);
        for (const s of [-1, 1]) {
            const xi = X0 + s * HW, xo = X0 + s * (HW + 12);
            boxE(Z, Math.min(xi, xo), Math.max(xi, xo), LAVA_Y - 4, WALL_TOP, a, b, TH.brick, { shade: [0.62, 1.02], warm: 16, solidZone: AZ, mat: 'wall', extra: { bound: true } });
            grassCap(Z, Math.min(xi, xo), Math.max(xi, xo), a, b, WALL_TOP, r, [{ axis: 'z', pos: xi, out: -s, along: [a, b] }]);
            ledStrip(Z, 'z', xi, a, b, WALL_TOP - 3.2, -s, TH.led, false);
            // terraces stepping back with trees on them
            const x2 = X0 + s * (HW + 30), x3 = X0 + s * (HW + 56);
            boxE(Z, Math.min(xo, x2), Math.max(xo, x2), LAVA_Y - 4, WALL_TOP + 12, a, b, TH.brickD, { solid: false, shade: [0.7, 1] });
            capStrip(Z, 18, b - a, X0 + s * (HW + 21), WALL_TOP + 12.7, (a + b) / 2);
            boxE(Z, Math.min(x2, x3), Math.max(x2, x3), LAVA_Y - 4, WALL_TOP + 26, a, b, TH.brickD, { solid: false, shade: [0.7, 1] });
            capStrip(Z, 26, b - a, X0 + s * (HW + 43), WALL_TOP + 26.7, (a + b) / 2);
            for (let z = a + 6 + r() * 6; z < b - 4; z += (16 + r() * 10) * sp) tree(Z, X0 + s * (HW + 5 + r() * 4), WALL_TOP + 1.4, z, r, 0.95);
            for (let z = a + 4 + r() * 8; z < b - 4; z += (20 + r() * 10) * sp) tree(Z, X0 + s * (HW + 18 + r() * 6), WALL_TOP + 13.4, z, r, 1.15);
            for (let z = a + 10 + r() * 8; z < b - 4; z += (22 + r() * 12) * sp) tree(Z, X0 + s * (HW + 38 + r() * 12), WALL_TOP + 27.4, z, r, 1.35);
        }
        // the void: rock islands drifting in the sky beyond the walls, crystals on top
        if (w === 3) for (const s of [-1, 1]) if (r() < 0.75) island(Z, X0 + s * (HW + 80 + r() * 60), WALL_TOP + 30 + r() * 40, a + r() * Math.max(1, b - a), r);
    }
    // World 1: the lobby's corners meet the canyon walls (a hub is as wide as its canyon)
    if (w === 1) for (const s of [-1, 1]) boxE(AZ, s > 0 ? HW + 12 : LOBBY.x0 - 14, s > 0 ? LOBBY.x1 + 14 : -(HW + 12), LAVA_Y - 4, WALL_TOP, z0, z0 + 12, TH.brick, { shade: [0.62, 1.02], mat: 'wall', extra: { bound: true } });
    // the liquid's light along the bottom of the walls
    const glowTex = sharedTex('liquidglow|' + TH.liquid, () => { const c = canvas(4, 64), x = c.getContext('2d'); const g = x.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, TH.glow + '0.9)'); g.addColorStop(0.35, TH.glow + '0.35)'); g.addColorStop(1, TH.glow + '0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); return c; });
    const gm = new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide, forceSinglePass: true });
    for (const s of [-1, 1]) {
        const pg = new T.PlaneGeometry(z1 - z0, 14);
        pg.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
        pg.translate(X0 + s * (HW - 0.05), LAVA_Y + 7, (z0 + z1) / 2);
        addGeo(AZ, pg, gm, false);
    }
    // falls pouring down the walls every so often
    const lf = liquidFallMaterial(TH.liquid);
    for (let z = z0 + 90, s = 1; z < endZ; z += 120 + r() * 90, s = -s) {
        const fw = 7 + r() * 5;
        const pg = new T.PlaneGeometry(fw, WALL_TOP - LAVA_Y + 2);
        pg.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
        pg.translate(X0 + s * (HW - 0.3), (WALL_TOP + LAVA_Y) / 2, z);
        const zone = stageAt(X0, z);
        addGeo(staticZone(zone), pg, lf, false);
        lavaFalls.push({ x: X0 + s * (HW - 1.5), z, w: fw, zone, world: w, c: TH.splash });
        // the glow pool where it lands
        const pool = new T.Mesh(new T.PlaneGeometry(fw + 10, 12), glowMaterial(TH.pool, 0.65));
        pool.rotation.x = -Math.PI / 2; pool.position.set(X0 + s * (HW - 5), LAVA_Y + 0.15, z);
        zoneGroup(zone).add(pool);
    }
}
export const lavaFalls = [];
// A strip of lights along a wall's top edge, in segments: two colours blending along it (or a full
// rainbow); the neon flow makes the bands race along it and the colours drift
const ledTmp = new T.Color(), ledTmp2 = new T.Color();
function ledStrip(Z, axis, fixed, a0, a1, y, out, colors, rainbow) {
    const seg = 5;
    for (let a = a0; a < a1 - 0.01; a += seg) {
        const L = Math.min(seg, a1 - a), mid = a + L / 2;
        if (rainbow) ledTmp.setHSL(((mid / 60) % 1 + 1) % 1, 1, 0.56);
        else ledTmp.set(colors[0]).lerp(ledTmp2.set(colors[1]), 0.5 + 0.5 * Math.sin(mid / 9));
        ledTmp.multiplyScalar(1.3);
        const m = neon(0xffffff, 1.0);
        if (axis === 'z') addBoxFast(Z, m, false, 0.5, 1.1, L - 0.5, fixed + out * 0.25, y, mid, 0, ledTmp, true);
        else addBoxFast(Z, m, false, L - 0.5, 1.1, 0.5, mid, y, fixed + out * 0.25, 0, ledTmp, true);
    }
}
// a floating rock island (an upside-down crag) with a crystal cluster on top
function island(Z, x, y, z, r) {
    const s = 6 + r() * 8;
    const g = new T.ConeGeometry(s, s * 1.6, 6);
    g.rotateX(Math.PI); g.rotateY(r() * 3); g.translate(x, y - s * 0.8, z);
    addGeo(Z, g, mat(0x2a2246), false, 0x2a2246, [0.45, 1]);
    addBoxFast(Z, mat(0x3a2e60), false, s * 1.5, 1.2, s * 1.5, x, y + 0.2, z, 0, 0x3a2e60);
    crystals(Z, x, y + 0.6, z, r, 0.7 + s / 14);
}

// =====================================================================================
// A World 2 / 3 hub: a smaller yard at the head of its canyon (its spawn, the first launch pad, its
// own Train Zone pads and symbiote statues, a portal home)
// =====================================================================================
function buildHub(w) {
    const Z = hubZone(w), H = HUBS[w - 1], X0 = H.x, r = rngFrom(40 + w);
    const x0 = X0 + HUB.x0, x1 = X0 + HUB.x1, z0 = HUB.z0, z1 = HUB.z1, top = HUB.wallTop;
    studBox(Z, x1 - x0, -(LAVA_Y - 4), z1 - z0, (x0 + x1) / 2, (LAVA_Y - 4) / 2, (z0 + z1) / 2, TH.floor, { mat: 'grass', shade: [0.55, 1, LAVA_Y - 4, 0], warm: 6 });
    const path = (ax0, ax1, az0, az1, color) => addBoxFast(Z, studVCMaterial(), false, ax1 - ax0, 0.08, az1 - az0, X0 + (ax0 + ax1) / 2, 0.04, (az0 + az1) / 2, 8, color || TH.path, true);
    path(-6, 6, z0 + 6, z1);          // the main path, south to north
    path(-14, 14, -40, -16);          // the spawn plaza
    path(-28, -14, -31, -25);         // to the Train Zone
    path(14, 28, -31, -25);           // to the statues
    path(-37, -27, -42, -2);          // along the pads
    path(27, 37, -46, 2);             // along the statues
    path(-13, -6, -48, -42);          // to the portal home
    const emb = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshBasicMaterial({ map: sharedTex('emblem', drawEmblem), transparent: true, depthWrite: false, toneMapped: false, forceSinglePass: true }));
    emb.rotation.x = -Math.PI / 2; emb.position.set(X0, 0.1, -28); emb.renderOrder = 1;
    zoneGroup(Z).add(emb);
    // walls: west, east, south, a cap with drips, a terrace behind with the world's trees
    const brick = (bx0, bx1, bz0, bz1) => studBox(Z, bx1 - bx0, top + 4, bz1 - bz0, (bx0 + bx1) / 2, (top - 4) / 2, (bz0 + bz1) / 2, TH.brick, { shade: [0.72, 1.02], mat: 'wall', extra: { bound: true } });
    brick(x0 - 14, x0, z0 - 14, z1); brick(x1, x1 + 14, z0 - 14, z1); brick(x0, x1, z0 - 14, z0);
    grassCap(Z, x0 - 14, x0, z0 - 14, z1, top, r, [{ axis: 'z', pos: x0, out: 1, along: [z0, z1] }]);
    grassCap(Z, x1, x1 + 14, z0 - 14, z1, top, r, [{ axis: 'z', pos: x1, out: -1, along: [z0, z1] }]);
    grassCap(Z, x0, x1, z0 - 14, z0, top, r, [{ axis: 'x', pos: z0, out: 1, along: [x0, x1] }]);
    ledStrip(Z, 'z', x0, z0, z1, top - 3.2, 1, TH.led, false);
    ledStrip(Z, 'z', x1, z0, z1, top - 3.2, -1, TH.led, false);
    ledStrip(Z, 'x', z0, x0, x1, top - 3.2, 1, TH.led, false);
    boxE(Z, x0 - 40, x0 - 14, -4, top + 10, z0 - 40, z1, TH.brickD, { solid: false, shade: [0.7, 1] });
    boxE(Z, x1 + 14, x1 + 40, -4, top + 10, z0 - 40, z1, TH.brickD, { solid: false, shade: [0.7, 1] });
    boxE(Z, x0 - 14, x1 + 14, -4, top + 10, z0 - 40, z0 - 14, TH.brickD, { solid: false, shade: [0.7, 1] });
    for (const [a0, a1, b0, b1] of [[x0 - 40, x0 - 14, z0 - 40, z1], [x1 + 14, x1 + 40, z0 - 40, z1], [x0 - 14, x1 + 14, z0 - 40, z0 - 14]]) capStrip(Z, a1 - a0, b1 - b0, (a0 + a1) / 2, top + 10.7, (b0 + b1) / 2);
    for (let z = z0 + 4; z < z1; z += 18 + r() * 6) { tree(Z, x0 - 7, top + 1.4, z, r); tree(Z, x1 + 7, top + 1.4, z + 5, r); tree(Z, x0 - 27, top + 11.4, z + 3, r, 1.2); tree(Z, x1 + 27, top + 11.4, z - 2, r, 1.2); }
    for (let x = x0 + 6; x < x1; x += 18 + r() * 6) { tree(Z, x, top + 1.4, z0 - 7, r); tree(Z, x + 4, top + 11.4, z0 - 27, r, 1.2); }
    for (const [tx, tz] of [[-22, 16], [22, 16], [-40, -50], [12, -50]]) tree(Z, X0 + tx, 0, tz, r, 0.8);
    // the world's name over the south wall; the Train Zone and the shop on the side walls
    const W = WORLDS[w - 1];
    signPlane(Z, 'hub' + w, 1024, 300, (x, Wd, Ht) => banner(x, Wd, Ht, TH.banner[0], TH.banner[1], W.name.toUpperCase(), W.ic), 40, { x: H.sign.x, y: H.sign.y, z: H.sign.z + 0.2 }, 0);
    signPlane(Z, 'trainzone', 1024, 300, (x, Wd, Ht) => banner(x, Wd, Ht, '#2a6aff', '#123a9a', 'TRAIN ZONE', '🕷️'), 24, { x: x0 + 0.3, y: 13, z: -22 }, Math.PI / 2);
    signPlane(Z, 'winshop', 1024, 300, (x, Wd, Ht) => banner(x, Wd, Ht, '#ffe24a', '#e8a414', 'WIN SHOP', '🏆'), 24, { x: x1 - 0.3, y: 13, z: -22 }, -Math.PI / 2);
    TRAIN.forEach((p, i) => { if (p.w === w) trainPad(Z, p, i); });
    const swirls = [];
    SHOP.forEach((p, i) => { if (p.w === w) statue(Z, p, i, swirls); });
    if (swirls.length) { const sm = new T.Mesh(mergeGeometries(swirls), swirlVCMaterial()); swirls.forEach((g) => g.dispose()); zoneGroup(Z).add(sm); }
    portal(Z, H.portal, 1, true);
}

// ----- world portals: a glowing ring on a stone step, the world's colours swirling in it (locked:
// grey); in each hub, a golden one home to the lobby -----
export const portals = [];
function portalLines(w, home) {
    if (home) return [{ t: '🏠 LOBBY', c: '#ffe24a', s: '#3a2400', px: 60 }, { t: 'World 1 · Rebirth · Boards', c: '#ffffff', s: '#3a2400', px: 36 }];
    const W = WORLDS[w - 1], open = (S.world || 1) >= w;
    return [
        { t: W.ic + ' WORLD ' + w, c: open ? css(themeOf(w).neon) : '#c8c8d8', s: '#10102a', px: 60 },
        { t: open ? W.name : '🔒 Escape World ' + (w - 1), c: open ? '#ffffff' : '#ff8a9a', s: '#10102a', px: 40 },
    ];
}
function portal(Z, p, w, home) {
    const th = home ? THEMES.lava : themeOf(w);
    const c1 = home ? 0xffd23a : th.swirl[0], c2 = home ? 0xffffff : th.swirl[1];
    studBox(Z, 6, 1, 12, p.x, 0.5, p.z, home ? 0x8a6a2a : 0x4a4f5c, { shade: [0.8, 1.05], mat: 'stone' });
    const ring = new T.Mesh(new T.TorusGeometry(4.8, 0.7, 10, 40), neon(home ? 0xffc828 : th.neon, 1.0));
    ring.position.set(p.x, 6.4, p.z); ring.rotation.y = Math.PI / 2;
    zoneGroup(Z).add(ring);
    bakeMesh(Z, ring, false);
    for (const sz of [-1, 1]) studBox(Z, 1.6, 6.4, 1.6, p.x, 3.2, p.z + sz * 5.6, home ? 0x6a4a1a : 0x2a2c36);
    const on = swirlMaterial(c1, c2, 1.1), off = swirlMaterial(0x4a4a5a, 0x8a8aa0, 0.5);
    const disc = new T.Mesh(new T.CircleGeometry(4.3, 36), home ? on : off);
    disc.position.copy(ring.position); disc.rotation.y = Math.PI / 2;
    zoneGroup(Z).add(anim(disc));
    const sw = new T.Mesh(swirlGeo(2.4, 4, 9), swirlMaterial(c1, 0xffffff, 0.45));
    sw.position.set(p.x, 1, p.z);
    zoneGroup(Z).add(sw);
    const lb = label(Z, portalLines(w, home), 10, { x: p.x, y: 14.5, z: p.z }, 110);
    portals.push({ w, home, disc, lb, on, off, key: '' });
}

// =====================================================================================
// The stages: obstacles in the liquid, then the platform
// =====================================================================================
export const spinners = [], crushers = [], geysers = [], logs = [], jaws = [], lasers = [], orbits = [], boosts = [];
export const padSpots = [];      // { i, b, x, y, z, s, label, arrow }
function stoneColumn(Z, x, z, sx, sz, top, color) {
    return studBox(Z, sx, top - (LAVA_Y - 4), sz, x, (top + LAVA_Y - 4) / 2, z, color || TH.stone, { shade: [0.55, 1.04], warm: 10, cast: true, mat: 'stone' });
}
function buildStages(w) {
    for (const o of OBSTACLES) if (o.world === w) buildObstacle(o);
    for (const p of PLATFORMS) if (p.world === w) buildPlatform(p);
    buildLaunchPads(w);
    buildEscape(w);
    buildOrbs(w);
}
// the top of a pillar: grass or moss, or a glowing crystal slab in the void
const pillarCap = (Z, s, x, y, z) => (TH.capGlow ? plainBox(Z, s, 1, s, x, y, z, neon(TH.cap, 0.95)) : studBox(Z, s, 1, s, x, y, z, TH.cap, { solid: false }));
// several geometries as one mesh (moving parts: a few draw calls each, not dozens)
function merged(list, material, cast) {
    const g = mergeGeometries(list);
    list.forEach((q) => q.dispose());
    const m = new T.Mesh(g, material);
    m.castShadow = !!cast; m.receiveShadow = true;
    return m;
}
const VENT = { lava: 0x3a2c28, toxic: 0x26341a, void: 0x221a3e };
let laserGlowM = null;
const laserGlow = () => laserGlowM || (laserGlowM = new T.MeshBasicMaterial({
    map: sharedTex('laserglow', () => { const c = canvas(4, 64), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,40,80,0)'); g.addColorStop(0.5, 'rgba(255,90,120,1)'); g.addColorStop(1, 'rgba(255,40,80,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); return c; }),
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide, forceSinglePass: true, opacity: 0.85,
}));
function buildObstacle(o) {
    const Z = staticZone(o.zone), D = o.zone, X0 = WORLD_X[o.world - 1], hz = hazardMaterial(themeKey(o.world));
    curStage = o.zone;
    if (o.kind === 'pillar') {
        const s = stoneColumn(Z, o.x, o.z, o.s, o.s, o.top, TH.pillar);
        s.obstacle = true;
        pillarCap(Z, o.s + 1, o.x, o.top + 0.5, o.z);
    } else if (o.kind === 'wall' || o.kind === 'half') {
        const y0 = LAVA_Y - 4, y1 = WALL_TOP - 2;
        const holes = o.kind === 'wall' ? o.holes.map((h) => ({ a0: h.x - h.w / 2, a1: h.x + h.w / 2, b0: h.y - h.h / 2, b1: h.y + h.h / 2 })) : [];
        const x0 = o.x0, x1 = o.x1;
        for (const rc of subtractRect(x0, x1, y0, y1, holes)) {
            const s = boxE(Z, rc.a0, rc.a1, rc.b0, rc.b1, o.z - o.t / 2, o.z + o.t / 2, TH.wall, { shade: [0.6, 1.02], warm: 12, cast: true, mat: 'wall' });
            s.obstacle = true;
        }
        grassCap(Z, x0, x1, o.z - o.t / 2, o.z + o.t / 2, y1, rngFrom(o.z | 0), null);
        // glowing frames round the windows, a glowing edge on a half wall's open side
        const nm = neon(TH.neon, 1.3);
        for (const h of holes) {
            const t = 0.5, zf = [o.z - o.t / 2 - 0.12, o.z + o.t / 2 + 0.12];
            for (const zz of zf) {
                plainBox(Z, h.a1 - h.a0 + t * 2, t, 0.2, (h.a0 + h.a1) / 2, h.b0 - t / 2, zz, nm);
                plainBox(Z, h.a1 - h.a0 + t * 2, t, 0.2, (h.a0 + h.a1) / 2, h.b1 + t / 2, zz, nm);
                plainBox(Z, t, h.b1 - h.b0, 0.2, h.a0 - t / 2, (h.b0 + h.b1) / 2, zz, nm);
                plainBox(Z, t, h.b1 - h.b0, 0.2, h.a1 + t / 2, (h.b0 + h.b1) / 2, zz, nm);
            }
        }
        if (o.kind === 'half') {
            const ex = o.x0 <= X0 - HW + 0.1 ? o.x1 : o.x0;
            plainBox(Z, 0.6, y1 - LAVA_Y, o.t + 0.3, ex, (y1 + LAVA_Y) / 2, o.z, nm);
        }
    } else if (o.kind === 'beam') {
        const s = boxE(Z, o.x0, o.x1, o.y - o.h / 2, o.y + o.h / 2, o.z - o.t / 2, o.z + o.t / 2, TH.stone, { shade: [0.75, 1.05], cast: true, mat: 'stone' });
        s.obstacle = true;
        plainBox(Z, o.x1 - o.x0, 0.4, o.t + 0.2, X0, o.y - o.h / 2 - 0.2, o.z, neon(TH.neon, 1.3));
        for (const sx of [-1, 1]) stoneColumn(Z, X0 + sx * (HW - 4), o.z, 6, o.t + 2, o.y - o.h / 2, TH.pillarD);
    } else if (o.kind === 'spinner') {
        // a windmill of blades across the canyon, turning round the z axis
        const g = new T.Group();
        g.position.set(o.x, o.y, o.z);
        const hub = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 3.4, 16), mat(0x2a2c36));
        hub.rotation.x = Math.PI / 2; hub.castShadow = hub.receiveShadow = true; g.add(hub);
        const blades = new T.Group();
        const bars = [], tips = [];
        for (let k = 0; k < 2; k++) {
            const b = new T.BoxGeometry(o.len * 2, o.t, o.t);
            b.rotateZ(k * Math.PI / 2);
            bars.push(b);
            for (const sgn of [-1, 1]) {
                const tg = new T.BoxGeometry(1.2, o.t + 0.4, o.t + 0.4);
                tg.translate(sgn * o.len, 0, 0); tg.rotateZ(k * Math.PI / 2);
                tips.push(tg);
            }
        }
        blades.add(merged(bars, hz, true), merged(tips, neon(0xff3a3a, 1.4), false));
        g.add(anim(blades));
        // the post it turns on
        stoneColumn(Z, o.x, o.z + 3, 3, 2.4, o.y - 1, TH.stoneD);
        zoneGroup(D).add(anim(g));
        spinners.push({ ...o, g, blades });
    } else if (o.kind === 'crusher') {
        const h = o.top - LAVA_Y + 2;
        const m = new T.Mesh(new T.BoxGeometry(o.w, h, o.d), hz);
        m.castShadow = true; m.receiveShadow = true;
        m.position.set(o.x0, (o.top + LAVA_Y - 2) / 2, o.z);
        const cap = new T.Mesh(new T.BoxGeometry(o.w + 0.6, 0.8, o.d + 0.6), neon(0xff3a3a, 1.4));
        cap.position.y = h / 2 + 0.4; m.add(cap);
        zoneGroup(D).add(anim(m));
        crushers.push({ ...o, m, h });
    } else if (o.kind === 'geyser') {
        // a ring of dark rock in the liquid, and the column that shoots up out of it
        const vent = new T.Mesh(new T.CylinderGeometry(o.r + 1.4, o.r + 2.2, 2.4, 14, 1, true), mat(VENT[themeKey(o.world)]));
        vent.position.set(o.x, LAVA_Y + 0.6, o.z);
        zoneGroup(Z).add(vent);
        bakeMesh(Z, vent, false);
        const ring = new T.Mesh(new T.CircleGeometry(o.r + 1.4, 20), geyserMaterial(TH.liquid));
        ring.rotation.x = -Math.PI / 2; ring.position.set(o.x, LAVA_Y + 1.5, o.z);
        zoneGroup(D).add(ring);
        const col = new T.Mesh(new T.CylinderGeometry(o.r, o.r * 1.25, 1, 16, 1, true), geyserMaterial(TH.liquid));
        col.position.set(o.x, LAVA_Y, o.z);
        zoneGroup(D).add(anim(col));
        const glow = new T.Mesh(new T.PlaneGeometry(o.r * 6, o.r * 6), glowMaterial(TH.geyser, 0.8).clone());
        glow.rotation.x = -Math.PI / 2; glow.position.set(o.x, LAVA_Y + 0.3, o.z);
        zoneGroup(D).add(anim(glow));
        geysers.push({ ...o, col, glow, was: 0, c: TH.splash });
    } else if (o.kind === 'log') {
        // a spiked log lying across the canyon, swinging side to side on two ropes from a beam high
        // between the walls (tilting as it swings, like a swing seat)
        const wood = [], bands = [], spikes = [];
        const lg = new T.CylinderGeometry(o.r, o.r, o.half * 2, 14);
        lg.rotateZ(Math.PI / 2); lg.translate(0, -o.len, 0);
        wood.push(painted(lg, 0x7a4a22));
        for (const sx of [-1, 1]) {
            // a rope from the log's end up to the pivot
            const ex = sx * (o.half - 1.5), L = Math.hypot(ex, o.len - o.r);
            const rg = new T.CylinderGeometry(0.22, 0.22, L, 6);
            rg.rotateZ(Math.atan2(ex, o.len - o.r)); rg.translate(ex / 2, -(o.len - o.r) / 2, 0);
            wood.push(painted(rg, 0x3a2a1a));
            const bg = new T.CylinderGeometry(o.r + 0.15, o.r + 0.15, 1.3, 14);
            bg.rotateZ(Math.PI / 2); bg.translate(sx * (o.half - 0.9), -o.len, 0);
            bands.push(bg);
        }
        for (let k = 0; k < 8; k++) for (const xx of [-4.5, 0, 4.5]) {
            const a2 = (k + (xx ? 0.5 : 0)) / 8 * Math.PI * 2;
            const sg = new T.ConeGeometry(0.55, 1.7, 6);
            // pointing out from the log's axis (x): round in the y-z plane
            sg.rotateX(a2); sg.translate(xx, -o.len + Math.cos(a2) * (o.r + 0.7), Math.sin(a2) * (o.r + 0.7));
            spikes.push(sg);
        }
        const arm = new T.Group();
        arm.add(merged(wood, smoothVC(), true), merged(bands, hz, true), merged(spikes, neon(0xff4a3a, 1.2), false));
        arm.position.set(o.x, o.pivotY, o.z);
        zoneGroup(D).add(anim(arm));
        // what it hangs from: a beam wall to wall (out of the tentacle's reach) and a pivot block
        boxE(Z, X0 - HW - 2, X0 + HW + 2, o.pivotY - 0.7, o.pivotY + 0.7, o.z - 0.9, o.z + 0.9, TH.stoneD, { solid: false, cast: true });
        plainBox(Z, 1.6, 1.6, 2.4, o.x, o.pivotY, o.z, mat(0x2a2c36));
        logs.push({ ...o, arm });
    } else if (o.kind === 'jaws') {
        // two toothed blocks snapping together across the canyon
        const h = o.top - LAVA_Y + 2, wd = HW, cy = (o.top + LAVA_Y - 2) / 2;
        const ms = [];
        for (const s of [-1, 1]) {
            const m = new T.Mesh(new T.BoxGeometry(wd, h, o.d), hz);
            m.castShadow = m.receiveShadow = true;
            const teeth = [];
            for (let y = LAVA_Y + 2 + (s > 0 ? 1.6 : 0); y < o.top - 1; y += 3.2) {
                const tg = new T.ConeGeometry(1, 2.4, 4);
                tg.rotateZ(s * Math.PI / 2); tg.translate(-s * (wd / 2 + 1.1), y - cy, 0);
                teeth.push(tg);
            }
            const edge = new T.BoxGeometry(0.5, h, o.d + 0.3);
            edge.translate(-s * wd / 2, 0, 0);
            teeth.push(edge);
            m.add(merged(teeth, neon(TH.neon, 1.25), false));
            m.position.set(o.x0 + s * (wd / 2 + 14), cy, o.z);
            zoneGroup(D).add(anim(m));
            ms.push(m);
        }
        jaws.push({ ...o, m: ms, wd });
    } else if (o.kind === 'laser') {
        // a bar of light between two emitters, riding up and down rails on the walls
        const g = new T.Group(), L = o.x1 - o.x0;
        g.add(new T.Mesh(new T.BoxGeometry(L, 0.45, 0.45), neon(0xff2a4a, 1.8)));
        const glow = new T.Mesh(new T.PlaneGeometry(L, 3.6), laserGlow());
        const glow2 = new T.Mesh(glow.geometry, laserGlow()); glow2.rotation.x = Math.PI / 2;
        g.add(glow, glow2);
        const em = [];
        for (const s of [-1, 1]) { const e = new T.BoxGeometry(2.4, 2.4, 2.4); e.translate(s * (L / 2 - 1.2), 0, 0); em.push(painted(e, 0x2a2c36)); }
        g.add(merged(em, smoothVC(), true));
        g.position.set((o.x0 + o.x1) / 2, o.y0, o.z);
        zoneGroup(D).add(anim(g));
        for (const s of [-1, 1]) plainBox(Z, 0.8, o.y1 - o.y0 + 4, 1.4, (s < 0 ? o.x0 : o.x1) - s * 0.4, (o.y0 + o.y1) / 2, o.z, mat(0x3a3e48));
        lasers.push({ ...o, g });
    } else if (o.kind === 'orbit') {
        // rocks circling round an empty middle: fly through the middle, or between them
        const rocks = [], crys = [];
        for (let k = 0; k < o.n; k++) {
            const a = k / o.n * Math.PI * 2, cx = Math.cos(a) * o.r, cy = Math.sin(a) * o.r;
            const rg = new T.IcosahedronGeometry(o.rock * 0.62, 0);
            rg.rotateX(k * 1.3); rg.rotateY(k * 0.7); rg.translate(cx, cy, 0);
            rocks.push(painted(rg, k % 2 ? 0x4a3a6a : 0x3a2e58));
            const cg = new T.ConeGeometry(0.6, 2.4, 4);
            cg.rotateZ(a - Math.PI / 2); cg.translate(cx + Math.cos(a) * 1.9, cy + Math.sin(a) * 1.9, 0);
            crys.push(cg.index ? cg.toNonIndexed() : cg);
        }
        const rk = new T.Group();
        rk.add(merged(rocks, smoothVC(), true), merged(crys, neon(0xff5ad8, 1.3), false));
        rk.position.set(o.x, o.y, o.z);
        zoneGroup(D).add(anim(rk));
        // the orbit's path, faintly
        const path = new T.Mesh(new T.TorusGeometry(o.r, 0.12, 4, 72), neon(TH.neon, 0.7));
        path.position.set(o.x, o.y, o.z);
        zoneGroup(Z).add(path);
        bakeMesh(Z, path, false);
        orbits.push({ ...o, rk });
    } else if (o.kind === 'boost') {
        // a ring of light: fly the tentacle's head through it for extra length and speed
        const ring = new T.Mesh(new T.TorusGeometry(o.r, 0.5, 8, 40), neon(0x5affe0, 1.25));
        ring.position.set(o.x, o.y, o.z);
        zoneGroup(Z).add(ring);
        bakeMesh(Z, ring, false);
        const disc = new T.Mesh(new T.CircleGeometry(o.r - 0.3, 32), swirlMaterial(0x3affd0, 0xffffff, 0.45));
        disc.position.set(o.x, o.y, o.z);
        zoneGroup(D).add(anim(disc));
        label(D, [{ t: '⚡ BOOST', c: '#8affea', s: '#06302a', px: 54 }], 5.5, { x: o.x, y: o.y + o.r + 2.4, z: o.z }, 150, 512, 6);
        boosts.push({ ...o, disc });
    }
}
// Geyser cycle: quiet, bubbling (warning), erupting; h: the column's height above the liquid
export function geyserState(o, t) {
    const k = (((t + o.phase) % o.period) + o.period) % o.period / o.period;
    if (k < 0.42) return { on: false, warn: false, h: 0, k };
    if (k < 0.55) return { on: false, warn: true, h: 1.5, k };
    const e = (k - 0.55) / 0.45;
    const h = (o.top - LAVA_Y) * (e < 0.15 ? e / 0.15 : e > 0.85 ? (1 - e) / 0.15 : 1);
    return { on: h > 3, warn: false, h, k };
}
const TAU = Math.PI * 2;
export const spinnerAngle = (o, t) => o.speed * t;
export const crusherX = (o, t) => o.x0 + o.range * Math.sin((t / o.period + o.phase) * TAU);
// a swinging log: its angle (0 = hanging straight down) and where the log's middle is (it lies along
// x, tilted by the same angle)
export const logAngle = (o, t) => o.amp * Math.sin((t / o.period + o.phase) * TAU);
export function logCenter(o, t, out) { const a = logAngle(o, t); out.x = o.x + o.len * Math.sin(a); out.y = o.pivotY - o.len * Math.cos(a); return out; }
// snapping jaws: the half width of the gap between them (wide open most of the time, then a snap)
export function jawsGap(o, t) {
    const k = (((t / o.period + o.phase) % 1) + 1) % 1;
    const shut = k < 0.6 ? 0 : k < 0.72 ? (k - 0.6) / 0.12 : k < 0.84 ? 1 : 1 - (k - 0.84) / 0.16;
    return 1.2 + 12.8 * (1 - shut * shut * (3 - 2 * shut));
}
export const laserY = (o, t) => o.y0 + (o.y1 - o.y0) * (0.5 + 0.5 * Math.sin((t / o.period + o.phase) * TAU));
export const orbitAngle = (o, t) => o.speed * t;

function buildPlatform(p) {
    const Z = staticZone(p.i), D = p.i;
    curStage = p.i;
    const st = STAGES[p.i];
    // the platform: a stone block rising out of the liquid, a lighter studded top
    const s = boxE(Z, p.x - p.w / 2, p.x + p.w / 2, LAVA_Y - 4, p.top - 1, p.zs, p.ze, TH.stoneD, { shade: [0.5, 1], warm: 9, cast: true, mat: 'stone' });
    s.platform = p.i;
    const top = boxE(Z, p.x - p.w / 2, p.x + p.w / 2, p.top - 1, p.top, p.zs, p.ze, TH.stoneT, { shade: [0.92, 1.06], mat: 'stone' });
    top.platform = p.i;
    // a dark lip round the top (glowing in the void)
    const lip = neon(TH.capGlow ? TH.lip : TH.lipGlow, 1.0);
    for (const [a, b, c, d] of [[p.x - p.w / 2, p.x + p.w / 2, p.zs - 0.25, p.zs + 0.25], [p.x - p.w / 2, p.x + p.w / 2, p.ze - 0.25, p.ze + 0.25]]) plainBox(Z, b - a, 0.4, d - c, (a + b) / 2, p.top - 1.1, (c + d) / 2, lip);
    // the bonus pillar beside it
    const pl = p.pillar;
    const ps = stoneColumn(Z, pl.x, pl.z, pl.s, pl.s, pl.top, TH.pillarD);
    ps.platform = p.i; ps.pillar = true;
    // the later worlds dress their platforms: bushes in the jungle, crystals in the void
    if (p.world > 1) {
        const r = rngFrom(p.i * 31);
        for (const sx of [-1, 1]) {
            const cx = p.x + sx * (p.w / 2 - 2.6), cz = p.ze - 3;
            if (TH.tree === 'crystal') crystals(Z, cx, p.top, cz, r, 0.45);
            else for (let k = 0; k < 3; k++) glowShroom(Z, cx - sx * (k % 2) * 1.8, p.top, cz - k * 1.6, r);
        }
    }
    // the Wins pad and the bonus pad
    for (const [spot, b] of [[p.pad, false], [p.bonus, true]]) {
        const m = new T.Mesh(new T.PlaneGeometry(spot.s, spot.s), b ? padMaterial(0xc45aff, 0x3a0a6a, true, 1.4) : padMaterial(0xffe24a, 0x8a5a00, true, 1.2));
        m.rotation.x = -Math.PI / 2; m.position.set(spot.x, spot.y + 0.06, spot.z);
        zoneGroup(D).add(m);
        const n = st.wins * (b ? 2 : 1);
        const lb = label(D, b ? [{ t: '✨ BONUS ✨', c: '#f0b4ff', s: '#2a0a4a', px: 44 }, { t: '+' + fmt(n) + ' Wins', c: '#ffffff', s: '#2a0a4a', px: 64 }] : [{ t: '+' + fmt(n) + ' Wins', c: '#ffe24a', s: '#3a2400', px: 66 }], b ? 8 : 7.5, { x: spot.x, y: spot.y + 7.5, z: spot.z }, 260, 512, 7);
        const arrow = new T.Mesh(arrowGeo(), neon(b ? 0xe8a4ff : 0xffffff, 1.2));
        arrow.position.set(spot.x, spot.y + 4.2, spot.z);
        zoneGroup(D).add(anim(arrow));
        const beam = new T.Mesh(new T.CylinderGeometry(spot.s * 0.42, spot.s * 0.5, 14, 16, 1, true), beamMaterial(b ? 0xc45aff : 0xffd23a));
        beam.position.set(spot.x, spot.y + 7, spot.z);
        zoneGroup(D).add(beam);
        padSpots.push({ i: p.i, b, x: spot.x, y: spot.y, z: spot.z, s: spot.s, mesh: m, label: lb, arrow, beam });
    }
    // STAGE N / Recommended Level: R, floating over the near edge (the reference's big sign)
    stageSigns[p.i] = signPlane(D, 'stage' + p.k, 1024, 420, (x, W, H) => {
        outlined(x, 'STAGE ' + p.k, W / 2, 140, W - 60, 210, ['#ffffff', '#e6ecff'], '#151a33', TITLE, 800, 0.16);
        outlined(x, 'Recommended Level: ' + st.R, W / 2, 312, W - 80, 92, '#ff2a4a', '#ffffff', FONT, 700, 0.22);
        outlined(x, st.ic + ' ' + st.name, W / 2, 392, W - 120, 52, '#ffffff', '#151a33', FONT, 700, 0.24);
    }, 26, { x: p.sign.x, y: p.sign.y, z: p.sign.z }, Math.PI, { order: 3 });
}
export const stageSigns = [];
// Only the sign of the platform you're heading for is up (the others would loom over you)
let signsFor = null;
export function showSigns(next) {
    if (next === signsFor) return;
    signsFor = next;
    stageSigns.forEach((m, i) => { if (m) m.visible = i === next; });
}
let arrowG = null;
function arrowGeo() {
    if (arrowG) return arrowG;
    const s = new T.Shape();
    s.moveTo(-0.7, 1.6); s.lineTo(0.7, 1.6); s.lineTo(0.7, 0.4); s.lineTo(1.5, 0.4); s.lineTo(0, -1.2); s.lineTo(-1.5, 0.4); s.lineTo(-0.7, 0.4); s.closePath();
    arrowG = new T.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
    arrowG.translate(0, 0, -0.25);
    return arrowG;
}
// ----- launch pads: a glowing venom pad with a tornado twisting over it -----
export const launchPads = [];
function buildLaunchPads(w) {
    const f = firstStageOf(w);
    for (const l of LAUNCH) {
        if (l.w !== w) continue;
        const D = l.i === f ? (w === 1 ? -1 : hubZone(w)) : l.i - 1;
        const m = new T.Mesh(new T.PlaneGeometry(l.s, l.s), padMaterial(TH.launch[0], TH.launch[1], true, 1.6));
        m.rotation.x = -Math.PI / 2; m.position.set(l.x, l.y + 0.07, l.z);
        zoneGroup(D).add(m);
        const sw = new T.Mesh(swirlGeo(3.4, 6.2, 13), swirlMaterial(TH.swirl[0], TH.swirl[1], 0.95));
        sw.position.set(l.x, l.y, l.z);
        zoneGroup(D).add(sw);
        const lb = label(D, [{ t: '🕷️ RELEASE VENOM', c: css(TH.launch[0]), s: '#10102a', px: 50 }, { t: 'Jump on the pad!', c: '#ffffff', s: '#10102a', px: 40 }], 10, { x: l.x, y: l.y + 15.5, z: l.z }, 120, 512, 16);
        launchPads.push({ ...l, mesh: m, swirl: sw, label: lb });
    }
}
// ----- the escape portal at the end of each world -----
export const escapes = [];
function buildEscape(w) {
    const D = firstStageOf(w) + STAGES_PER_WORLD - 1, e = ESCAPES[w - 1];
    curStage = D;
    const ring = new T.Mesh(new T.TorusGeometry(9, 1.2, 12, 48), mat(0xffc828, { emissive: 0x8a5a00, ei: 0.6 }));
    ring.position.set(e.x, e.y + 11, e.z); ring.castShadow = ring.receiveShadow = true;
    zoneGroup(D).add(anim(ring));
    const disc = new T.Mesh(new T.CircleGeometry(8.2, 48), swirlMaterial(0xffd23a, 0xffffff, 1.1));
    disc.position.set(e.x, e.y + 11, e.z);
    zoneGroup(D).add(anim(disc));
    for (const sx of [-1, 1]) studBox(staticZone(D), 2, 10, 2, e.x + sx * 9, e.y + 5, e.z, 0xc8961a);
    const beam = new T.Mesh(new T.CylinderGeometry(7, 9, 40, 24, 1, true), beamMaterial(0xffd23a));
    beam.position.set(e.x, e.y + 20, e.z);
    zoneGroup(D).add(beam);
    const lines = [{ t: '👑 ESCAPE! 👑', c: '#ffe24a', s: '#3a2400', px: 70 }, { t: '+' + fmt(escapeWins(w)) + ' Wins', c: '#ffffff', s: '#3a2400', px: 46 }];
    if (w < WORLDS.length) lines.push({ t: '🔓 Unlocks World ' + (w + 1), c: css(themeOf(w + 1).neon), s: '#10102a', px: 40 });
    label(D, lines, 16, { x: e.x, y: e.y + 27, z: e.z }, 400);
    escapes.push({ w, D, ring, disc });
}

// ----- venom orbs along each stretch's best line: fly the tentacle's head through them -----
// One mesh per world: a camera-facing glowing quad per orb, bobbing (all in the vertex shader)
const orbTime = { value: 0 };
const ORB_COLORS = [[0x9aff3a, 0xf4ffd8], [0x3affc8, 0xe0fff6], [0xff5ad8, 0xffe8fa]];
let orbMat0 = null;
function orbMaterial(w) {
    if (!orbMat0) orbMat0 = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false, forceSinglePass: true,
        uniforms: { uTime: orbTime, uA: { value: new T.Color() }, uB: { value: new T.Color() } },
        vertexShader: /* glsl */`
            attribute vec2 aCorner; attribute float aOn; attribute float aSeed;
            uniform float uTime;
            varying vec2 vC; varying float vF; varying float vSeed;
            void main() {
                vec3 c = position + vec3(0.0, sin(uTime * 2.2 + aSeed * 6.283) * 0.45, 0.0);
                vec4 mv = modelViewMatrix * vec4(c, 1.0);
                float s = 2.3 * (1.0 + 0.1 * sin(uTime * 5.0 + aSeed * 20.0)) * aOn;
                mv.xy += aCorner * s;
                vC = aCorner; vSeed = aSeed;
                vF = 1.0 - smoothstep(160.0, 280.0, -mv.z);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            uniform float uTime; uniform vec3 uA; uniform vec3 uB;
            varying vec2 vC; varying float vF; varying float vSeed;
            ${HUE_GLSL}
            void main() {
                float r = length(vC);
                if (r > 1.0) discard;
                float hr = 0.7 * sin(uTime * 0.9 + vSeed * 6.2831853);
                vec3 cA = hueRot(uA, hr), cB = hueRot(uB, hr * 0.5);
                float core = 1.0 - smoothstep(0.26, 0.4, r);
                float halo = pow(1.0 - r, 2.2);
                float ring = 1.0 - smoothstep(0.0, 0.07, abs(r - 0.55 - 0.05 * sin(uTime * 4.0 + vSeed * 9.0)));
                vec3 col = mix(cB, cA, smoothstep(0.0, 0.36, r)) * core * 1.5 + cA * halo * 0.9 + cB * ring * 0.45;
                gl_FragColor = vec4(col * vF, 1.0);
            }`,
    });
    const m = orbMat0.clone();
    m.uniforms.uTime = orbTime;
    m.uniforms.uA.value.set(ORB_COLORS[w - 1][0]); m.uniforms.uB.value.set(ORB_COLORS[w - 1][1]);
    return m;
}
export const orbColor = (w) => ORB_COLORS[(w || 1) - 1][0];
const orbSlots = new Map();   // orb key -> { a: its aOn attribute, k: its quad }
function buildOrbs(w) {
    const list = ORBS.filter((o) => worldOfStage(o.i) === w);
    const n = list.length, pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), on = new Float32Array(n * 4).fill(1), seed = new Float32Array(n * 4), idx = [];
    const C4 = [-1, -1, 1, -1, 1, 1, -1, 1];
    list.forEach((o, k) => {
        for (let v = 0; v < 4; v++) {
            const q = k * 4 + v;
            pos[q * 3] = o.x; pos[q * 3 + 1] = o.y; pos[q * 3 + 2] = o.z;
            cor[q * 2] = C4[v * 2]; cor[q * 2 + 1] = C4[v * 2 + 1];
            seed[q] = (o.key * 0.618034) % 1;
        }
        idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new T.BufferAttribute(cor, 2));
    const a = new T.BufferAttribute(on, 1);
    a.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aOn', a);
    g.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
    g.setIndex(idx);
    const m = new T.Mesh(g, orbMaterial(w));
    m.frustumCulled = false; m.renderOrder = 5;
    zoneGroup(alwaysZone(w)).add(m);
    list.forEach((o, k) => orbSlots.set(o.key, { a, k }));
}
export function setOrb(key, on) {
    const s = orbSlots.get(key);
    if (!s) return;
    const v = on ? 1 : 0;
    if (s.a.array[s.k * 4] === v) return;
    s.a.array.fill(v, s.k * 4, s.k * 4 + 4);
    s.a.needsUpdate = true;
}
export function resetOrbs() { for (const key of orbSlots.keys()) setOrb(key, true); }

// =====================================================================================
// Per-frame world animation (before the player moves)
// =====================================================================================
let lodT = 0;
export function updateWorld(dt, t, stage, me) {
    const st = serverT();
    lavaTime.value = t;
    padTime.value = t;
    orbTime.value = t;
    const near = (z) => (z < 0 ? stage <= 1 : Math.abs(z - Math.max(0, stage ?? 0)) <= 2);
    for (const s of spinners) if (near(s.zone)) s.blades.rotation.z = spinnerAngle(s, st);
    for (const c of crushers) if (near(c.zone)) c.m.position.x = crusherX(c, st);
    for (const l of logs) if (near(l.zone)) l.arm.rotation.z = logAngle(l, st);
    for (const j of jaws) if (near(j.zone)) { const g = jawsGap(j, st); j.m[0].position.x = j.x0 - g - j.wd / 2; j.m[1].position.x = j.x0 + g + j.wd / 2; }
    for (const l of lasers) if (near(l.zone)) l.g.position.y = laserY(l, st);
    if (laserGlowM) laserGlowM.opacity = 0.7 + 0.25 * Math.sin(t * 31) * Math.sin(t * 7);
    for (const o of orbits) if (near(o.zone)) o.rk.rotation.z = orbitAngle(o, st);
    for (const b of boosts) if (near(b.zone)) b.disc.rotation.z = -t * 2.2;
    for (const g of geysers) {
        if (!near(g.zone)) continue;
        const gs = geyserState(g, st);
        const h = Math.max(0.01, gs.h);
        g.col.scale.set(1, h, 1); g.col.position.y = LAVA_Y + h / 2; g.col.visible = h > 0.2;
        g.glow.material.opacity = gs.on ? 0.95 : gs.warn ? 0.5 + 0.4 * Math.sin(t * 20) : 0.25;
        g.state = gs;
        if (gs.on !== g.was) { g.was = gs.on; if (gs.on && actions.geyser) actions.geyser(g); }
    }
    for (const p of padSpots) if (near(p.i)) p.arrow.position.y = p.y + 4.2 + Math.sin(t * 3 + p.x) * 0.5;
    // the big sign fades away as you come close (it would block the view while you fly at it)
    const sg = stageSigns[signsFor];
    if (sg) { const d = sg.position.distanceTo(camera.position); sg.material.opacity = Math.max(0, Math.min(1, (d - 20) / 18)); sg.visible = d > 20; }
    for (const e of escapes) if (near(e.D)) { e.ring.rotation.z = t * 0.4; e.disc.rotation.z = -t * 0.8; }
    for (const p of portals) p.disc.rotation.z = -t * 0.9;
    lodT -= dt;
    if (me && lodT <= 0) {
        lodT = 0.1;
        const w = Math.max(1, Math.min(3, Math.round(me.x / 2000) + 1));
        // far: from you; near: from the camera (a label right in front of the lens would fill the screen)
        const c = camera.position;
        for (const l of spriteLOD) { if (l.w !== w) continue; const d2 = (l.x - me.x) ** 2 + (l.z - me.z) ** 2 + ((l.y - me.y) * 0.6) ** 2, c2 = (l.x - c.x) ** 2 + (l.y - c.y) ** 2 + (l.z - c.z) ** 2; l.sp.visible = d2 < l.far2 && d2 > l.near2 && c2 > 70; }
    }
    hazardTick(t);
}

// =====================================================================================
// Solids by zone, for the tentacle's head (which flies far ahead of you)
// =====================================================================================
const byZone = new Map();
export function zoneSolids(z) { return byZone.get(z) || []; }
function indexSolids() {
    byZone.clear();
    for (const s of solids) { if (!byZone.has(s.zone)) byZone.set(s.zone, []); byZone.get(s.zone).push(s); }
}

// =====================================================================================
// Built in slices with a pause between them, so the page stays responsive and the server
// connection that runs alongside keeps moving. World 1 (with the lobby) is built while the game
// loads; World 2 and 3 the first time you go there.
// =====================================================================================
const built = new Set();
export const worldBuilt = (w) => built.has(w);
async function buildOne(w, pause) {
    setTheme(w);
    if (w === 1) buildLobby(); else buildHub(w);
    await pause();
    setTheme(w);
    buildCanyon(w);
    await pause();
    setTheme(w);
    buildStages(w);
    await pause();
    flushGeo();
    freezeStatic();
    indexSolids();
    built.add(w);
}
export async function buildWorld(pause) {
    pause = pause || (() => Promise.resolve());
    await buildOne(1, pause);
    cullZones(-1, 1);
    refreshLobby();
}
// The first visit to World 2 / 3: builds it, compiles its shaders and uploads its textures (while a
// loading card is up), so walking in never stutters
let chain = Promise.resolve();
const pending = {};
export function ensureWorld(w, renderer, pause) {
    if (built.has(w)) return Promise.resolve();
    pause = pause || (() => new Promise((r) => setTimeout(r, 0)));
    if (!pending[w]) pending[w] = chain = chain.then(async () => {
        if (built.has(w)) return;
        await buildOne(w, pause);
        refreshLobby();
        const groups = [...zoneGroups.entries()].filter(([z]) => zoneWorld.get(z) === w).map(([, g]) => g);
        for (const g of groups) {
            try { await renderer.compileAsync(g, camera, scene); } catch (e) { /* compiles on first use */ }
        }
        const texs = new Set();
        for (const g of groups) g.traverse((o) => {
            const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
            for (const m of ms) {
                if (m.map) texs.add(m.map);
                if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
            }
        });
        let n = 0;
        for (const t of texs) { renderer.initTexture(t); if (++n % 16 === 0) await pause(); }
        await pause();
        primeGroups(renderer, groups);
        culledFor = null;
    });
    return pending[w];
}
// Draws the groups once, culling off, into one pixel of the screen (a render target would need its
// own copies of every shader), so every vertex buffer is on the GPU and every bounding sphere worked
// out before you first see them; the next frame draws over that pixel
const vpTmp = new T.Vector4(), scTmp = new T.Vector4();
function primeGroups(renderer, groups) {
    const unculled = [], vis = groups.map((g) => g.visible);
    for (const g of groups) {
        g.visible = true; g.matrixWorldAutoUpdate = true;
        g.traverse((o) => {
            if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); }
        });
    }
    renderer.getViewport(vpTmp); renderer.getScissor(scTmp);
    const scissor = renderer.getScissorTest();
    renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1); renderer.setScissorTest(true);
    // (the shadow pass too: it draws the casters with their own depth shaders)
    renderer.shadowMap.needsUpdate = true;
    try { renderer.render(scene, camera); } catch (e) { /* uploads on first view instead */ }
    renderer.setViewport(vpTmp); renderer.setScissor(scTmp); renderer.setScissorTest(scissor);
    renderer.shadowMap.needsUpdate = true;
    for (const o of unculled) o.frustumCulled = true;
    groups.forEach((g, i) => { g.visible = vis[i]; g.matrixWorldAutoUpdate = vis[i]; });
}
// The look of where you are: the sky mood and the floating particles (embers, spores, stardust)
export function moodOf(stage, world) {
    const w = world || 1;
    if (w === 2) return stage < 23 ? { mood: 'jungle', amb: { color: 0xc8ff6a, dir: 0.6, cycle: true } } : { mood: 'jungle2', amb: { color: 0x9affb0, dir: 0.7, cycle: true } };
    if (w === 3) return stage < 38 ? { mood: 'void', amb: { color: 0xc8a8ff, dir: 0.35, cycle: true } } : { mood: 'void2', amb: { color: 0xffa8f0, dir: 0.35, cycle: true } };
    if (stage == null || stage < 0) return { mood: 'day', amb: { color: 0xffffff, dir: 0.5 } };
    if (stage < 5) return { mood: 'canyon', amb: { color: 0xffa040, dir: 1.6 } };
    if (stage < 10) return { mood: 'golden', amb: { color: 0xffb050, dir: 1.6 } };
    if (stage < 14) return { mood: 'sunset', amb: { color: 0xff8a5a, dir: 1.8 } };
    return { mood: 'escape', amb: { color: 0xffd070, dir: 1.6 } };
}

// Gets every shader and texture onto the GPU while the loading screen shows, without freezing the
// page: the shaders compile in the background (compileAsync), the depth shaders the sun's shadow
// pass draws with included, then the textures upload and a GPU fence says when they're done. The
// stand-ins made here are kept, so their shaders stay alive.
const SHADOW_SIDE = { [T.FrontSide]: T.BackSide, [T.BackSide]: T.FrontSide, [T.DoubleSide]: T.DoubleSide };
const warmKeep = [];
export async function warmUp(renderer, camera, pause) {
    const vis = [];
    scene.traverse((o) => { if (o !== scene && !o.visible) { vis.push(o); o.visible = true; } });
    try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
    if (renderer.shadowMap.enabled) {
        const kinds = new Map();
        scene.traverse((o) => {
            if (!o.isMesh || !o.castShadow) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                const side = m.shadowSide ?? SHADOW_SIDE[m.side];
                const key = [o.isSkinnedMesh, o.isInstancedMesh, !!(o.isInstancedMesh && o.instanceColor), !!m.map, side, m.alphaTest > 0].join();
                if (kinds.has(key)) continue;
                const d = new T.MeshDepthMaterial({ side, map: m.map, alphaMap: m.alphaMap, alphaTest: m.alphaTest });
                let p;
                if (o.isSkinnedMesh) { p = new T.SkinnedMesh(o.geometry, d); p.bind(o.skeleton, o.bindMatrix); }
                else if (o.isInstancedMesh) { p = new T.InstancedMesh(o.geometry, d, 1); if (o.instanceColor) p.setColorAt(0, new T.Color(1, 1, 1)); }
                else p = new T.Mesh(o.geometry, d);
                kinds.set(key, p);
            }
        });
        const stand = new T.Group();
        for (const p of kinds.values()) stand.add(p);
        const rt = new T.WebGLRenderTarget(1, 1);
        const prev = renderer.getRenderTarget(), fog = scene.fog;
        let ready = null;
        renderer.setRenderTarget(rt);
        scene.fog = null;
        try { ready = renderer.compileAsync(stand, camera, scene); } catch (e) { /* compiles on first use */ }
        scene.fog = fog;
        renderer.setRenderTarget(prev);
        if (ready) { try { await ready; } catch (e) { /* compiles on first use */ } }
        rt.dispose();
        warmKeep.push(stand);
        try { renderer.compile(new T.Group(), camera, scene); } catch (e) { /* next frame */ }
    }
    for (const o of vis) o.visible = false;
    const texs = new Set();
    scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
            for (const k of ['map', 'normalMap', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k]);
            if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
        }
    });
    let n = 0;
    for (const t of texs) {
        renderer.initTexture(t);
        if (++n % 16 === 0) await pause();
    }
    const gl = renderer.getContext();
    if (gl.fenceSync) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const t0 = performance.now();
        while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 15));
        gl.deleteSync(sync);
    }
    primeGroups(renderer, [...zoneGroups.values()]);
    culledFor = null;
    cullZones(-1, 1);
}
void CFG; void levelOf; void tickers; void symIcon; void N; void venomLight; void VENOM_GLSL; void C;
