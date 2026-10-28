import * as THREE from 'three';

/**
 * TrackBuilder — asphalt ribbon, lane paint, guardrails and streetlights
 * generated along the real-map route. Everything is merged into a handful of
 * static meshes so the whole 3 km circuit costs four draw calls.
 */

const SAMPLE = 4;      // metres between ribbon samples
const RAIL_STEP = 4;

export function buildRoadGeometry(route, style) {
    const road = style.road;
    const half = road.width / 2;
    const edge = road.edgeColor ? new THREE.Color(road.edgeColor) : new THREE.Color(0xffffff);
    const line = new THREE.Color(road.lineColor);
    const surface = new THREE.Color().fromArray(road.roadColor);

    const pos = [], col = [];

    const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, c) => {
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
        for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    };

    const strip = (z0, z1, l0, l1, lift, colour) => {
        const a = route.atZ(z0), b = route.atZ(z1);
        // Wind CCW seen from above so the +Y normal is a front face. With
        // DoubleSide an inverted quad gets its normal flipped and is lit from
        // below, which reads as a pitch-black road.
        quad(
            b.x + l0, b.y + lift, z1,
            b.x + l1, b.y + lift, z1,
            a.x + l1, a.y + lift, z0,
            a.x + l0, a.y + lift, z0,
            colour
        );
    };

    // Surface + shoulders
    for (let z = route.zMin; z < route.zMax; z += SAMPLE) {
        const z1 = Math.min(route.zMax, z + SAMPLE);
        strip(z, z1, -half, half, 0.02, surface);
        strip(z, z1, -half - road.shoulder, -half, 0.012, new THREE.Color(0x2a2a2a));
        strip(z, z1, half, half + road.shoulder, 0.012, new THREE.Color(0x2a2a2a));
    }

    // Solid edge lines
    for (let z = route.zMin; z < route.zMax; z += SAMPLE) {
        const z1 = Math.min(route.zMax, z + SAMPLE);
        strip(z, z1, -half + 0.28, -half + 0.44, 0.035, edge);
        strip(z, z1, half - 0.44, half - 0.28, 0.035, edge);
    }

    // Dashed centre + lane dividers
    const dashOn = 6, dashOff = 9;
    for (let z = route.zMin; z < route.zMax; z += dashOn + dashOff) {
        const z1 = Math.min(route.zMax, z + dashOn);
        strip(z, z1, -0.16, 0.16, 0.036, line);
        if (road.width > 18) {
            strip(z, z1, -half * 0.5 - 0.1, -half * 0.5 + 0.1, 0.034, edge);
            strip(z, z1, half * 0.5 - 0.1, half * 0.5 + 0.1, 0.034, edge);
        }
    }

    return makeGeometry(pos, col, [0, 1, 0]);
}

export function buildGuardrailGeometry(route, style) {
    const road = style.road;
    const offset = road.width / 2 + road.shoulder + 0.35;
    const railColour = new THREE.Color(road.railColor || 0x8b939a);
    const postColour = railColour.clone().multiplyScalar(0.72);
    const pos = [], col = [];
    const rails = [{ y: 0.55, h: 0.13 }, { y: 0.95, h: 0.13 }];

    /**
     * Box aligned with the segment it covers. An axis-aligned box stepped in
     * world X leaves visible gaps and floating slats as soon as the road
     * bends, which is what made the rails look broken on every map.
     */
    const addBeam = (ax, az, bx, bz, y, thickness, height, c) => {
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 0.001;
        const fx = dx / len, fz = dz / len;
        const rx = fz, rz = -fx;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const hw = thickness / 2, hl = len / 2, hh = height / 2;
        const P = (lx, ly, lz) => [
            cx + lx * rx + lz * fx,
            y + ly,
            cz + lx * rz + lz * fz
        ];
        const a000 = P(-hw, -hh, -hl), a100 = P(hw, -hh, -hl);
        const a101 = P(hw, -hh, hl), a001 = P(-hw, -hh, hl);
        const a010 = P(-hw, hh, -hl), a110 = P(hw, hh, -hl);
        const a111 = P(hw, hh, hl), a011 = P(-hw, hh, hl);
        const faces = [
            [a001, a101, a111, a011],
            [a100, a000, a010, a110],
            [a101, a100, a110, a111],
            [a000, a001, a011, a010],
            [a011, a111, a110, a010],
            [a000, a100, a101, a001]
        ];
        for (const [a, b, c2, d] of faces) {
            pos.push(...a, ...b, ...c2, ...a, ...c2, ...d);
            for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
        }
    };

    const addPost = (cx, cy, cz, sx, sy, sz, c) => {
        const x0 = cx - sx / 2, x1 = cx + sx / 2;
        const y0 = cy - sy / 2, y1 = cy + sy / 2;
        const z0 = cz - sz / 2, z1 = cz + sz / 2;
        const faces = [
            [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
            [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
            [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
            [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
            [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]
        ];
        for (const [a, b, c2, d] of faces) {
            pos.push(...a, ...b, ...c2, ...a, ...c2, ...d);
            for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
        }
    };

    for (let z = route.zMin; z < route.zMax; z += RAIL_STEP) {
        const z1 = Math.min(route.zMax, z + RAIL_STEP);
        const a = route.atZ(z);
        const b = route.atZ(z1);
        for (const side of [-1, 1]) {
            const xA = a.x + side * offset;
            const xB = b.x + side * offset;
            const yMid = (a.y + b.y) / 2;
            for (const r of rails) {
                addBeam(xA, z, xB, z1, yMid + r.y, 0.12, r.h, railColour);
            }
            // Post every second step, standing on the rail base.
            if (Math.floor((z - route.zMin) / RAIL_STEP) % 2 === 0) {
                addPost(xA, a.y + 0.5, z + 0.5, 0.14, 1.05, 0.14, postColour);
            }
        }
    }

    return makeGeometry(pos, col, null);
}

export function buildStreetlights(route, style) {
    const road = style.road;
    const offset = road.width / 2 + road.shoulder + 1.1;
    const spacing = road.streetlightSpacing || 40;
    const poleColour = new THREE.Color(style.night ? 0x2a2f3a : 0x4c5257);
    const lampColour = new THREE.Color(road.streetlight || 0xffd9a0);

    const polePos = [], poleCol = [];
    const lampPos = [], lampCol = [];
    const poolPos = [], poolCol = [];

    const pushPool = (cx, cy, cz, radius, colour) => {
        const segments = 18;
        const mid = 0.45;
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);
            // Inner disc: full brightness at the lamp, 55% at the mid ring.
            poolPos.push(cx, cy, cz);
            poolPos.push(cx + c0 * radius * mid, cy, cz + s0 * radius * mid);
            poolPos.push(cx + c1 * radius * mid, cy, cz + s1 * radius * mid);
            poolCol.push(colour.r, colour.g, colour.b);
            poolCol.push(colour.r * 0.55, colour.g * 0.55, colour.b * 0.55);
            poolCol.push(colour.r * 0.55, colour.g * 0.55, colour.b * 0.55);
            // Outer falloff: mid ring to black rim.
            poolPos.push(cx + c0 * radius * mid, cy, cz + s0 * radius * mid);
            poolPos.push(cx + c1 * radius * mid, cy, cz + s1 * radius * mid);
            poolPos.push(cx + c1 * radius, cy, cz + s1 * radius);
            poolCol.push(colour.r * 0.55, colour.g * 0.55, colour.b * 0.55);
            poolCol.push(colour.r * 0.55, colour.g * 0.55, colour.b * 0.55);
            poolCol.push(0, 0, 0);
            poolPos.push(cx + c0 * radius * mid, cy, cz + s0 * radius * mid);
            poolPos.push(cx + c1 * radius, cy, cz + s1 * radius);
            poolPos.push(cx + c0 * radius, cy, cz + s0 * radius);
            poolCol.push(colour.r * 0.55, colour.g * 0.55, colour.b * 0.55);
            poolCol.push(0, 0, 0);
            poolCol.push(0, 0, 0);
        }
    };

    const box = (arrPos, arrCol, cx, cy, cz, sx, sy, sz, c) => {
        const x0 = cx - sx / 2, x1 = cx + sx / 2;
        const y0 = cy - sy / 2, y1 = cy + sy / 2;
        const z0 = cz - sz / 2, z1 = cz + sz / 2;
        const faces = [
            [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
            [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
            [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
            [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
            [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]
        ];
        for (const [a, b, c2, d] of faces) {
            arrPos.push(...a, ...b, ...c2, ...a, ...c2, ...d);
            for (let i = 0; i < 6; i++) arrCol.push(c.r, c.g, c.b);
        }
    };

    let side = 1;
    for (let z = route.zMin + 10; z < route.zMax; z += spacing) {
        const s = route.atZ(z);
        const x = s.x + side * offset;
        box(polePos, poleCol, x, s.y + 3.3, z, 0.16, 6.6, 0.16, poleColour);
        box(polePos, poleCol, x - side * 1.15, s.y + 6.55, z, 2.3, 0.12, 0.12, poleColour);
        box(lampPos, lampCol, x - side * 2.2, s.y + 6.4, z, 0.7, 0.16, 0.34, lampColour);
        if (style.night) {
            pushPool(x - side * 2.2, s.y + 0.09, z, spacing * 0.36, lampColour);
        }
        side *= -1;
    }

    return {
        poles: makeGeometry(polePos, poleCol, null),
        lamps: makeGeometry(lampPos, lampCol, null),
        pools: poolPos.length ? makeGeometry(poolPos, poolCol, null) : null
    };
}

function makeGeometry(pos, col, normal) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (normal) {
        const normals = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
            normals[i] = normal[0];
            normals[i + 1] = normal[1];
            normals[i + 2] = normal[2];
        }
        geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    } else {
        geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();
    return geo;
}
