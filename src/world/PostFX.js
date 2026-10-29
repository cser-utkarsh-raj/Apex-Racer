import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * PostFX — film-grade pass used after tone mapping. Kept separate from the
 * world modules so Node geometry tests do not have to resolve three/addons.
 */

const GradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uSaturation: { value: 1.08 },
        uContrast: { value: 1.04 },
        uLift: { value: 0.0 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uVignette: { value: 0.32 },
        uGrain: { value: 0.028 },
        uAberration: { value: 0.0012 }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uLift;
        uniform vec3 uTint;
        uniform float uVignette;
        uniform float uGrain;
        uniform float uAberration;

        float rand(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 d = vUv - 0.5;
            float r2 = dot(d, d);
            // Very slight lens fringing toward the frame edges.
            vec3 col;
            col.r = texture2D(tDiffuse, vUv + d * uAberration * r2).r;
            col.g = texture2D(tDiffuse, vUv).g;
            col.b = texture2D(tDiffuse, vUv - d * uAberration * r2).b;

            float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(vec3(luma), col, uSaturation);
            col = (col - 0.5) * uContrast + 0.5 + uLift;
            col *= uTint;

            // Keep highlights from clipping hard without lifting the midtones.
            col = max(col, 0.0);

            float vig = smoothstep(0.32, 0.92, length(d) * 1.42);
            col *= 1.0 - uVignette * vig;

            float grain = rand(vUv * vec2(1920.0, 1080.0) + uTime * 0.37) - 0.5;
            col += grain * uGrain;

            gl_FragColor = vec4(col, 1.0);
        }
    `
};

export function createGradePass(options = {}) {
    const pass = new ShaderPass(GradeShader);
    pass.uniforms.uVignette.value = options.vignette ?? 0.32;
    pass.uniforms.uGrain.value = options.grain ?? 0.028;
    return pass;
}
