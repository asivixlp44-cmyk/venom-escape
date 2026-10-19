// The symbiote: what it looks like on every character, on the Win Shop pedestals and in the HUD.
//
// On a character: voxel shards over the shoulders, chest and back that grow with your level, back
// tendrils that wave, and the avatar itself darkening into the suit's colour. When you release your
// venom it bursts out into the big "monster form" (a hulking shell of shards with Venom's white eyes)
// until you land. All shards are a few merged meshes per tier, shared by everyone wearing that tier.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, V3 } from './engine.js';
import { venomSurface, outfitUniforms, setOutfitSuit, venomizeTree } from './venomMaterial.js';
import { suitOf, rngFrom } from '../../shared/config.js';

// ----- shard geometry helpers -----
function shard(list, sx, sy, sz, x, y, z, rx, ry, rz) {
    const g = new T.BoxGeometry(sx, sy, sz);
    if (rx || ry || rz) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)));
    g.translate(x, y, z);
    list.push(g);
}
function merged(list) {
    if (!list.length) return new T.BufferGeometry();
    const m = mergeGeometries(list);
    list.forEach((g) => g.dispose());
    return m;
}
// a spike pointing along (dx, dy, dz) from (x, y, z): a long thin shard and a thinner tip
function spike(list, x, y, z, dx, dy, dz, len, w) {
    const d = new V3(dx, dy, dz).normalize();
    const q = new T.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d);
    const e = new T.Euler().setFromQuaternion(q);
    const g1 = new T.BoxGeometry(w, len * 0.6, w), g2 = new T.BoxGeometry(w * 0.55, len * 0.5, w * 0.55);
    g1.translate(0, len * 0.3, 0); g2.translate(0, len * 0.75, 0);
    for (const g of [g1, g2]) { g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(e)); g.translate(x, y, z); list.push(g); }
}
// eyes: Venom's white angular eyes, flat triangles on a face looking down +z
function eyeGeometry(cx, cy, cz, size) {
    const g = new T.BufferGeometry();
    const p = [];
    for (const s of [1, -1]) {
        const ox = cx + 0.2 * size * s;
        p.push(ox, cy, cz, ox + 0.62 * size * s, cy + 0.36 * size, cz, ox + 0.22 * size * s, cy - 0.38 * size, cz);
    }
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
}

// ----- the suit, by tier (level 1-4, 5-11, 12-24, 25-44, 45+) -----
export const suitTier = (level) => (level >= 45 ? 4 : level >= 25 ? 3 : level >= 12 ? 2 : level >= 5 ? 1 : 0);
const tierGeo = [];
function buildTier(t) {
    const body = [], glow = [], r = rngFrom(31 + t * 7);
    // shoulder pads with spikes
    for (const sx of [-1, 1]) {
        shard(body, 1.25, 0.55, 1.25, sx * 1.5, 4.0, 0, 0, 0, sx * 0.15);
        const n = 1 + t;
        for (let k = 0; k < n; k++) spike(body, sx * (1.3 + r() * 0.5), 4.15, (r() - 0.5) * 0.8, sx * (0.6 + r()), 1 + r() * 0.6, (r() - 0.5) * 0.6, 0.7 + t * 0.32 + r() * 0.3, 0.32 + t * 0.03);
        if (t >= 1) shard(glow, 0.14, 0.14, 1.0, sx * 1.5, 4.3, 0, 0, 0, 0);
    }
    // a chest plate: the spider emblem's legs in the glow colour
    if (t >= 1) {
        shard(body, 1.8, 1.4, 0.24, 0, 3.4, 0.56, 0, 0, 0);
        for (const sx of [-1, 1]) for (const k of [0, 1]) shard(glow, 0.13, 0.85, 0.06, sx * (0.32 + k * 0.28), 3.4 + (k ? -0.1 : 0.15), 0.7, 0, 0, sx * (0.8 + k * 0.5));
        shard(glow, 0.3, 0.42, 0.07, 0, 3.45, 0.7, 0, 0, 0);
    }
    // back spikes
    const nb = [1, 3, 5, 7, 9][t];
    for (let k = 0; k < nb; k++) {
        const y = 2.4 + r() * 2.0, x = (r() - 0.5) * 1.6;
        spike(body, x, y, -0.55, x * 0.3, 0.4 + r() * 0.5, -1, 0.8 + t * 0.35 + r() * 0.5, 0.36);
    }
    // a crest over the head
    if (t >= 2) for (let k = 0; k < t; k++) spike(body, (k - (t - 1) / 2) * 0.35, 5.2, -0.2, (k - (t - 1) / 2) * 0.4, 1, -0.5, 0.6 + t * 0.2, 0.28);
    // horns at the top tier
    if (t >= 4) for (const sx of [-1, 1]) spike(body, sx * 0.45, 5.1, 0.1, sx * 0.8, 1, 0.2, 1.4, 0.3);
    return { body: merged(body), glow: merged(glow) };
}
const suitTierGeo = (t) => tierGeo[t] || (tierGeo[t] = buildTier(t));

// ----- back tendrils: a few cubes in a row, each waving from its root -----
let tendrilGeo = null;
function tendrilGeometry() {
    if (tendrilGeo) return tendrilGeo;
    const list = [];
    for (let k = 0; k < 5; k++) { const s = 0.5 - k * 0.07; shard(list, s, s, 0.62, 0, 0, -0.3 - k * 0.52, 0.2 * k, 0.3 * k, 0); }
    tendrilGeo = merged(list);
    return tendrilGeo;
}
const TENDRILS = [[-0.5, 3.6, 0.6], [0.5, 3.6, -0.6], [-0.4, 2.8, 1.1], [0.4, 2.8, -1.1], [0, 4.2, 0], [0, 2.4, 0]];
const tendrilCount = [1, 2, 2, 4, 6];

// ----- the monster form: a hulking shell of shards round the whole body, with the eyes -----
let monsterGeo = null;
function buildMonster() {
    const body = [], glow = [], r = rngFrom(77);
    // torso shell
    for (let k = 0; k < 26; k++) {
        const a = r() * Math.PI * 2, y = 1.9 + r() * 2.6, rad = 1.05 + r() * 0.35;
        shard(body, 0.7 + r() * 0.6, 0.7 + r() * 0.7, 0.7 + r() * 0.6, Math.cos(a) * rad * 1.15, y, Math.sin(a) * rad * 0.75, r(), r(), r());
    }
    // big shoulders and arms of shards
    for (const sx of [-1, 1]) {
        shard(body, 1.6, 1.1, 1.5, sx * 1.75, 4.05, 0, 0.2, 0.3, sx * 0.3);
        for (let k = 0; k < 4; k++) shard(body, 0.9, 0.9, 0.9, sx * (1.85 + r() * 0.3), 3.3 - k * 0.55, (r() - 0.5) * 0.4, r(), r(), r());
        for (let k = 0; k < 3; k++) spike(body, sx * 1.8, 4.4, (r() - 0.5) * 0.8, sx * (0.7 + r()), 1, (r() - 0.5), 1.2 + r() * 0.6, 0.38);
    }
    // the head: a bigger shell over it, a wide jaw
    shard(body, 1.75, 1.55, 1.6, 0, 4.85, 0.05, 0, 0, 0);
    shard(body, 1.5, 0.5, 1.2, 0, 4.15, 0.35, 0.25, 0, 0);
    for (let k = 0; k < 7; k++) shard(body, 0.6, 0.6, 0.6, (r() - 0.5) * 1.6, 5.4 + r() * 0.4, (r() - 0.5) * 1.2, r(), r(), r());
    // teeth: a row of little white points in the jaw (glow colour = white for most suits)
    for (let k = 0; k < 6; k++) shard(glow, 0.12, 0.28, 0.08, -0.5 + k * 0.2, 4.32, 0.97, 0, 0, k % 2 ? 0.3 : -0.3);
    // spikes all over the back
    for (let k = 0; k < 10; k++) { const x = (r() - 0.5) * 2; spike(body, x, 2.2 + r() * 2.6, -0.7, x * 0.4, 0.5 + r() * 0.6, -1, 1.1 + r() * 0.8, 0.4); }
    monsterGeo = { body: merged(body), glow: merged(glow), eyes: eyeGeometry(0, 5.0, 0.87, 0.95) };
    return monsterGeo;
}

const eyeMat = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });

// A suit for one character; add `group` to the character's body and give it the character (setRoot).
// form: 0 normal .. 1 the monster. The venom also spreads over the character's own outfit
// (setAvatar / setBlocky): from a patch on the chest at level 1 to nearly all of you, and all of
// you while it's released, with a glowing edge where it meets your clothes.
export function makeSuit() {
    const group = new T.Group();
    const U = outfitUniforms();
    const restBody = new T.Mesh(undefined, venomSurface('', 0)), restGlow = new T.Mesh(undefined, venomSurface('', 1));
    // every shadow caster also receives (a caster that does not makes three re-pick shaders every frame)
    restBody.castShadow = restBody.receiveShadow = true;
    group.add(restBody, restGlow);
    const tendrils = TENDRILS.map(([x, y, a]) => {
        const root = new T.Group(); root.position.set(x * 0.9, y, -0.55); root.userData.a = a;
        const m = new T.Mesh(tendrilGeometry(), venomSurface('', 0)); m.castShadow = m.receiveShadow = true; root.add(m);
        group.add(root);
        return root;
    });
    const mg = monsterGeo || buildMonster();
    const monster = new T.Group();
    const mBody = new T.Mesh(mg.body, venomSurface('', 0)), mGlow = new T.Mesh(mg.glow, venomSurface('', 1)), mEyes = new T.Mesh(mg.eyes, eyeMat);
    mBody.castShadow = mBody.receiveShadow = true;
    monster.add(mBody, mGlow, mEyes);
    monster.visible = false;
    group.add(monster);
    let suitId = null, tier = -1, form = 0, formWant = 0, cover = 0.2, coverWant = 0.3, root = null;
    return {
        group, U,
        setRoot(r) { root = r; },
        setSuit(id) {
            if (id === suitId) return;
            suitId = id;
            const bm = venomSurface(id, 0), gm = venomSurface(id, 1);
            restBody.material = bm; restGlow.material = gm; mBody.material = bm; mGlow.material = gm;
            for (const t of tendrils) t.children[0].material = bm;
            setOutfitSuit(U, id);
        },
        setLevel(level) {
            const t = suitTier(level);
            if (t !== tier) {
                tier = t;
                const g = suitTierGeo(t);
                restBody.geometry = g.body; restGlow.geometry = g.glow;
                tendrils.forEach((r, k) => { r.visible = k < tendrilCount[t]; r.scale.setScalar(0.8 + t * 0.18); });
            }
            // the venom covers more of your outfit as you level up
            coverWant = Math.min(0.95, 0.42 + level / 48);
        },
        // a Bloxity avatar's own materials (one set per avatar) or the blocky body's (copied first: they're shared)
        setAvatar(avRoot) { if (avRoot) venomizeTree(avRoot, U); },
        setBlocky(body) { venomizeTree(body, U, { clone: true, skip: group }); },
        setForm(on) { formWant = on ? 1 : 0; },
        get form() { return form; },
        update(dt, t) {
            form += (formWant - form) * Math.min(1, dt * (formWant ? 10 : 4));
            const show = form > 0.02;
            monster.visible = show;
            if (show) {
                const pop = formWant ? 1 + Math.sin(Math.min(1, form) * Math.PI) * 0.15 : 1;
                monster.scale.setScalar(form * pop);
                monster.position.y = (1 - form) * 2.5;
            }
            restBody.visible = restGlow.visible = form < 0.9;
            for (let k = 0; k < tendrils.length; k++) {
                const r = tendrils[k];
                if (!r.visible) continue;
                const a = r.userData.a, w = t * 3.2 + k * 1.7;
                r.rotation.set(-0.5 + Math.sin(w) * 0.35 - form * 0.4, a + Math.sin(w * 0.7) * 0.4, Math.cos(w * 0.9) * 0.3);
                r.scale.z = (0.8 + tier * 0.18) * (1 + form * 0.8);
            }
            // released: it sweeps over all of you (the glowing edge racing across your clothes)
            const want = Math.max(coverWant, form * 1.45);
            cover += (want - cover) * Math.min(1, dt * (want > cover ? 4 : 1.6));
            U.uVCover.value = cover;
            if (root) { U.uVRoot.value.copy(root.position); U.uVYaw.value = root.rotation.y; }
        },
    };
}

// ----- a statue for the Win Shop: a twisted column of venom rising off the pedestal, claws on top,
// its colours baked in: the body warming into the glow colour toward the top, the glowing shards
// running through the neon gradient -----
const statueBodyMat = new T.MeshLambertMaterial({ vertexColors: true });
const statueGlowMat = new T.MeshBasicMaterial({ vertexColors: true });
const statueGeo = new Map();
const cA = new T.Color(), cB = new T.Color(), cC = new T.Color();
function paintBy(g, fn) {
    const p = g.attributes.position, a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), cC); a[i * 3] = cC.r; a[i * 3 + 1] = cC.g; a[i * 3 + 2] = cC.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
}
export function statueGeometry(i, sym) {
    if (statueGeo.has(i)) return statueGeo.get(i);
    const body = [], glow = [], r = rngFrom(101 + i * 13);
    const H = 6.5, turns = 1.6 + r() * 0.8;
    for (let k = 0; k < 26; k++) {
        const f = k / 25, a = f * turns * Math.PI * 2, rad = 0.55 + Math.sin(f * Math.PI) * 0.8;
        const s = 1.05 - f * 0.45;
        shard(body, s, s, s, Math.cos(a) * rad, 0.6 + f * H, Math.sin(a) * rad, r(), r(), r());
        if (k % 2 === 1) shard(glow, s * 0.32, s * 0.32, s * 0.9, Math.cos(a) * (rad + s * 0.45), 0.6 + f * H, Math.sin(a) * (rad + s * 0.45), r(), r(), r());
        if (k % 4 === 2) spike(body, Math.cos(a) * rad, 0.6 + f * H, Math.sin(a) * rad, Math.cos(a), 0.4, Math.sin(a), 0.9 + r() * 0.6, 0.26);
    }
    // the head on top with claws reaching up
    shard(body, 1.5, 1.3, 1.4, 0, H + 1.1, 0, 0.2, 0.4, 0);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; spike(body, Math.cos(a) * 0.6, H + 1.4, Math.sin(a) * 0.6, Math.cos(a), 1.3, Math.sin(a), 1.6 + r() * 0.7, 0.3); }
    const s = suitOf(sym.id), top = H + 3;
    const rainbow = (y, out) => out.setHSL(((y / top) * 0.8 + 0.9) % 1, 0.95, 0.6);
    const b = paintBy(merged(body), (x, y, z, out) => {
        const k = Math.max(0, Math.min(1, y / top)) ** 2.2;
        out.set(s.body).multiplyScalar(1.25);
        if (s.rainbow) rainbow(y, cA); else cA.set(s.glow);
        out.lerp(cA, k * 0.55);
    });
    const gl = paintBy(merged(glow), (x, y, z, out) => {
        if (s.rainbow) return rainbow(y, out).multiplyScalar(1.15);
        cA.set(s.glow); cB.set(s.glow2 ?? s.glow);
        out.copy(cA).lerp(cB, Math.max(0, Math.min(1, y / top))).multiplyScalar(1.15);
    });
    const g = { body: b, glow: gl, eyes: eyeGeometry(0, H + 1.2, 0.71, 0.7) };
    statueGeo.set(i, g);
    return g;
}
export function statueMeshes(i, sym) {
    const g = statueGeometry(i, sym);
    const grp = new T.Group();
    const b = new T.Mesh(g.body, statueBodyMat); b.castShadow = b.receiveShadow = true;
    grp.add(b, new T.Mesh(g.glow, statueGlowMat), new T.Mesh(g.eyes, eyeMat));
    return grp;
}

// ----- HUD icons: a venom face in the suit's colours (a glossy head, a neon rim, glowing eyes) -----
const icons = new Map();
const css = (h) => '#' + (h >>> 0).toString(16).padStart(6, '0');
export function symIcon(id) {
    if (icons.has(id)) return icons.get(id);
    const s = suitOf(id), N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    x.translate(N / 2, N / 2 + 4);
    const g1 = s.rainbow ? '#ff5ad8' : css(s.glow), g2 = s.rainbow ? '#3af0ff' : css(s.glow2 ?? s.glow);
    const blob = () => {
        x.beginPath();
        for (let k = 0; k <= 18; k++) { const a = k / 18 * Math.PI * 2, rr = (k % 3 === 0 ? 50 : 42) + (k % 2 ? 2 : 0); x.lineTo(Math.cos(a) * rr * 0.92, Math.sin(a) * rr); }
        x.closePath();
    };
    // a neon outline in the gradient, then the glossy head
    const rim = x.createLinearGradient(-50, -50, 50, 50);
    if (s.rainbow) ['#ff3c5a', '#ffb51c', '#46ec50', '#28c8ff', '#8a5aff'].forEach((cc, k, a) => rim.addColorStop(k / (a.length - 1), cc));
    else { rim.addColorStop(0, g1); rim.addColorStop(1, g2); }
    x.lineJoin = 'round';
    blob(); x.lineWidth = 9; x.strokeStyle = rim; x.shadowColor = g1; x.shadowBlur = 12; x.stroke(); x.shadowBlur = 0;
    const body = x.createRadialGradient(-14, -22, 4, 0, 0, 56);
    body.addColorStop(0, css(new T.Color(s.body).lerp(new T.Color(s.glow), 0.35).getHex()));
    body.addColorStop(0.55, css(s.body));
    body.addColorStop(1, '#05050a');
    blob(); x.fillStyle = body; x.fill();
    if (s.stars) { x.fillStyle = '#ffffff'; for (let k = 0; k < 9; k++) { x.globalAlpha = 0.5 + (k % 3) * 0.2; x.fillRect(Math.cos(k * 2.4) * 30, Math.sin(k * 1.7) * 30, 2.5, 2.5); } x.globalAlpha = 1; }
    // glowing veins
    x.strokeStyle = g2; x.lineWidth = 2.5; x.globalAlpha = 0.85;
    x.beginPath(); x.moveTo(-36, 18); x.quadraticCurveTo(-20, 4, -28, -18); x.moveTo(34, 20); x.quadraticCurveTo(22, 2, 30, -20); x.stroke();
    x.globalAlpha = 1;
    // shine
    x.fillStyle = 'rgba(255,255,255,0.2)'; x.beginPath(); x.ellipse(-14, -24, 18, 9, -0.5, 0, Math.PI * 2); x.fill();
    // the eyes
    x.fillStyle = s.body === 0xeef0f6 || s.body === 0xd8dce8 ? '#111118' : '#ffffff';
    x.shadowColor = g1; x.shadowBlur = 14;
    for (const sg of [1, -1]) { x.beginPath(); x.moveTo(sg * 6, -2); x.lineTo(sg * 38, -20); x.lineTo(sg * 18, 18); x.closePath(); x.fill(); }
    x.shadowBlur = 0;
    // a grin of teeth
    x.strokeStyle = g2; x.lineWidth = 3;
    x.beginPath(); for (let k = 0; k <= 8; k++) x.lineTo(-24 + k * 6, 30 + (k % 2 ? -5 : 3)); x.stroke();
    const url = c.toDataURL('image/png');
    icons.set(id, url);
    return url;
}
