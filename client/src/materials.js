// Textures and special materials, all drawn in code (no image files): the lava, the glowing pads,
// the venom swirls over the launch pads and statues, the hazard stripes, the chevron guide ribbon.
// Everything here is unlit (MeshBasic or a small ShaderMaterial) or matte Lambert: no reflections.
import { T, renderer, texFrom, matte, NEON_BOOST } from './engine.js';

const cache = new Map();
const once = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
const maxAniso = () => Math.min(8, renderer.capabilities.getMaxAnisotropy());

// =====================================================================================
// Lava: Roblox's cracked lava, richer. A tiling Voronoi texture baked once (bright yellow cells,
// orange-red cracks between them; R = cell brightness, G = crack, B = random per cell), then two
// layers of it scrolling against each other in a tiny shader, pulsing and glowing. Unlit, fogged.
// =====================================================================================
export const lavaTex = () => once('lavatex', () => {
    const N = 256, CELLS = 7, c = canvas(N), x = c.getContext('2d'), img = x.createImageData(N, N);
    let s = 9;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // one jittered point per grid cell: the nearest two are always in the 3 x 3 cells around a pixel
    const px0 = new Float32Array(CELLS * CELLS), py0 = new Float32Array(CELLS * CELLS), ids = new Float32Array(CELLS * CELLS);
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) { const k = j * CELLS + i; px0[k] = i + 0.15 + rnd() * 0.7; py0[k] = j + 0.15 + rnd() * 0.7; ids[k] = rnd(); }
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const u = px / N * CELLS, v = py / N * CELLS, ci = Math.floor(u), cj = Math.floor(v);
        let d1 = 9, d2 = 9, id = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const gi = ci + ox, gj = cj + oy, k = ((gj + CELLS) % CELLS) * CELLS + ((gi + CELLS) % CELLS);
            const dx = px0[k] + (gi - ((gi + CELLS) % CELLS)) - u, dy = py0[k] + (gj - ((gj + CELLS) % CELLS)) - v;
            const d = Math.sqrt(dx * dx + dy * dy) / CELLS;
            if (d < d1) { d2 = d1; d1 = d; id = ids[k]; } else if (d < d2) d2 = d;
        }
        const edge = (d2 - d1) * CELLS;              // 0 on a crack
        const crack = Math.max(0, 1 - edge / 0.22);
        const k = (py * N + px) * 4;
        img.data[k] = Math.round(Math.min(1, 0.35 + (1 - d1 * CELLS) * 0.75) * 255);
        img.data[k + 1] = Math.round(crack * 255);
        img.data[k + 2] = Math.round(id * 255);
        img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = maxAniso();
    return t;
});
export const lavaTime = { value: 0 };
const fogUniforms = () => T.UniformsUtils.clone(T.UniformsLib.fog);
// Each world's deadly liquid: the same shader, its own colours (hot cell centres, warm cells, deep
// cracks; the void also has stars drifting in it)
export const LIQUIDS = {
    lava: { hot: 0xffee52, warm: 0xff9e14, deep: 0xdc3305, stars: 0 },
    toxic: { hot: 0xc8ff48, warm: 0x3eb81a, deep: 0x4a1694, stars: 0 },
    void: { hot: 0xff8ae8, warm: 0x6a3aff, deep: 0x0c0624, stars: 1 },
};
const liquidBase = () => once('liquidbase', () => new T.ShaderMaterial({
    fog: true,
    uniforms: { ...fogUniforms(), uTime: lavaTime, uTex: { value: lavaTex() }, uFlow: { value: new T.Vector2(0, 0) }, uHot: { value: new T.Color() }, uWarm: { value: new T.Color() }, uDeep: { value: new T.Color() }, uStars: { value: 0 } },
    vertexShader: /* glsl */`
        uniform float uTime; uniform vec2 uFlow;
        varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            // world-space tiling (a fall flows down its own uv instead)
            vUv = uFlow.x + uFlow.y > 0.0 ? uv * uFlow + vec2(0.0, uTime * 0.35) : w.xz / 34.0;
            vec4 mvPosition = viewMatrix * w;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
        }`,
    fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D uTex; uniform vec2 uFlow; uniform vec3 uHot; uniform vec3 uWarm; uniform vec3 uDeep; uniform float uStars;
        varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_fragment>
        void main() {
            vec2 drift = vec2(uTime * 0.018, uTime * 0.011);
            vec4 a = texture2D(uTex, vUv + drift);
            vec4 b = texture2D(uTex, vUv * 1.7 - drift * 1.6 + vec2(0.37, 0.61));
            // each cell breathes at its own pace
            float pulse = 0.5 + 0.5 * sin(uTime * 1.6 + a.b * 6.283);
            float cell = a.r * (0.82 + 0.18 * pulse);
            float crack = max(a.g, b.g * 0.55);
            vec3 col = mix(uWarm, uHot, smoothstep(0.35, 0.95, cell));
            col = mix(col, uDeep, smoothstep(0.15, 0.85, crack));
            col += uHot * 0.22 * smoothstep(0.75, 1.0, b.r) * pulse;
            if (uStars > 0.5) {
                vec2 q = floor(vW.xz * 0.9 + vec2(uTime * 0.6, 0.0));
                float st = step(0.985, fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453));
                col += st * (0.6 + 0.4 * sin(uTime * 5.0 + q.x)) * vec3(1.0, 0.9, 1.0) * (1.0 - crack);
            }
            gl_FragColor = vec4(col * 1.08, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
        }`,
}));
function liquidVariant(kind, flow) {
    return once('liquid|' + kind + '|' + (flow ? flow.join(',') : ''), () => {
        const m = liquidBase().clone(), L = LIQUIDS[kind] || LIQUIDS.lava, u = m.uniforms;
        u.uTime = lavaTime;
        u.uTex = { value: lavaTex() };
        u.uFlow = { value: new T.Vector2(...(flow || [0, 0])) };
        u.uHot.value.set(L.hot); u.uWarm.value.set(L.warm); u.uDeep.value.set(L.deep); u.uStars.value = L.stars;
        return m;
    });
}
// the liquid's surface, a fall pouring down a wall, a geyser's column
export const liquidMaterial = (kind) => liquidVariant(kind || 'lava');
export const liquidFallMaterial = (kind) => liquidVariant(kind || 'lava', [1.2, 2.6]);
export const lavaMaterial = () => liquidMaterial('lava');
export const lavaFallMaterial = () => liquidFallMaterial('lava');

// =====================================================================================
// Pads: one small unlit shader with rings rippling out from the middle, a bright rim and a
// glowing centre. Each kind of pad is a copy with its own colours (one program for them all).
// =====================================================================================
export const padTime = { value: 0 };
const padBase = () => once('padbase', () => new T.ShaderMaterial({
    uniforms: { uTime: padTime, uA: { value: new T.Color() }, uB: { value: new T.Color() }, uOn: { value: 1 }, uSpeed: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uOn; uniform float uSpeed; varying vec2 vUv;
        void main() {
            vec2 q = vUv - 0.5;
            float r = max(abs(q.x), abs(q.y)) * 2.0;           // square rings
            float rings = 0.5 + 0.5 * sin((r * 9.0 - uTime * 3.0 * uSpeed) * 3.14159);
            float rim = smoothstep(0.82, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
            float core = 1.0 - smoothstep(0.0, 0.55, length(q) * 2.0);
            vec3 col = mix(uB, uA, rings * 0.55 + core * 0.5);
            col = mix(col, vec3(1.0), rim * 0.85);
            col *= mix(0.42, 1.0, uOn);
            gl_FragColor = vec4(col * ${NEON_BOOST.toFixed(2)}, 1.0);
            #include <colorspace_fragment>
        }`,
}));
export function padMaterial(a, b, on, speed) {
    return once('pad|' + a + '|' + b + '|' + (on ? 1 : 0) + '|' + (speed || 1), () => {
        const m = padBase().clone();
        m.uniforms.uTime = padTime;
        m.uniforms.uA.value.set(a); m.uniforms.uB.value.set(b); m.uniforms.uOn.value = on ? 1 : 0; m.uniforms.uSpeed.value = speed || 1;
        return m;
    });
}

// =====================================================================================
// Venom swirls: a spiral of streaks twisting up a cone, additive (the tornadoes over the launch pads
// and round the symbiote statues). One program; each colour is a copy.
// =====================================================================================
const swirlBase = () => once('swirlbase', () => new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, forceSinglePass: true,
    uniforms: { uTime: padTime, uA: { value: new T.Color() }, uB: { value: new T.Color() }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uK; varying vec2 vUv;
        ${HUE_GLSL}
        void main() {
            float s = fract(vUv.x * 3.0 + vUv.y * 1.6 - uTime * 0.9);
            float band = smoothstep(0.0, 0.2, s) * (1.0 - smoothstep(0.35, 0.75, s));
            float s2 = fract(vUv.x * 5.0 - vUv.y * 2.2 - uTime * 1.4);
            float thin = smoothstep(0.0, 0.08, s2) * (1.0 - smoothstep(0.1, 0.22, s2));
            float fade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
            vec3 col = hueRot(mix(uA, uB, vUv.y), 0.55 * sin(uTime * 0.7 + vUv.y * 4.0 + vUv.x * 6.2831853)) * (band * 0.9 + thin * 0.6);
            gl_FragColor = vec4(col * fade * uK, 1.0);
        }`,
}));
export function swirlMaterial(a, b, k) {
    return once('swirl|' + a + '|' + b + '|' + (k || 1), () => {
        const m = swirlBase().clone();
        m.uniforms.uTime = padTime;
        m.uniforms.uA.value.set(a); m.uniforms.uB.value.set(b); m.uniforms.uK.value = k || 1;
        return m;
    });
}
// The same swirl for many cones in one mesh: each cone's colour is in its vertices (one draw call)
export const swirlVCMaterial = () => once('swirlvc', () => new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, forceSinglePass: true, vertexColors: true,
    uniforms: { uTime: padTime },
    vertexShader: 'varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv; varying vec3 vC;
        ${HUE_GLSL}
        void main() {
            float s = fract(vUv.x * 3.0 + vUv.y * 1.6 - uTime * 0.9);
            float band = smoothstep(0.0, 0.2, s) * (1.0 - smoothstep(0.35, 0.75, s));
            float s2 = fract(vUv.x * 5.0 - vUv.y * 2.2 - uTime * 1.4);
            float thin = smoothstep(0.0, 0.08, s2) * (1.0 - smoothstep(0.1, 0.22, s2));
            float fade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
            vec3 col = mix(hueRot(vC, 0.5 * sin(uTime * 0.6 + vUv.y * 3.0)), vec3(1.0), vUv.y * 0.7) * (band * 0.9 + thin * 0.6);
            gl_FragColor = vec4(col * fade * 0.75, 1.0);
        }`,
}));
// an open cone, wider at the top (uv.x round, uv.y up)
export const swirlGeo = (r0, r1, h) => { const g = new T.CylinderGeometry(r1, r0, h, 28, 1, true); g.translate(0, h / 2, 0); return g; };

// =====================================================================================
// Beams of light (over pads, the escape portal): a soft vertical gradient, additive
// =====================================================================================
export const beamMaterial = (color) => once('beam|' + color, () => new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, forceSinglePass: true,
    uniforms: { uTime: padTime, uC: { value: new T.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uC; varying vec2 vUv;
        void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.15 * sin(uTime * 3.0 + vUv.y * 9.0)) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
            gl_FragColor = vec4(uC * a, 1.0); }`,
}));

// =====================================================================================
// The guide: a white ribbon of black chevrons from you to where you should go next (the
// reference's arrow line), arcing gently and scrolling forward. The strip is built in the vertex
// shader from its two ends, so it never touches a vertex buffer while it moves.
// =====================================================================================
export const GUIDE_N = 48;
export function guideGeometry() {
    const pos = new Float32Array((GUIDE_N + 1) * 2 * 3), idx = [];
    for (let i = 0; i <= GUIDE_N; i++) for (let s = 0; s < 2; s++) { const k = (i * 2 + s) * 3; pos[k] = i / GUIDE_N; pos[k + 1] = s; }
    for (let i = 0; i < GUIDE_N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.boundingSphere = new T.Sphere(new T.Vector3(), 1e5);
    return g;
}
export const guideMaterial = () => once('guide', () => new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    uniforms: { uA: { value: new T.Vector3() }, uB: { value: new T.Vector3() }, uH: { value: 4 }, uTime: padTime, uLen: { value: 10 }, uAlpha: { value: 1 }, uW: { value: 1.3 } },
    vertexShader: /* glsl */`
        uniform vec3 uA; uniform vec3 uB; uniform float uH; uniform float uW;
        varying vec2 vUv;
        vec3 at(float k) { vec3 p = mix(uA, uB, k); p.y += sin(k * 3.14159) * uH; return p; }
        void main() {
            float k = position.x;
            vec3 p = at(k), q = at(min(1.0, k + 0.01)) - at(max(0.0, k - 0.01));
            vec3 side = normalize(cross(normalize(q), vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
            vec3 w = p + side * (position.y - 0.5) * uW;
            vUv = vec2(k, position.y);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
    fragmentShader: /* glsl */`
        uniform float uTime; uniform float uLen; uniform float uAlpha; varying vec2 vUv;
        void main() {
            float u = vUv.x * uLen / 2.2 - uTime * 1.6;
            float c = fract(u);
            float y = abs(vUv.y - 0.5) * 2.0;
            // a chevron: a V pointing along the ribbon
            float v = abs(c - 0.5 - y * 0.32);
            float chev = 1.0 - smoothstep(0.1, 0.16, v);
            float edge = smoothstep(0.82, 0.9, y);
            vec3 col = mix(vec3(1.0), vec3(0.06, 0.06, 0.1), chev * (1.0 - edge));
            float fade = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
            gl_FragColor = vec4(col, 0.92 * fade * uAlpha * (1.0 - smoothstep(0.96, 1.0, y)));
            #include <colorspace_fragment>
        }`,
}));

// =====================================================================================
// Hazard stripes (the crushers), a darker variant for their edges
// =====================================================================================
export const hazardTex = (a, b) => once('hazard|' + (a || '') + (b || ''), () => {
    const c = canvas(128), x = c.getContext('2d');
    x.fillStyle = a || '#ffcc1a'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = b || '#1a1a22';
    for (let i = -2; i < 6; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 + 16 + 128, 128); x.lineTo(i * 32 + 128, 128); x.closePath(); x.fill(); }
    const t = texFrom(c, true); t.anisotropy = maxAniso();
    hazardTexs.add(t);
    return t;
});
// each world's stripes: yellow / black, lime / dark green, cyan / deep violet
const HAZARD = { lava: ['#ffcc1a', '#1a1a22'], toxic: ['#b8ff3a', '#14320e'], void: ['#5af0ff', '#1a0e3a'] };
export const hazardMaterial = (theme) => once('hazardmat|' + (theme || 'lava'), () => matte({ map: hazardTex(...(HAZARD[theme] || HAZARD.lava)) }));

// The geyser column: the world's liquid, flowing up its own uv
export const geyserMaterial = (kind) => liquidVariant(kind || 'lava', [1.5, 1.5]);

// =====================================================================================
// Bark, leaves, wood for the props (plain colours fold into the world's vertex-colour batches)
// =====================================================================================
export const neon = (color, boost) => once('neon|' + color + '|' + (boost || 1.2), () => { const m = flowify(new T.MeshBasicMaterial({ color })); m.color.multiplyScalar(NEON_BOOST * (boost || 1.2) / 1.25); return m; });

// ----- colour on the move -----
// Every glowing (neon) edge in the world: bright bands race along it and its colour drifts a little
// round the colour wheel, all from the world position and the clock (nothing extra to draw)
const HUE_GLSL = /* glsl */`
    vec3 hueRot(vec3 c, float a) { const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }`;
export { HUE_GLSL };
export function flowify(m) {
    m.userData.flow = true;
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uFlowT = padTime;
        sh.vertexShader = sh.vertexShader
            .replace('void main() {', 'varying vec3 vFlowP;\nvoid main() {')
            .replace('#include <project_vertex>', '#include <project_vertex>\n    vFlowP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
            .replace('void main() {', 'uniform float uFlowT; varying vec3 vFlowP;' + HUE_GLSL + '\nvoid main() {')
            .replace('#include <color_fragment>', `#include <color_fragment>
    float fph = dot(vFlowP, vec3(0.031, 0.047, 0.023)) - uFlowT * 0.55;
    float fband = pow(max(0.0, sin(fph * 6.2831853)), 8.0);
    diffuseColor.rgb = hueRot(diffuseColor.rgb, 0.42 * sin(fph * 1.7 + uFlowT * 0.35)) * (1.0 + 0.85 * fband) + fband * 0.22;`);
    };
    m.customProgramCacheKey = () => 'flow';
    return m;
}
// Signs and banners: a shine sweeps across them every few seconds (each at its own moment)
let shineSeed = 0;
export function shiny(m) {
    const seed = (shineSeed++ * 0.618034) % 1;
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uShineT = padTime;
        sh.uniforms.uShineSeed = { value: seed };
        sh.fragmentShader = sh.fragmentShader
            .replace('void main() {', 'uniform float uShineT; uniform float uShineSeed;\nvoid main() {')
            .replace('#include <map_fragment>', `#include <map_fragment>
    float shx = vMapUv.x + vMapUv.y * 0.45;
    float shp = fract(uShineT * 0.16 + uShineSeed) * 3.2 - 1.0;
    diffuseColor.rgb += (1.0 - smoothstep(0.0, 0.07, abs(shx - shp))) * diffuseColor.a * 0.6;`);
    };
    m.customProgramCacheKey = () => 'shine';
    return m;
}
// The hazard stripes crawl along (one offset per texture: free)
const hazardTexs = new Set();
export function hazardTick(t) { for (const tx of hazardTexs) tx.offset.x = -t * 0.45; }
export const softTex = () => once('soft', () => {
    const c = canvas(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return texFrom(c);
});
// A glow sprite under hot things (the lava's light on the walls near a lava fall, pads)
export const glowMaterial = (color, opacity) => once('glow|' + color + '|' + opacity, () => new T.MeshBasicMaterial({ map: softTex(), color, transparent: true, opacity: opacity ?? 0.6, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, forceSinglePass: true }));
