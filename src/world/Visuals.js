import * as THREE from 'three';

/**
 * Visuals — small, self-contained helpers that lift the world from "flat
 * voxel render" to a photographed place: image-based lighting, film grading
 * and a procedural environment map generated from each world's own sky.
 */

/* ------------------------------------------------------------------ */
/* Procedural environment (IBL)                                        */
/* ------------------------------------------------------------------ */

/**
 * Paint an equirectangular sky into a canvas and prefilter it with PMREM so
 * every MeshStandardMaterial picks up believable ambient colour and the car
 * reflects the actual horizon instead of a black void.
 */
export function createEnvironment(renderer, style) {
    if (!renderer) return null;

    const W = 1024, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const sky = style.sky || {};
    const night = !!style.night;

    // Vertical atmosphere. Canvas y=0 is the zenith, y=H is the nadir.
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, sky.top || '#3f78ab');
    grad.addColorStop(0.40, blend(sky.horizon || '#dccfb6', sky.top || '#3f78ab', 0.35));
    grad.addColorStop(0.50, sky.horizon || '#dccfb6');
    grad.addColorStop(0.56, blend(sky.horizon || '#dccfb6', sky.ground || '#6b5a44', 0.55));
    grad.addColorStop(1.00, sky.ground || '#6b5a44');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Sun/moon hotspot in equirect UV space.
    const dir = new THREE.Vector3(...(style.sun?.position || [180, 240, -120])).normalize();
    const sunU = (Math.atan2(dir.x, dir.z) / (Math.PI * 2) + 0.5) * W;
    const sunV = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI * H;
    const sunColor = new THREE.Color(style.sun?.color ?? 0xfff2d8);
    const glow = ctx.createRadialGradient(sunU, sunV, 0, sunU, sunV, W * 0.22);
    glow.addColorStop(0, rgba(sunColor, night ? 0.35 : 0.95));
    glow.addColorStop(0.18, rgba(sunColor, night ? 0.16 : 0.42));
    glow.addColorStop(1, rgba(sunColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Soft cloud banding keeps reflections from looking like a clean gradient.
    if (!night) {
        for (let i = 0; i < 26; i++) {
            const x = Math.random() * W;
            const y = H * (0.20 + Math.random() * 0.24);
            const rx = 40 + Math.random() * 130;
            const ry = 8 + Math.random() * 22;
            const cloud = ctx.createRadialGradient(x, y, 0, x, y, rx);
            cloud.addColorStop(0, 'rgba(255,255,255,0.24)');
            cloud.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(1, ry / rx);
            ctx.translate(-x, -y);
            ctx.fillStyle = cloud;
            ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
            ctx.restore();
        }
    } else {
        // Sodium / neon city glow along the horizon.
        const city = ctx.createLinearGradient(0, H * 0.40, 0, H * 0.52);
        city.addColorStop(0, 'rgba(255,150,60,0)');
        city.addColorStop(0.75, 'rgba(255,145,70,0.20)');
        city.addColorStop(1, 'rgba(90,130,255,0.10)');
        ctx.fillStyle = city;
        ctx.fillRect(0, H * 0.40, W, H * 0.14);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const target = pmrem.fromEquirectangular(texture);
    texture.dispose();
    pmrem.dispose();
    return target;
}

function blend(a, b, t) {
    const ca = new THREE.Color(a);
    const cb = new THREE.Color(b);
    return `#${ca.lerp(cb, t).getHexString()}`;
}

function rgba(color, alpha) {
    return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
}

/* ------------------------------------------------------------------ */
export function applyGradeStyle(pass, style) {
    if (!pass) return;
    const grade = style.grade || {};
    const u = pass.uniforms;
    u.uSaturation.value = grade.saturation ?? 1.08;
    u.uContrast.value = grade.contrast ?? 1.04;
    u.uLift.value = grade.lift ?? 0.0;
    u.uVignette.value = grade.vignette ?? 0.32;
    u.uGrain.value = grade.grain ?? 0.028;
    u.uAberration.value = grade.aberration ?? 0.0012;
    if (grade.tint) u.uTint.value.set(grade.tint);
    else u.uTint.value.setRGB(1, 1, 1);
}

/* ------------------------------------------------------------------ */
/* Material detail shader                                              */
/* ------------------------------------------------------------------ */

export const SURFACE = {
    NATURAL: 0,
    SOIL: 1,
    BUILT: 2,
    ROCK: 3,
    GLASS: 4,
    OTHER: 5,
    ASPHALT: 6,
    PAINT: 7,
    PAVING: 8
};

const NOISE_GLSL = /* glsl */`
    varying float vSurface;
    varying float vWallHeight;
    varying vec3 vWPos;
    varying vec3 vWNormal;

    float dHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    float dNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = dHash(i);
        float b = dHash(i + vec2(1.0, 0.0));
        float c = dHash(i + vec2(0.0, 1.0));
        float d = dHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float dFbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
            v += amp * dNoise(p);
            p = p * 2.07 + vec2(17.3, 9.1);
            amp *= 0.5;
        }
        return v;
    }
`;

function patchVertex(shader) {
    if (shader.vertexShader.includes('vSurface = aSurface')) return;
    shader.vertexShader = shader.vertexShader
        .replace(
            '#include <common>',
            `#include <common>
             attribute float aSurface;
             attribute float aWallHeight;
             varying float vSurface;
             varying float vWallHeight;
             varying vec3 vWPos;
             varying vec3 vWNormal;`
        )
        .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vSurface = aSurface;
             vWallHeight = aWallHeight;
             vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
             vWNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );
}

/**
 * Add world-space surface detail to a MeshStandardMaterial. Works without UVs
 * (the terrain geometry has none) and keeps the built-in lighting, shadows
 * and fog chunks intact.
 */
export function addSurfaceDetail(material, kind = 'terrain', extra = {}) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uDetail = { value: extra.detail ?? 1.0 };
        shader.uniforms.uTint = { value: extra.tint ?? new THREE.Color(1, 1, 1) };
        shader.uniforms.uRoad = { value: kind === 'road' ? 1 : 0 };

        patchVertex(shader);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform float uDetail;
                uniform float uRoad;
                uniform vec3 uTint;
                ${NOISE_GLSL}
            `)
            .replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                vec3 V = normalize(cameraPosition - vWPos);
                vec3 N = normalize(vWNormal);
                float upFacing = smoothstep(0.45, 0.95, abs(N.y));
                vec2 tuv = abs(N.y) > 0.6 ? vWPos.xz
                    : (abs(N.x) > abs(N.z) ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y));
                float micro = dNoise(tuv * 7.0);
                float meso = dFbm(tuv * 0.55);
                float macro = dFbm(tuv * 0.12 + 3.7);
                float paintMask = 0.0;
                float sId = vSurface;
                if (uRoad > 0.5) {
                    float paintLum = dot(vColor, vec3(0.299, 0.587, 0.114));
                    paintMask = smoothstep(0.40, 0.58, paintLum);
                    sId = mix(6.0, 7.0, paintMask);
                }
                vec3 detailCol = vColor;
                float surfaceRough = 0.9;
                float surfaceMetal = 0.0;
                float bump = 0.0;

                if (sId < 0.5) {
                    // Grass / leaves: patchy, sun-bleached, never uniform.
                    vec3 grassA = vec3(0.24, 0.36, 0.14);
                    vec3 grassB = vec3(0.46, 0.58, 0.24);
                    detailCol = mix(grassA, grassB, clamp(meso * 1.25 + macro * 0.35, 0.0, 1.0));
                    detailCol = mix(detailCol, vColor, 0.42);
                    detailCol *= 0.86 + micro * 0.25;
                    surfaceRough = 0.96;
                    bump = micro * 0.35;
                } else if (sId < 1.5) {
                    // Soil, gravel, timber.
                    detailCol = mix(vColor * 0.82, vColor * 1.12, meso);
                    detailCol *= 0.9 + micro * 0.18;
                    surfaceRough = 0.98;
                } else if (sId < 2.5) {
                    // Built: plaster/concrete with floor slab lines.
                    float grime = smoothstep(0.3, 0.9, dFbm(tuv * 0.8)) * 0.16;
                    detailCol = vColor * (0.94 + micro * 0.10) * (1.0 - grime);
                    if (vWallHeight > 6.0 && upFacing < 0.4) {
                        float floorBand = smoothstep(0.045, 0.0, abs(fract(vWPos.y / 3.4) - 0.03));
                        detailCol *= 1.0 - floorBand * 0.18;
                    }
                    surfaceRough = 0.86;
                } else if (sId < 3.5) {
                    float strata = sin(vWPos.y * 1.7 + meso * 3.0) * 0.5 + 0.5;
                    detailCol = mix(vColor * 0.78, vColor * 1.10, strata * 0.5 + micro * 0.25);
                    surfaceRough = 0.95;
                } else if (sId < 4.5) {
                    detailCol = vColor * (0.95 + micro * 0.12);
                    surfaceRough = 0.22;
                    surfaceMetal = 0.35;
                } else if (sId < 5.5) {
                    detailCol = vColor * (0.9 + meso * 0.22);
                    surfaceRough = 0.9;
                } else if (sId < 6.5) {
                    // Asphalt: aggregate grain, patches and a faint sheen.
                    float grain = dNoise(tuv * 26.0);
                    float patchN = dFbm(tuv * 0.22);
                    detailCol = vColor * (0.80 + grain * 0.30) * (0.86 + patchN * 0.24);
                    surfaceRough = 0.44 + grain * 0.14;
                    bump = grain * 0.5;
                } else if (sId < 7.5) {
                    // Road paint: clean, slightly glossy, worn at the edges.
                    float wear = smoothstep(0.35, 0.75, dNoise(tuv * 3.0));
                    detailCol = vColor * (0.97 + micro * 0.05) * (1.0 - wear * 0.14);
                    surfaceRough = 0.32;
                } else {
                    // Sidewalk pavers.
                    vec2 grid = abs(fract(tuv / 1.15) - 0.5);
                    float seam = smoothstep(0.47, 0.5, max(grid.x, grid.y));
                    detailCol = vColor * (0.93 + micro * 0.10) * (1.0 - seam * 0.22);
                    surfaceRough = 0.9;
                }

                // Façade glazing for anything that is clearly vertical and
                // tall. It is subtle enough that a grey cliff reads as rock,
                // but city towers suddenly have real floors and windows.
                if (vWallHeight > 7.5 && upFacing < 0.4 && sId > 1.5 && sId < 5.5 && uRoad < 0.5) {
                    vec2 wuv = tuv / vec2(2.7, 3.2);
                    vec2 cell = floor(wuv);
                    vec2 f = fract(wuv);
                    float win = step(0.22, f.x) * step(f.x, 0.80) *
                                step(0.26, f.y) * step(f.y, 0.76);
                    float rnd = dHash(cell + 13.7);
                    vec3 glass = mix(vec3(0.025, 0.035, 0.045), vec3(0.10, 0.15, 0.20), rnd);
                    detailCol = mix(detailCol, glass, win * 0.55);
                    surfaceRough = mix(surfaceRough, 0.24, win * 0.8);
                }

                // Keep the authored palette dominant; detail is seasoning.
                float k = uDetail;
                diffuseColor.rgb = mix(diffuseColor.rgb, detailCol, k);
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTint, 1.0);
            `)
            .replace(
                '#include <roughnessmap_fragment>',
                `#include <roughnessmap_fragment>
                 roughnessFactor = mix(roughnessFactor, surfaceRough, clamp(uDetail, 0.0, 1.0));
                 roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);
                `
            );
    };
    material.customProgramCacheKey = () => `surface-${kind}-${extra.detail ?? 1}`;
    return material;
}
