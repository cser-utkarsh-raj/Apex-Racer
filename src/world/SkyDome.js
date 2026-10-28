import * as THREE from 'three';

/**
 * SkyDome — gradient sky, sun/moon disc and optional stars.
 * One mesh, one draw call, follows the camera.
 */
export function buildSkyDome(style) {
    const group = new THREE.Group();
    group.name = 'sky_dome';

    const geometry = new THREE.SphereGeometry(2400, 32, 20);
    const uniforms = {
        top: { value: new THREE.Color(style.sky.top) },
        horizon: { value: new THREE.Color(style.sky.horizon) },
        ground: { value: new THREE.Color(style.sky.ground) },
        stars: { value: style.sky.stars || 0 }
    };

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
            varying vec3 vDir;
            uniform vec3 top;
            uniform vec3 horizon;
            uniform vec3 ground;
            uniform float stars;

            float hash(vec3 p) {
                p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            void main() {
                vec3 dir = normalize(vDir);
                float h = dir.y;
                vec3 col = mix(horizon, top, smoothstep(0.0, 0.62, max(h, 0.0)));
                col = mix(ground, col, smoothstep(-0.16, 0.02, h));

                if (stars > 0.01 && h > 0.02) {
                    vec3 grid = floor(dir * 620.0);
                    float s = hash(grid);
                    float twinkle = step(0.9975, s);
                    col += vec3(twinkle) * stars * smoothstep(0.02, 0.35, h) * 0.9;
                }

                gl_FragColor = vec4(col, 1.0);
            }
        `
    });

    const dome = new THREE.Mesh(geometry, material);
    dome.frustumCulled = false;
    dome.renderOrder = -1000;
    group.add(dome);

    if (style.sun) {
        const sunDir = new THREE.Vector3(...style.sun.position).normalize();
        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(style.moon ? 34 : 46, 32),
            new THREE.MeshBasicMaterial({
                color: style.moon ? style.moon.color : style.sun.color,
                transparent: true,
                opacity: style.night ? 0.95 : 0.85,
                fog: false,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        disc.position.copy(sunDir.multiplyScalar(1900));
        disc.lookAt(0, 0, 0);
        disc.renderOrder = -999;
        group.add(disc);
    }

    return {
        group,
        update(camera) {
            group.position.copy(camera.position);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            group.traverse(o => {
                if (o.isMesh && o.material && o.material !== material) {
                    o.geometry.dispose();
                    o.material.dispose();
                }
            });
        }
    };
}
