// The venom tentacle: a chain of chunky black voxel shards (the reference's pixelated symbiote),
// writhing, with a glowing pulse in its symbiote's colour running down it, and a clawed head with
// white eyes at the tip.
//
// Its path is a list of points about one segment (2.5 studs) apart, kept in a tiny float texture.
// The geometry never changes: every segment's shards are placed along the path in the vertex shader
// (one draw call; while the tentacle moves only the small texture is re-uploaded, never a vertex
// buffer). The same class draws your own tentacle and other players'.
import { T, V3, scene } from './engine.js';
import { CFG, suitOf } from '../../shared/config.js';
import { venomLight, venomFrame, venomSurface, VENOM_GLSL } from './venomMaterial.js';

const MAXP = 320;          // path points the texture holds (a full-length tentacle needs 257)
const SEGS = MAXP - 1;
const SHARDS = 3;          // cubes per segment
const IDX_PER_SEG = SHARDS * 36;

// ----- the shared geometry: for every segment, a few randomly turned cubes around its axis -----
let geo = null;
function buildGeometry() {
    const box = new T.BoxGeometry(1, 1, 1);
    const bp = box.attributes.position, bn = box.attributes.normal, bi = box.index.array;
    const nv = SEGS * SHARDS * 24;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), along = new Float32Array(nv * 2);
    const idx = new Uint32Array(SEGS * IDX_PER_SEG);
    let s = 17;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const q = new T.Quaternion(), e = new T.Euler(), v = new V3(), n = new V3();
    let vi = 0, ii = 0;
    for (let seg = 0; seg < SEGS; seg++) {
        for (let c = 0; c < SHARDS; c++) {
            // a shard: a stretched cube, turned at random, nudged off the axis
            const sx = c === 0 ? 1.55 : 0.75 + rnd() * 0.6, sy = c === 0 ? 1.55 : 0.75 + rnd() * 0.6, sz = c === 0 ? 1.5 : 0.9 + rnd() * 0.7;
            e.set((rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, rnd() * Math.PI);
            q.setFromEuler(e);
            const ox = c === 0 ? 0 : (rnd() - 0.5) * 1.3, oy = c === 0 ? 0 : (rnd() - 0.5) * 1.3;
            const fc = c === 0 ? 0.5 : rnd();
            const glow = c > 0 && rnd() < 0.45 ? 1 : 0;
            const base = vi;
            for (let k = 0; k < 24; k++) {
                v.set(bp.getX(k) * sx, bp.getY(k) * sy, bp.getZ(k) * sz).applyQuaternion(q);
                n.set(bn.getX(k), bn.getY(k), bn.getZ(k)).applyQuaternion(q);
                pos[vi * 3] = v.x + ox; pos[vi * 3 + 1] = v.y + oy; pos[vi * 3 + 2] = v.z;
                nrm[vi * 3] = n.x; nrm[vi * 3 + 1] = n.y; nrm[vi * 3 + 2] = n.z;
                along[vi * 2] = seg + fc; along[vi * 2 + 1] = glow * (0.5 + rnd() * 0.5) + c * 0.01;
                vi++;
            }
            for (let k = 0; k < 36; k++) idx[ii++] = base + bi[k];
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    g.setAttribute('aAlong', new T.BufferAttribute(along, 2));
    g.setIndex(new T.BufferAttribute(idx, 1));
    g.boundingSphere = new T.Sphere(new V3(), 1e6);
    box.dispose();
    return g;
}

const fogU = () => T.UniformsUtils.clone(T.UniformsLib.fog);
const shared = venomLight;
const baseMat = new T.ShaderMaterial({
    fog: true,
    uniforms: {
        ...fogU(), ...shared,
        uPath: { value: null }, uCount: { value: 0 }, uStart: { value: 0 }, uThick: { value: 1 },
        uBody: { value: new T.Color(0x121218) }, uGlow: { value: new T.Color(0xffffff) }, uGlow2: { value: new T.Color(0xffffff) }, uRainbow: { value: 0 }, uStars: { value: 0 }, uFlash: { value: 0 },
    },
    vertexShader: /* glsl */`
        uniform sampler2D uPath; uniform float uCount; uniform float uStart; uniform float uThick; uniform float uTime;
        attribute vec2 aAlong;
        varying vec3 vN; varying vec3 vW; varying float vI; varying float vGlow;
        #include <fog_pars_vertex>
        vec3 P(float i) { return texelFetch(uPath, ivec2(int(clamp(i, 0.0, ${MAXP - 1}.0)), 0), 0).xyz; }
        void main() {
            float seg = floor(aAlong.x), f = fract(aAlong.x);
            vGlow = aAlong.y; vI = aAlong.x;
            if (seg >= uCount - 1.0 || seg + 1.0 < uStart) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
            vec3 a = P(seg), b = P(seg + 1.0);
            vec3 t = b - a; float L = length(t); t = L > 1e-4 ? t / L : vec3(0.0, 0.0, 1.0);
            vec3 ref = abs(t.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
            vec3 side = normalize(cross(ref, t)), up = cross(t, side);
            // thicker at the root, a touch thinner near the claw; grows in at the very start
            float fromHead = uCount - 1.0 - aAlong.x;
            float k = uThick * (0.82 + 0.3 * smoothstep(40.0, 0.0, aAlong.x - uStart)) * smoothstep(-0.5, 2.5, fromHead) * smoothstep(-0.3, 1.2, aAlong.x - uStart);
            // it writhes
            float wr = min(1.0, fromHead / 4.0);
            vec3 c = mix(a, b, f) + (side * sin(uTime * 5.5 + aAlong.x * 0.55) * 0.32 + up * cos(uTime * 4.3 + aAlong.x * 0.7) * 0.26) * wr;
            vec3 w = c + (side * position.x + up * position.y + t * position.z * 0.62) * k;
            vN = normalize(side * normal.x + up * normal.y + t * normal.z);
            vW = w;
            vec4 mvPosition = viewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
        }`,
    fragmentShader: /* glsl */`
        uniform vec3 uSunDir; uniform vec3 uSunC; uniform vec3 uSky; uniform vec3 uGround; uniform float uAmb; uniform float uTime;
        uniform vec3 uBody; uniform vec3 uGlow; uniform vec3 uGlow2; uniform float uRainbow; uniform float uStars; uniform float uFlash; uniform float uCount;
        varying vec3 vN; varying vec3 vW; varying float vI; varying float vGlow;
        #include <fog_pars_fragment>
        ${VENOM_GLSL}
        void main() {
            vec3 n = normalize(vN);
            vec3 light = mix(uGround, uSky, n.y * 0.5 + 0.5) * 0.55 + uSunC * max(0.0, dot(n, uSunDir)) * 0.75 + vec3(uAmb);
            vec3 col = uBody * light;
            // the neon gradient runs down its length and drifts toward the head
            float k = vI * 0.035 - uTime * 0.4;
            vec3 g = vnGlow(uGlow, uGlow2, uRainbow, k);
            // a neon rim shimmering between the two glow colours (light wrapping round the shards)
            vec3 v = normalize(cameraPosition - vW);
            float rim = pow(1.0 - max(0.0, dot(n, v)), 2.4);
            col += vnGlow(uGlow, uGlow2, uRainbow, k + rim * 1.5) * rim * 0.75;
            // slick and glossy, like wet symbiote (a cheap sun highlight, no reflections)
            vec3 hv = normalize(uSunDir + v);
            col += uSunC * pow(max(0.0, dot(n, hv)), 44.0) * 0.7;
            // glow pulses racing from you to the head
            float pulse = smoothstep(0.7, 1.0, fract(vI * 0.06 - uTime * 1.4));
            col += g * vGlow * (0.5 + pulse * 1.4) + g * pulse * 0.22;
            if (uStars > 0.5) { float st = step(0.985, fract(sin(dot(floor(vW * 3.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453)); col += st * (0.6 + 0.4 * sin(uTime * 6.0 + vI)) * vec3(1.0, 0.95, 1.0); }
            col += g * uFlash * 0.8;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
        }`,
});

// The clawed head: a fist of shards, three claws, two angular white eyes (built once, shared)
let headGeo = null, eyeGeo = null;
function buildHead() {
    const parts = [], eyes = [];
    const cube = (sx, sy, sz, x, y, z, rx, ry, rz, list) => {
        const g = new T.BoxGeometry(sx, sy, sz);
        g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)));
        g.translate(x, y, z);
        (list || parts).push(g);
    };
    cube(2.6, 2.3, 2.6, 0, 0, 0, 0.2, 0.3, 0.1);
    cube(2.1, 2.0, 2.0, 0.3, 0.5, 0.9, -0.3, -0.2, 0.2);
    cube(1.6, 1.4, 1.6, -0.6, -0.5, 1.2, 0.4, 0.5, 0.3);
    // claws reaching forward (+z)
    for (const [a, l] of [[0, 2.4], [2.1, 2.0], [4.2, 2.2]]) {
        const cx = Math.cos(a) * 0.95, cy = Math.sin(a) * 0.95;
        cube(0.5, 0.5, l, cx, cy, 1.6 + l / 2, -cy * 0.45, cx * 0.45, 0);
        cube(0.38, 0.38, 1.1, cx * 1.25, cy * 1.25, 2.4 + l, -cy * 0.9, cx * 0.9, 0);
    }
    // the eyes: Venom's white angular eyes
    const eye = (sgn) => {
        const g = new T.BufferGeometry();
        const p = [0, 0, 0, 0.95 * sgn, 0.55, 0, 0.35 * sgn, -0.55, 0];
        g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
        g.computeVertexNormals();
        g.translate(0.32 * sgn, 0.55, 1.36);
        eyes.push(g);
    };
    eye(1); eye(-1);
    const merge = (list) => { const m = mergeList(list); list.forEach((g) => g.dispose()); return m; };
    headGeo = merge(parts);
    eyeGeo = merge(eyes);
}
function mergeList(list) {
    let n = 0;
    for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    let o = 0;
    for (const g0 of list) {
        const g = g0.index ? g0.toNonIndexed() : g0;
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
        if (g !== g0) g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    return out;
}
const eyeMat = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });

// Refreshes the lighting every venom surface shares (once per frame)
export const tentacleFrame = venomFrame;

const tmp = new V3(), tmpQ = new T.Quaternion(), FWD = new V3(0, 0, 1);
export class Tentacle {
    constructor() {
        if (!geo) { geo = buildGeometry(); buildHead(); }
        this.data = new Float32Array(MAXP * 4);
        this.tex = new T.DataTexture(this.data, MAXP, 1, T.RGBAFormat, T.FloatType);
        this.tex.minFilter = this.tex.magFilter = T.NearestFilter;
        this.tex.needsUpdate = true;
        this.mat = baseMat.clone();
        for (const k of Object.keys(shared)) this.mat.uniforms[k] = shared[k];
        this.mat.uniforms.uPath.value = this.tex;
        this.mesh = new T.Mesh(geo, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = false;
        // every tentacle shares one geometry: each one draws only its own segments
        this.drawStart = 0; this.drawCount = 0;
        this.mesh.onBeforeRender = () => geo.setDrawRange(this.drawStart, this.drawCount);
        this.mat.uniforms.uThick.value = 1.15;
        this.head = new T.Group();
        this.headBody = new T.Mesh(headGeo, venomSurface('', 0));
        this.headBody.castShadow = this.headBody.receiveShadow = true;
        this.head.add(this.headBody, new T.Mesh(eyeGeo, eyeMat));
        this.head.visible = false;
        scene.add(this.mesh, this.head);
        this.pts = [];            // fixed points (V3), one per segment
        this.tip = new V3();      // the head, where it is now
        this.dir = new V3(0, 0, 1);
        this.start = 0;
        this.dirty = false;
        this.flash = 0;
        this.suit = null;
        this.setSuit('');
    }
    setSuit(id) {
        if (this.suit === id) return;
        this.suit = id;
        const s = suitOf(id), u = this.mat.uniforms;
        u.uBody.value.set(s.body); u.uGlow.value.set(s.glow); u.uGlow2.value.set(s.glow2 ?? s.glow);
        u.uRainbow.value = s.rainbow ? 1 : 0; u.uStars.value = s.stars ? 1 : 0;
        this.headBody.material = venomSurface(id, 0);
    }
    get count() { return this.pts.length + 1; }
    // Length so far, in studs
    length() { return Math.max(0, this.pts.length - 1) * CFG.segLen + (this.pts.length ? this.tip.distanceTo(this.pts[this.pts.length - 1]) : 0); }
    reset(origin, dir) {
        this.pts.length = 0;
        this.pts.push(origin.clone());
        this.tip.copy(origin);
        if (dir) this.dir.copy(dir);
        this.start = 0;
        this.dirty = true;
        this.mesh.visible = true; this.head.visible = true;
    }
    // Moves the head; a new fixed point every segment
    moveTip(p) {
        this.tip.copy(p);
        let last = this.pts[this.pts.length - 1];
        while (this.pts.length < MAXP - 1 && last.distanceTo(this.tip) >= CFG.segLen) {
            const np = last.clone().add(tmp.subVectors(this.tip, last).setLength(CFG.segLen));
            this.pts.push(np);
            last = np;
        }
        this.dirty = true;
    }
    // While you zip along it: everything behind `k` segments is reeled in
    setStart(k) { this.start = k; this.dirty = true; }
    hide() { this.mesh.visible = false; this.head.visible = false; this.pts.length = 0; }
    get visible() { return this.mesh.visible; }
    // A point `s` studs along the path (and the direction there)
    pointAt(s, out, dirOut) {
        const n = this.pts.length;
        if (!n) return out.copy(this.tip);
        const i = Math.floor(s / CFG.segLen);
        if (i >= n - 1) {
            const a = this.pts[n - 1], rem = s - (n - 1) * CFG.segLen, L = a.distanceTo(this.tip) || 1;
            out.lerpVectors(a, this.tip, Math.min(1, rem / L));
            if (dirOut) dirOut.subVectors(this.tip, a).normalize();
            return out;
        }
        const a = this.pts[i], b = this.pts[i + 1];
        out.lerpVectors(a, b, (s - i * CFG.segLen) / CFG.segLen);
        if (dirOut) dirOut.subVectors(b, a).normalize();
        return out;
    }
    update(dt) {
        if (!this.mesh.visible) return;
        if (this.dirty) {
            this.dirty = false;
            const d = this.data, n = this.pts.length;
            for (let i = 0; i < n; i++) { const p = this.pts[i]; d[i * 4] = p.x; d[i * 4 + 1] = p.y; d[i * 4 + 2] = p.z; }
            d[n * 4] = this.tip.x; d[n * 4 + 1] = this.tip.y; d[n * 4 + 2] = this.tip.z;
            this.tex.needsUpdate = true;
            const u = this.mat.uniforms;
            u.uCount.value = n + 1; u.uStart.value = this.start;
            const s0 = Math.max(0, Math.floor(this.start) - 1);
            this.drawStart = s0 * IDX_PER_SEG; this.drawCount = Math.max(0, n - s0) * IDX_PER_SEG;
        }
        this.flash = Math.max(0, this.flash - dt * 3);
        this.mat.uniforms.uFlash.value = this.flash;
        // the head looks along the way it's going
        this.head.position.copy(this.tip);
        if (this.pts.length) {
            const a = this.pts[this.pts.length - 1];
            if (a.distanceToSquared(this.tip) > 0.04) this.dir.subVectors(this.tip, a).normalize();
        }
        tmpQ.setFromUnitVectors(FWD, this.dir);
        this.head.quaternion.slerp(tmpQ, Math.min(1, dt * 14));
        const k = 1 + Math.sin(performance.now() / 90) * 0.04;
        this.head.scale.setScalar(k * (this.mat.uniforms.uThick.value));
    }
    dispose() {
        scene.remove(this.mesh, this.head);
        this.tex.dispose(); this.mat.dispose();
    }
}
export const TENTACLE = { MAXP, SEGS };
