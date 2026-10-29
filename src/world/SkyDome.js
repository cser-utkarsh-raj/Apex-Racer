import * as THREE from 'three';

/**
 * SkyDome — a single-draw-call atmospheric sky.
 *
 * Renders a gradient atmosphere with sun-side scattering, a soft sun/moon
 * disc, a drifting FBM cloud deck and procedural stars. It follows the camera
 * so the horizon never slides, and it needs no textures or extra lights.
 */
export function buildSkyDome(style) {
    const group = new THREE.Group();
    group.name = 'sky_dome';

    const sky = style.sky || {};
    const sunPos = new THREE.Vector3(...(style.sun?.position || [180, 240, -120])).normalize();
    const cloud = sky.clouds || {};
    const night = !!style.night;

    const moonDir = (style.moon && style.moon.dir)
        ? new THREE.Vector3(...style.moon.dir).normalize()
        : sunPos.clone().negate();

    const uniforms = {
        top: { value: new THREE.Color(sky.top || '#3f78ab') },
        horizon: { value: new THREE.Color(sky.horizon || '#dccfb6') },
        ground: { value: new THREE.Color(sky.ground || '#6b5a44') },
        sunDir: { value: sunPos },
        moonDir: { value: moonDir },
        sunColor: { value: new THREE.Color(style.sun?.color ?? 0xfff2d8) },
        moonColor: { value: new THREE.Color(style.moon?.color ?? 0xdfe8ff) },
        stars: { value: sky.stars || 0 },
        cloudCover: { value: cloud.coverage ?? 0.5 },
        cloudSoft: { value: cloud.softness ?? 1.0 },
        cloudColor: { value: new THREE.Color(cloud.color || '#ffffff') },
        cloudShadow: { value: new THREE.Color(cloud.shadow || '#8b93a6') },
        time: { value: 0 },
        night: { value: night ? 1 : 0 }
    };

    const geometry = new THREE.SphereGeometry(2400, 48, 28);
    const material = new THREE.ShaderMaterial({
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */`
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            precision highp float;
            varying vec3 vDir;
            uniform vec3 top;
            uniform vec3 horizon;
            uniform vec3 ground;
            uniform vec3 sunDir;
            uniform vec3 moonDir;
            uniform vec3 sunColor;
            uniform vec3 moonColor;
            uniform float stars;
            uniform float cloudCover;
            uniform float cloudSoft;
            uniform vec3 cloudColor;
            uniform vec3 cloudShadow;
            uniform float time;
            uniform float night;

            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float valueNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float amp = 0.5;
                for (int i = 0; i < 5; i++) {
                    v += amp * valueNoise(p);
                    p = p * 2.03 + vec2(11.7, 5.3);
                    amp *= 0.5;
                }
                return v;
            }

            void main() {
                vec3 dir = normalize(vDir);
                float h = dir.y;

                // Base atmosphere. A little extra density near the horizon
                // gives the long, hazy look of real daylight.
                float up = pow(clamp(h, 0.0, 1.0), 0.62);
                vec3 col = mix(horizon, top, smoothstep(0.0, 0.58, up));
                col = mix(ground, col, smoothstep(-0.22, 0.015, h));

                // Sun-side Mie scattering: broad warm wash + hot core.
                float sunDot = max(dot(dir, sunDir), 0.0);
                float forward = pow(sunDot, 6.0) * 0.22 + pow(sunDot, 48.0) * 0.55;
                col += sunColor * forward;

                // Sun disc with a soft limb.
                float discR = night > 0.5 ? 0.025 : 0.032;
                float disc = smoothstep(cos(discR), cos(discR * 0.80), sunDot);
                col += sunColor * disc * (night > 0.5 ? 0.25 : 3.2);

                // Night moon, with a faint halo.
                if (night > 0.5) {
                    float mDot = max(dot(dir, moonDir), 0.0);
                    float moon = smoothstep(cos(0.021), cos(0.016), mDot);
                    col += moonColor * moon * 2.2;
                    col += moonColor * pow(mDot, 90.0) * 0.22;
                }

                // Cloud deck: project the view direction onto a virtual plane.
                if (cloudCover > 0.01 && h > 0.015) {
                    vec2 cuv = dir.xz / max(h, 0.055) * 0.52;
                    float drift = time * 0.006;
                    float n1 = fbm(cuv * 0.9 + vec2(drift, drift * 0.31));
                    float n2 = fbm(cuv * 2.6 - vec2(drift * 0.6, drift * 0.18));
                    float n3 = fbm(cuv * 6.2 + vec2(-drift * 0.8, drift * 0.45));
                    float n4 = fbm(cuv * 13.0 + vec2(drift * 0.4, -drift * 0.9));
                    float field = n1 * 0.56 + n2 * 0.24 + n3 * 0.14 + n4 * 0.06;
                    float threshold = 0.70 - cloudCover * 0.32;
                    float cover = smoothstep(threshold, threshold + 0.065 * cloudSoft, field);
                    float fade = smoothstep(0.015, 0.20, h);
                    vec3 base = mix(cloudShadow, cloudColor, smoothstep(threshold, threshold + 0.30, field));
                    // Silver lining where the sun hits the edge of a cloud.
                    base += sunColor * pow(sunDot, 18.0) * cover * 0.10;
                    if (night > 0.5) {
                        // City glow catching the underside of the deck.
                        base += vec3(0.12, 0.10, 0.07) * pow(1.0 - h, 5.0) * cover;
                    }
                    col = mix(col, base, cover * 0.94 * fade);
                }

                // Horizon haze so distant geometry dissolves into the sky.
                col = mix(horizon * 1.015, col, smoothstep(-0.03, 0.26, h));

                if (stars > 0.01 && h > 0.02) {
                    vec3 grid = floor(dir * 700.0);
                    float s = hash21(grid.xy + grid.z * 31.7);
                    float twinkle = step(0.9950, s) * (0.55 + 0.45 * sin(time * 1.7 + s * 60.0));
                    col += vec3(0.9, 0.95, 1.0) * twinkle * stars * smoothstep(0.02, 0.28, h);
                }

                gl_FragColor = vec4(max(col, 0.0), 1.0);
            }
        `
    });

    const dome = new THREE.Mesh(geometry, material);
    dome.frustumCulled = false;
    dome.renderOrder = -1000;
    group.add(dome);

    return {
        group,
        update(camera, delta = 0.016) {
            group.position.copy(camera.position);
            uniforms.time.value += delta;
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        }
    };
}
