// The symbiote's look, shared by everything venom: the suit's shards, the monster form, the back
// tendrils, the tentacle and its head, and the venom spreading over your own outfit.
//
// A glossy near-black body lit like the world (sun, sky and ground light), a neon rim that shimmers
// between the symbiote's two glow colours, a cheap sun highlight (no reflections or environment
// maps), and glowing veins pulsing over it. On your avatar it creeps out from the chest the higher
// your level, with a bright glowing edge where it meets your clothes, and covers you completely when
// you release it. Small shaders, one program each, every colour a uniform.
import { T, V3, sun, hemi, ambient } from './engine.js';
import { suitOf } from '../../shared/config.js';

// ----- lighting every venom surface shares, refreshed once a frame -----
export const venomLight = {
    uSunDir: { value: new V3(0, 1, 0) }, uSunC: { value: new T.Color() }, uSky: { value: new T.Color() }, uGround: { value: new T.Color() },
    uAmb: { value: 0.3 }, uTime: { value: 0 },
};
export function venomFrame(t) {
    const L = venomLight;
    L.uTime.value = t;
    L.uSunDir.value.copy(sun.position).sub(sun.target.position).normalize();
    L.uSunC.value.copy(sun.color).multiplyScalar(sun.intensity / 2.7);
    L.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity / 1.85);
    L.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity / 1.85);
    L.uAmb.value = ambient.intensity * 0.6;
}

// GLSL shared by the venom shaders: a hue wheel, a soft 3D value noise, flowing veins
export const VENOM_GLSL = /* glsl */`
    vec3 vnHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
    float vnHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    float vnNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(vnHash(i), vnHash(i + vec3(1, 0, 0)), f.x), mix(vnHash(i + vec3(0, 1, 0)), vnHash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(vnHash(i + vec3(0, 0, 1)), vnHash(i + vec3(1, 0, 1)), f.x), mix(vnHash(i + vec3(0, 1, 1)), vnHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    // thin bright lines snaking over the surface, a pulse running up them
    float vnVein(vec3 p, float t) {
        float a = abs(sin(p.x * 1.7 + sin(p.y * 2.3 + t * 0.7) * 1.6 + sin(p.z * 1.9 - t * 0.4) * 1.2));
        float b = abs(sin(p.z * 1.5 + sin(p.y * 1.7 - t * 0.5) * 1.8 + p.x * 0.6));
        float v = max(smoothstep(0.13, 0.0, a), smoothstep(0.1, 0.0, b) * 0.7);
        return v * (0.55 + 0.45 * sin(t * 3.2 - p.y * 1.8));
    }
    // the neon gradient: glow -> glow2 (or the whole rainbow)
    vec3 vnGlow(vec3 g1, vec3 g2, float rainbow, float k) {
        return rainbow > 0.5 ? mix(vnHue(fract(k * 0.25)), vec3(1.0), 0.15) : mix(g1, g2, 0.5 + 0.5 * sin(k * 3.14159));
    }
`;

// ----- the glossy symbiote surface (suit shards, monster form, tendrils, the tentacle's head) -----
// emit: 1 = the glowing shards (pure neon gradient), 0 = the glossy body
const fogU = () => T.UniformsUtils.clone(T.UniformsLib.fog);
const surfaceBase = new T.ShaderMaterial({
    fog: true,
    uniforms: { ...fogU(), ...venomLight, uBody: { value: new T.Color() }, uG1: { value: new T.Color() }, uG2: { value: new T.Color() }, uRainbow: { value: 0 }, uStars: { value: 0 }, uEmit: { value: 0 } },
    vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vW; varying vec3 vO;
        #include <fog_pars_vertex>
        void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz; vO = position;
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 mvPosition = viewMatrix * w;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
        }`,
    fragmentShader: /* glsl */`
        uniform vec3 uSunDir; uniform vec3 uSunC; uniform vec3 uSky; uniform vec3 uGround; uniform float uAmb; uniform float uTime;
        uniform vec3 uBody; uniform vec3 uG1; uniform vec3 uG2; uniform float uRainbow; uniform float uStars; uniform float uEmit;
        varying vec3 vN; varying vec3 vW; varying vec3 vO;
        #include <fog_pars_fragment>
        ${VENOM_GLSL}
        void main() {
            vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
            float k = vO.y * 0.55 + vO.x * 0.2 + uTime * 0.45;
            vec3 g = vnGlow(uG1, uG2, uRainbow, k);
            vec3 col;
            if (uEmit > 0.5) {
                col = g * (1.05 + 0.25 * sin(uTime * 4.0 + vO.y * 3.0));
            } else {
                vec3 light = mix(uGround, uSky, n.y * 0.5 + 0.5) * 0.55 + uSunC * max(0.0, dot(n, uSunDir)) * 0.75 + vec3(uAmb);
                col = uBody * light;
                // a neon rim that shimmers between the two glow colours
                float fres = pow(1.0 - max(0.0, dot(n, v)), 2.4);
                col += vnGlow(uG1, uG2, uRainbow, k + fres * 1.5) * fres * 0.75;
                // wet gloss: a sharp sun highlight
                vec3 h = normalize(uSunDir + v);
                col += uSunC * pow(max(0.0, dot(n, h)), 44.0) * 0.7;
                // glowing veins
                col += g * vnVein(vO * 2.4, uTime) * 0.85;
                if (uStars > 0.5) { float st = step(0.975, vnHash(floor(vO * 7.0))); col += st * (0.6 + 0.4 * sin(uTime * 6.0 + vO.x * 9.0)); }
            }
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
        }`,
});
const surfaces = new Map();
export function venomSurface(suitId, emit) {
    const key = (suitId || '') + '|' + (emit ? 1 : 0);
    let m = surfaces.get(key);
    if (!m) {
        m = surfaceBase.clone();
        for (const k of Object.keys(venomLight)) m.uniforms[k] = venomLight[k];
        const s = suitOf(suitId), u = m.uniforms;
        u.uBody.value.set(s.body); u.uG1.value.set(s.glow); u.uG2.value.set(s.glow2 ?? s.glow);
        u.uRainbow.value = s.rainbow ? 1 : 0; u.uStars.value = s.stars ? 1 : 0; u.uEmit.value = emit ? 1 : 0;
        surfaces.set(key, m);
    }
    return m;
}

// ----- the venom spreading over an outfit (a Bloxity avatar's skin and clothes, or the blocky body) -----
// U: this character's own uniforms (how far it has spread, the colours, where and which way the
// character stands); every outfit material of one character shares them.
export function outfitUniforms() {
    return {
        uVCover: { value: 0.3 }, uVBody: { value: new T.Color(0x120e1c) }, uVG1: { value: new T.Color(0xa05aff) }, uVG2: { value: new T.Color(0x3af0ff) },
        uVRainbow: { value: 0 }, uVRoot: { value: new V3() }, uVYaw: { value: 0 }, uVScale: { value: 1 },
    };
}
export function setOutfitSuit(U, suitId) {
    const s = suitOf(suitId);
    U.uVBody.value.set(s.body); U.uVG1.value.set(s.glow); U.uVG2.value.set(s.glow2 ?? s.glow); U.uVRainbow.value = s.rainbow ? 1 : 0;
}
const OUTFIT_FRAG = /* glsl */`
    {
        // into the character's own frame: feet at 0, facing +z
        vec3 vp = (vVenomW - uVRoot) / uVScale;
        float cs = cos(uVYaw), sn = sin(uVYaw);
        vp = vec3(cs * vp.x - sn * vp.z, vp.y, sn * vp.x + cs * vp.z);
        // it spreads out from the chest, its edge broken up by a slowly moving noise
        float nz = vnNoise(vp * 1.6 + vec3(0.0, uVTime * 0.3, 0.0));
        float f = length((vp - vec3(0.0, 3.3, 0.0)) * vec3(1.0, 0.62, 1.0)) / 2.6 + (nz - 0.5) * 0.5;
        float m = smoothstep(uVCover + 0.05, uVCover - 0.05, f);
        float edge = smoothstep(0.11, 0.0, abs(f - uVCover)) * step(0.02, uVCover);
        vec3 g = vnGlow(uVG1, uVG2, uVRainbow, vp.y * 0.6 + uVTime * 0.45);
        diffuseColor.rgb = mix(diffuseColor.rgb, uVBody, m * 0.9);
        float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.4);
        totalEmissiveRadiance += g * (edge * 1.25 + vnVein(vp * 2.3, uVTime) * m * 0.8 + fres * m * 0.6);
    }
`;
// Patches a matte (Lambert) outfit material so the venom spreads over it; U from outfitUniforms()
export function venomizeMaterial(material, U) {
    if (!material || !material.isMeshLambertMaterial || material.userData.venom === U) return;
    material.userData.venom = U;
    material.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U, { uVTime: venomLight.uTime });
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vVenomW;')
            .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n\tvVenomW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vVenomW;\nuniform float uVCover; uniform vec3 uVBody; uniform vec3 uVG1; uniform vec3 uVG2; uniform float uVRainbow; uniform vec3 uVRoot; uniform float uVYaw; uniform float uVScale; uniform float uVTime;\n' + VENOM_GLSL)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + OUTFIT_FRAG);
    };
    material.customProgramCacheKey = () => 'venom-outfit';
    material.needsUpdate = true;
}
// Every matte mesh under root (skipping `skip`), each with its own copy of the material if shared
export function venomizeTree(root, U, opts) {
    const own = opts && opts.clone, skip = opts && opts.skip;
    root.traverse((c) => {
        if (!c.isMesh || (skip && isUnder(c, skip)) || !c.material || !c.material.isMeshLambertMaterial) return;
        if (own && !c.material.userData.ownOutfit) { c.material = c.material.clone(); c.material.userData.ownOutfit = true; }
        venomizeMaterial(c.material, U);
    });
}
function isUnder(o, p) { for (let q = o; q; q = q.parent) if (q === p) return true; return false; }
