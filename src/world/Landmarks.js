import * as THREE from 'three';
import { addSurfaceDetail } from './Visuals.js';

/**
 * Landmarks — twelve hand-authored point-of-interest structures for the four
 * baked worlds. Each landmark is built in road-local space (origin on the
 * verge, local -Z = direction of travel), merged into a handful of meshes and
 * parked outside the drivable corridor.
 *
 * Draw-call budget per world: 3 landmarks x (solid + glow + ground shadow) plus
 * a small number of animated pieces (windmill sails, beacon, monorail car).
 */

const S_BUILT = 2;
const S_GLASS = 4;
const S_OTHER = 5;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

let materials = null;

function getMaterials() {
    if (materials) return materials;

    const solid = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.16,
        side: THREE.DoubleSide
    });
    addSurfaceDetail(solid, 'landmark', { detail: 0.38 });
    solid.envMapIntensity = 0.9;

    const glow = new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        side: THREE.DoubleSide
    });

    const beam = new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });

    const shadow = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.24,
        depthWrite: false
    });

    materials = { solid, glow, beam, shadow };
    return materials;
}

/* ------------------------------------------------------------------ */
/* Geometry builder                                                    */
/* ------------------------------------------------------------------ */

class Builder {
    constructor() {
        this.pos = [];
        this.nrm = [];
        this.col = [];
        this.surf = [];
        this.wall = [];
        this.count = 0;
    }

    _vert(p, n, c, surface = S_BUILT, wall = 0) {
        this.pos.push(p.x, p.y, p.z);
        this.nrm.push(n.x, n.y, n.z);
        this.col.push(c.r, c.g, c.b);
        this.surf.push(surface);
        this.wall.push(wall);
    }

    quad(p0, p1, p2, p3, color, surface = S_BUILT, wall = 0) {
        const a = new THREE.Vector3().subVectors(p1, p0);
        const b = new THREE.Vector3().subVectors(p2, p0);
        const n = a.cross(b).normalize();
        for (const p of [p0, p1, p2, p0, p2, p3]) this._vert(p, n, color, surface, wall);
        this.count++;
    }

    tri(p0, p1, p2, color, surface = S_BUILT) {
        const a = new THREE.Vector3().subVectors(p1, p0);
        const b = new THREE.Vector3().subVectors(p2, p0);
        const n = a.cross(b).normalize();
        for (const p of [p0, p1, p2]) this._vert(p, n, color, surface, 0);
        this.count++;
    }

    /** Axis-aligned (or Y-rotated) box with simple face shading. */
    box(cx, cy, cz, sx, sy, sz, color, ry = 0, surface = S_BUILT) {
        const hx = sx / 2, hy = sy / 2, hz = sz / 2;
        const cos = Math.cos(ry), sin = Math.sin(ry);
        const P = (x, y, z) => new THREE.Vector3(
            cx + x * cos + z * sin,
            cy + y,
            cz - x * sin + z * cos
        );
        const x0 = -hx, x1 = hx, y0 = -hy, y1 = hy, z0 = -hz, z1 = hz;
        const top = color.clone().multiplyScalar(1.0);
        const side = color.clone().multiplyScalar(0.86);
        const side2 = color.clone().multiplyScalar(0.74);
        const bottom = color.clone().multiplyScalar(0.62);

        this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), top, surface);
        this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), bottom, surface);
        this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), side, surface, sy);
        this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), side, surface, sy);
        this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), side2, surface, sy);
        this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), side2, surface, sy);
    }

    /** Box rotated around Z (used by windmill sails). */
    boxRotZ(cx, cy, cz, sx, sy, sz, color, rz = 0) {
        const hx = sx / 2, hy = sy / 2, hz = sz / 2;
        const cos = Math.cos(rz), sin = Math.sin(rz);
        const P = (x, y, z) => new THREE.Vector3(
            cx + x * cos - y * sin,
            cy + x * sin + y * cos,
            cz + z
        );
        const x0 = -hx, x1 = hx, y0 = -hy, y1 = hy, z0 = -hz, z1 = hz;
        const top = color.clone();
        const side = color.clone().multiplyScalar(0.86);
        const side2 = color.clone().multiplyScalar(0.74);
        const bottom = color.clone().multiplyScalar(0.62);

        this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), top);
        this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), bottom);
        this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), side);
        this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), side);
        this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), side2);
        this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), side2);
    }

    /** Vertical cylinder/cone, base at baseY. */
    cylinder(cx, baseY, cz, rBottom, rTop, height, segments, color, surface = S_BUILT) {
        const y0 = baseY, y1 = baseY + height;
        const shade = [1.0, 0.92, 0.84, 0.78, 0.84, 0.92];
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);
            const n0 = new THREE.Vector3(c0, 0, s0);
            const n1 = new THREE.Vector3(c1, 0, s1);
            const c = color.clone().multiplyScalar(shade[i % shade.length]);

            this.quad(
                new THREE.Vector3(cx + c0 * rBottom, y0, cz + s0 * rBottom),
                new THREE.Vector3(cx + c1 * rBottom, y0, cz + s1 * rBottom),
                new THREE.Vector3(cx + c1 * rTop, y1, cz + s1 * rTop),
                new THREE.Vector3(cx + c0 * rTop, y1, cz + s0 * rTop),
                c, surface
            );

            if (rTop > 0) {
                const capC = color.clone().multiplyScalar(1.0);
                this.tri(
                    new THREE.Vector3(cx + c0 * rTop, y1, cz + s0 * rTop),
                    new THREE.Vector3(cx + c1 * rTop, y1, cz + s1 * rTop),
                    new THREE.Vector3(cx, y1, cz),
                    capC, surface
                );
            } else {
                void n0; void n1;
            }
        }
    }

    cone(cx, baseY, cz, radius, height, segments, color, surface = S_BUILT) {
        this.cylinder(cx, baseY, cz, radius, 0, height, segments, color, surface);
    }

    disc(cx, y, cz, radius, segments, color) {
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            const p0 = new THREE.Vector3(cx, y, cz);
            const p1 = new THREE.Vector3(cx + Math.cos(a0) * radius, y, cz + Math.sin(a0) * radius);
            const p2 = new THREE.Vector3(cx + Math.cos(a1) * radius, y, cz + Math.sin(a1) * radius);
            this.tri(p0, p1, p2, color, S_OTHER);
        }
    }

    build() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        geo.setAttribute('aSurface', new THREE.Float32BufferAttribute(this.surf, 1));
        geo.setAttribute('aWallHeight', new THREE.Float32BufferAttribute(this.wall, 1));
        geo.computeBoundingSphere();
        return geo;
    }
}

const C = (hex) => new THREE.Color(hex);

function meshFromBuilder(builder, material, name) {
    if (!builder.pos.length) return null;
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function addShadow(landmark, radius, x = 0, z = 0) {
    landmark.shadow.disc(x, 0.035, z, radius, 16, C(0x000000));
}

/* ------------------------------------------------------------------ */
/* NEO CITY                                                            */
/* ------------------------------------------------------------------ */

function buildCasino() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const gold = C(0xd8a63a), goldDark = C(0x7a5a1d), stone = C(0x1a1e2a);
    const neonPink = C(0xff2d7a), neonCyan = C(0x22e6ff), white = C(0xf5f1df);

    solid.box(0, 2, 0, 40, 4, 28, stone);
    solid.box(0, 15, 0, 30, 22, 20, C(0x111722));
    solid.box(0, 27, 0, 22, 3, 16, goldDark);

    // Gold entrance colonnade.
    for (let i = -2; i <= 2; i++) {
        solid.cylinder(i * 5.2, 4, 13.4, 0.7, 0.55, 9, 8, gold);
    }
    solid.box(0, 13.6, 13.4, 30, 1.8, 2.2, gold);
    solid.box(0, 8, 13.6, 34, 0.5, 0.5, gold);

    // Neon façade bands and marquee.
    for (let i = 0; i < 4; i++) {
        glow.box(0, 6 + i * 4.6, 10.15, 28, 0.28, 0.18, i % 2 ? neonCyan : neonPink);
    }
    glow.box(0, 12.2, 14.6, 18, 1.6, 0.25, neonPink);
    glow.box(0, 29.2, 8.2, 16, 0.9, 0.25, neonCyan);

    // Dice marquee (animated as one piece).
    const dice = new Builder();
    const die = (x, z, color) => {
        dice.box(x, 32.5, z, 5.2, 5.2, 5.2, color);
        const pips = [-1.4, 0, 1.4];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if ((i + j) % 2 === 0) {
                    dice.box(x + pips[i] * 0.6, 32.5 + pips[j] * 0.6, z + 2.62, 0.55, 0.55, 0.18, C(0x161616));
                }
            }
        }
    };
    die(-6, 2, white);
    die(6, -1, C(0xfff0b0));

    // Slot signboards (animated).
    const slots = new Builder();
    for (let i = -1; i <= 1; i++) {
        slots.box(i * 5.2, 37.5, 1, 3.6, 8.5, 0.6, i === 0 ? neonCyan : neonPink);
        slots.box(i * 5.2, 37.5, 1.4, 2.8, 7.4, 0.12, C(0x0b0f17));
    }

    addShadow({ shadow }, 24);
    return {
        solid, glow, shadow,
        animations: [
            { type: 'spinY', builder: dice, name: 'casino_dice', speed: 0.18, position: [0, 0, 0], material: 'solid' },
            { type: 'spinY', builder: slots, name: 'casino_slots', speed: 0.55, position: [0, 0, 0], amplitude: 0.4 }
        ],
        footprint: 22
    };
}

function buildArena() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const shell = C(0x1b2433), metal = C(0x39465c), neon = C(0x27f0ff), magenta = C(0xff2d9a);

    solid.cylinder(0, 2, 0, 30, 26, 13, 20, shell);
    solid.cylinder(0, 15, 0, 26, 26, 2.2, 20, metal);
    solid.box(0, 5, -22, 18, 8, 5, metal);

    for (let i = 0; i < 20; i += 2) {
        const a = (i / 20) * Math.PI * 2;
        glow.box(Math.cos(a) * 26.2, 14.2, Math.sin(a) * 26.2, 2.6, 0.28, 0.35, neon, -a);
    }
    glow.box(0, 18, -22, 15, 2.6, 0.3, magenta);

    // Two volumetric searchlight cones, animated independently.
    const beams = [];
    for (const side of [-1, 1]) {
        const cone = new THREE.ConeGeometry(4.2, 38, 12, 1, true);
        const mesh = new THREE.Mesh(cone, getMaterials().beam);
        mesh.position.set(side * 12, 34, 0);
        mesh.rotation.x = Math.PI;
        mesh.rotation.z = side * 0.16;
        mesh.renderOrder = 3;
        beams.push(mesh);
    }

    addShadow({ shadow }, 32);
    return {
        solid, glow, shadow,
        extras: beams,
        animations: beams.map((mesh, i) => ({
            type: 'beamSway', object: mesh, base: i === 0 ? 0.16 : -0.16,
            speed: 0.55, phase: i * 1.7, amplitude: 0.3
        })),
        footprint: 32
    };
}

function buildMonorail() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const concrete = C(0x303845), metal = C(0x556172), neon = C(0x2ef2ff);

    for (let z = -80; z <= 80; z += 20) {
        solid.box(0, 5, z, 2.2, 10, 2.2, concrete);
    }
    solid.box(0, 10.4, 0, 4.2, 0.9, 170, metal);
    solid.box(0, 11.2, 0, 1.2, 0.7, 170, concrete);

    for (let z = -80; z <= 80; z += 8) {
        glow.box(0, 10.75, z, 0.22, 0.16, 3.4, neon);
    }

    const car = new Builder();
    car.box(0, 13.4, 0, 4.4, 2.8, 16, C(0x0d1420));
    car.box(0, 13.9, 0, 4.5, 1.2, 14.5, C(0x8fe8ff), 0, S_GLASS);
    car.box(0, 12.4, 0, 4.7, 0.4, 15, neon);
    car.box(0, 14.9, 0, 3.2, 0.25, 10, C(0xff3d9a));

    addShadow({ shadow }, 12);
    return {
        solid, glow, shadow,
        animations: [{
            type: 'patrolZ', builder: car, name: 'monorail_car',
            min: -82, max: 82, speed: 18, phase: 0, y: 0
        }],
        footprint: 8
    };
}

/* ------------------------------------------------------------------ */
/* MOUNTAIN PASS                                                       */
/* ------------------------------------------------------------------ */

function buildPagoda() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const stone = C(0x6b665c), red = C(0x9c2f26), jade = C(0x2f5a3a), gold = C(0xd2a94a);
    const blossom = C(0xf2a7bd), bark = C(0x4a3628);

    // Cliff plinth.
    solid.box(0, 5, 0, 30, 10, 30, stone);
    solid.box(0, 10.2, 0, 24, 1.2, 24, C(0x807a6d));

    let base = 10.8;
    for (let i = 0; i < 4; i++) {
        const w = 18 - i * 4;
        solid.box(0, base + 2.2, 0, w, 4.4, w, red);
        solid.box(0, base + 0.4, 0, w + 2, 0.5, w + 2, C(0x5e2420));
        // Roof pyramid, slightly overhanging.
        solid.cone(0, base + 4.4, 0, (w + 7) / Math.SQRT2, 2.6, 4, jade);
        // Gold eave line.
        glow.box(0, base + 4.55, 0, (w + 7) * 0.72, 0.16, (w + 7) * 0.72, gold);
        base += 6.4;
    }
    solid.cylinder(0, base, 0, 0.5, 0.2, 4, 8, gold);

    // Cherry trees flanking the temple.
    const tree = (x, z, s) => {
        solid.cylinder(x, 10.2, z, 0.45 * s, 0.3 * s, 4.2 * s, 7, bark);
        for (let k = 0; k < 3; k++) {
            solid.cone(x + (k - 1) * 1.3 * s, 13.5 * s + k * 0.5, z + (k % 2) * 1.2, 2.3 * s, 2.8 * s, 6, blossom);
        }
    };
    tree(-16, 9, 1.1);
    tree(16, -8, 0.95);
    tree(-14, -12, 0.8);

    addShadow({ shadow }, 26);
    return { solid, glow, shadow, animations: [], footprint: 22 };
}

function buildAvalancheGallery() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const concrete = C(0x7a7a72), dark = C(0x4b4d49), strip = C(0xffd9a0);
    const zLen = 70;

    // Twin walls and a heavy roof, opening toward the road (-X side).
    solid.box(-2, 4, 0, 1.8, 8, zLen, concrete);
    solid.box(20, 4, 0, 1.8, 8, zLen, concrete);
    solid.box(9, 8.6, 0, 24, 1.8, zLen, dark);
    solid.box(9, 9.8, 0, 26, 0.8, zLen, concrete);

    for (let z = -30; z <= 30; z += 15) {
        solid.box(0, 3, z, 2.4, 6, 2.4, dark);
        solid.box(9, 7.4, z, 22, 0.6, 0.8, concrete);
    }
    for (let z = -32; z <= 32; z += 8) {
        glow.box(9, 7.45, z, 18, 0.16, 0.35, strip);
    }

    addShadow({ shadow }, 12, 9, 0);
    return { solid, glow, shadow, animations: [], footprint: 16 };
}

function buildSuspensionBridge() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const steel = C(0x59636b), deck = C(0x3d444a), cable = C(0x9aa4aa), light = C(0xfff0c0);

    for (const z of [-42, 42]) {
        solid.box(0, 16, z, 7, 32, 5, steel);
        solid.box(0, 32, z, 10, 1.2, 7, deck);
        glow.box(0, 23, z + 2.7, 0.5, 16, 0.2, light);
        glow.box(0, 23, z - 2.7, 0.5, 16, 0.2, light);
    }
    solid.box(0, 14, 0, 9, 1.1, 110, deck);
    solid.box(0, 14.7, 0, 1.2, 0.5, 110, steel);

    // Main cables: straight segments approximated with slender boxes in YZ.
    for (const side of [-1, 1]) {
        const x = side * 4.2;
        solid.box(x, 24, 0, 0.35, 0.35, 92, cable);
        for (let z = -40; z <= 40; z += 8) {
            const h = 14.5 + (1 - Math.abs(z) / 48) * 8;
            solid.box(x, h, z, 0.16, h - 14.2, 0.16, cable);
        }
    }

    addShadow({ shadow }, 30);
    return { solid, glow, shadow, animations: [], footprint: 26 };
}

/* ------------------------------------------------------------------ */
/* COASTAL HIGHWAY                                                     */
/* ------------------------------------------------------------------ */

function buildMarina(waterY) {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const stone = C(0xc9c2ae), wood = C(0x6b4c32), teal = C(0x1f7f8f), white = C(0xf2f4f0);
    const base = waterY ?? 0;

    solid.box(0, 2, 0, 52, 4, 18, stone);
    solid.box(0, 1.2, 9, 52, 2.4, 4, C(0xe0d8c4));

    // Piers reaching into the water (+Z side).
    for (const x of [-18, -6, 6, 18]) {
        solid.box(x, 0.9, 18, 3.2, 0.8, 20, wood);
    }

    // Moored yachts, merged into one bobbing group.
    const yachts = new Builder();
    const yacht = (x, z, s) => {
        yachts.box(x, 1.3 * s, z, 3.4 * s, 1.4 * s, 10 * s, white);
        yachts.box(x, 2.6 * s, z - 1.4 * s, 2.4 * s, 1.6 * s, 4.6 * s, C(0xdfe8ea), 0, S_GLASS);
        yachts.box(x, 2.3 * s, z + 2.6 * s, 2.9 * s, 0.4 * s, 2.4 * s, teal);
        yachts.cylinder(x, 3.4 * s, z - 1.5 * s, 0.12 * s, 0.08 * s, 8 * s, 6, C(0xd8dde0));
    };
    yacht(-18, 20, 1.0);
    yacht(-6, 24, 1.15);
    yacht(6, 20, 0.9);
    yacht(18, 23, 1.05);

    for (const z of [16, 22, 28]) {
        glow.box(0, 0.15, z, 46, 0.12, 0.3, C(0x5fe8d8));
    }

    addShadow({ shadow }, 30);
    return {
        solid, glow, shadow,
        animations: [{ type: 'bob', builder: yachts, name: 'marina_yachts', base, amp: 0.14, speed: 0.8 }],
        footprint: 28,
        baseY: waterY ?? undefined
    };
}

function buildLighthouse() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const white = C(0xf1efe8), red = C(0xb63a2f), stone = C(0x8c887d), lantern = C(0xffe9a8);

    solid.cylinder(0, 0, 0, 8, 7, 4, 14, stone);
    solid.cylinder(0, 4, 0, 4.2, 3.2, 20, 14, white);
    for (let i = 0; i < 3; i++) {
        solid.cylinder(0, 8 + i * 5.4, 0, 3.9 - i * 0.25, 3.6 - i * 0.25, 1.8, 14, red);
    }
    solid.cylinder(0, 24, 0, 3.0, 3.0, 1.2, 14, C(0x3b3f44));
    solid.cylinder(0, 25.2, 0, 2.4, 2.4, 3.4, 10, lantern, S_GLASS);
    solid.cone(0, 28.6, 0, 3.0, 2.4, 10, red);

    // Rotating beacon: a long horizontal cone pivoting at the lantern.
    const beacon = new THREE.ConeGeometry(4.5, 30, 12, 1, true);
    const cone = new THREE.Mesh(beacon, getMaterials().beam);
    cone.position.set(15, 27, 0);
    cone.rotation.z = Math.PI / 2;
    cone.renderOrder = 3;

    solid.box(-9, 2, 5, 10, 4, 8, white);
    solid.cone(-9, 4, 5, 5.4, 1.6, 4, red);

    addShadow({ shadow }, 14);
    return {
        solid, glow, shadow,
        extras: [cone],
        animations: [{ type: 'spinY', object: cone, speed: 1.4 }],
        footprint: 24
    };
}

function buildVillas() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const white = C(0xf0f1ec), glass = C(0x9fd7e2), teal = C(0x2fbcc4), sand = C(0xd8cbb0);
    const green = C(0x3e7c4a), bark = C(0x5a4632);

    solid.box(0, 1, 0, 64, 2, 26, sand);

    for (let i = -1; i <= 1; i++) {
        const x = i * 20;
        const z = i === 0 ? -2 : 2;
        solid.box(x, 3, z, 15, 4, 13, white);
        solid.box(x, 7.2, z, 13.4, 4.2, 11.2, glass, 0, S_GLASS);
        solid.box(x, 9.6, z, 16, 0.7, 15, white);
        solid.box(x, 10.6, z - 1, 4, 1.4, 5, glass, 0, S_GLASS);

        // Infinity pool on the sea side.
        solid.box(x, 1.5, 9.5, 12, 1.2, 5.5, C(0xe8f6f7));
        glow.box(x, 2.15, 9.5, 11.4, 0.12, 4.8, teal);
        glow.box(x, 0.55, 12.3, 12.2, 0.12, 0.2, C(0xbff8ff));

        // Palm.
        solid.cylinder(x + 8.5, 2, 6, 0.35, 0.26, 5.5, 6, bark);
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            solid.box(x + 8.5 + Math.cos(a) * 1.8, 7.4, 6 + Math.sin(a) * 1.8, 3.8, 0.28, 0.8, green, -a);
        }
    }

    addShadow({ shadow }, 34);
    return { solid, glow, shadow, animations: [], footprint: 32 };
}

/* ------------------------------------------------------------------ */
/* COUNTRYSIDE                                                         */
/* ------------------------------------------------------------------ */

function buildWindmills() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const brick = C(0x8a6a4a), cap = C(0x3a2c22), wood = C(0x6d5438), sailC = C(0xe8e2cf);

    const sailAnimations = [];
    [-26, 0, 26].forEach((x, index) => {
        const z = index === 1 ? -2 : 2;
        solid.cylinder(x, 0, z, 5.4, 3.4, 15, 12, brick);
        solid.cone(x, 15, z, 4.2, 3.2, 10, cap);
        solid.box(x, 10, z + 3.6, 2.8, 2.4, 1.8, wood);

        const sails = new Builder();
        for (let k = 0; k < 4; k++) {
            const rad = (k * Math.PI) / 2;
            sails.boxRotZ(0, 5.6, 0, 1.15, 11, 0.35, sailC, rad);
            sails.boxRotZ(0, 10.6, 0, 4.6, 0.45, 0.3, wood, rad);
        }
        sailAnimations.push({
            type: 'spinZ', builder: sails, name: `windmill_sails_${index}`,
            speed: 0.45 + index * 0.12,
            position: [x, 16.2, z + 4.7],
            material: 'solid'
        });
    });

    addShadow({ shadow }, 34);
    return { solid, glow, shadow, animations: sailAnimations, footprint: 34 };
}

function buildFarm() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const red = C(0x9c3d2e), white = C(0xeee9dc), wood = C(0x6a4e33), roof = C(0x4a3a2e);
    const green = C(0x6c7a4b), silo = C(0xbfb7a2);

    solid.box(0, 5, 0, 22, 10, 28, red);
    solid.cone(0, 10, 0, 15.5, 4.4, 4, roof);
    solid.box(0, 5, 14.2, 6, 7, 0.4, white);
    solid.box(0, 6.5, 14.4, 3, 0.4, 0.2, white);

    // Silo.
    solid.cylinder(16, 0, -4, 4.4, 4.4, 18, 12, silo);
    solid.cone(16, 18, -4, 4.8, 3.2, 12, C(0x8c8779));

    // Farmhouse.
    solid.box(-19, 4, 2, 13, 8, 12, white);
    solid.cone(-19, 8, 2, 9.5, 3.2, 4, roof);
    solid.box(-19, 2.6, 8.2, 3, 3, 0.3, wood);

    // Post-and-rail fence across the front.
    for (let x = -32; x <= 32; x += 4) {
        solid.box(x, 0.9, 16, 0.28, 1.8, 0.28, wood);
        solid.box(x + 2, 1.25, 16, 4.2, 0.18, 0.18, wood);
    }
    solid.box(0, 0.55, 16, 68, 1.2, 0.12, green);

    addShadow({ shadow }, 34);
    return { solid, glow, shadow, animations: [], footprint: 36 };
}

function buildCastle() {
    const solid = new Builder(), glow = new Builder(), shadow = new Builder();
    const stone = C(0x777468), dark = C(0x4b4941), moss = C(0x5f6b45);
    const banner = C(0x8f2f3f);

    // Hilltop.
    solid.cylinder(0, 0, 0, 30, 22, 10, 18, moss);
    solid.cylinder(0, 10, 0, 22, 20, 2, 18, stone);
    solid.box(0, 12, 0, 32, 2, 28, dark);

    // Broken curtain walls.
    solid.box(0, 16, -12, 26, 10, 2.4, stone);
    solid.box(-12, 16, 2, 2.4, 10, 22, stone);
    solid.box(12, 16, 2, 2.4, 7, 16, stone);
    solid.box(4, 16, 12, 14, 8, 2.4, stone);

    // Towers with battlements.
    for (const [x, z, h] of [[-11, -9, 20], [10, -10, 16], [10, 8, 12]]) {
        solid.cylinder(x, 14, z, 4.2, 3.8, h, 10, stone);
        solid.cylinder(x, 14 + h, z, 4.8, 4.8, 1.2, 10, dark);
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            solid.box(x + Math.cos(a) * 4.2, 15 + h, z + Math.sin(a) * 4.2, 1.1, 1.4, 1.1, stone);
        }
    }

    // Arched window recesses and banner.
    solid.box(0, 16, 13.2, 2, 4, 0.4, C(0x1c1b19));
    solid.box(0, 16, -13.3, 2, 4, 0.4, C(0x1c1b19));
    solid.box(-11, 26, -9, 0.12, 6, 3.2, banner);
    solid.box(-11, 23.2, -9, 0.2, 0.2, 3.2, dark);

    addShadow({ shadow }, 34);
    return { solid, glow, shadow, animations: [], footprint: 32 };
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

function buildForWorld(worldId, route, manifest) {
    const waterLevel = manifest && manifest.waterLevel;
    const routeMinY = route.points.reduce((min, p) => Math.min(min, p.y), Infinity);
    const waterY = (waterLevel !== null && waterLevel !== undefined && waterLevel < routeMinY - 1.5)
        ? waterLevel : null;

    switch (worldId) {
        case 'neo_tazader':
            return [buildCasino(), buildArena(), buildMonorail()];
        case 'chiang_tung':
            return [buildPagoda(), buildAvalancheGallery(), buildSuspensionBridge()];
        case 'curitiba':
            return [buildMarina(waterY), buildLighthouse(), buildVillas()];
        case 'nantwich':
            return [buildWindmills(), buildFarm(), buildCastle()];
        default:
            return [];
    }
}

function placeLandmark(landmark, route, fraction, side, index, road) {
    const span = route.zMax - route.zMin;
    const z = route.zMax - span * fraction;
    const s = route.atZ(z);
    const footprint = landmark.footprint || 16;
    const lateral = road.width / 2 + road.shoulder + (road.sidewalk || 0) + footprint + 8;

    const heading = s.heading;
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);

    const origin = new THREE.Group();
    origin.name = `landmark_${index}`;
    origin.position.set(
        s.x + rightX * side * lateral,
        landmark.baseY ?? s.y,
        z + rightZ * side * lateral
    );
    origin.rotation.y = heading;
    return origin;
}

export function buildLandmarks(route, style, manifest) {
    if (!route || route.empty) return null;

    const materials = getMaterials();
    const root = new THREE.Group();
    root.name = 'landmarks';
    const animations = [];
    const parts = buildForWorld(style.id, route, manifest || {});

    const fractions = [0.18, 0.5, 0.8];
    parts.forEach((part, index) => {
        const side = index % 2 === 0 ? 1 : -1;
        const origin = placeLandmark(part, route, fractions[index], side, index, style.road);
        origin.userData.landmark = style.id;

        const solid = meshFromBuilder(part.solid, materials.solid, `landmark_solid_${index}`);
        if (solid) origin.add(solid);
        const glow = meshFromBuilder(part.glow, materials.glow, `landmark_glow_${index}`);
        if (glow) origin.add(glow);
        const shadow = meshFromBuilder(part.shadow, materials.shadow, `landmark_shadow_${index}`);
        if (shadow) { shadow.castShadow = false; shadow.receiveShadow = false; origin.add(shadow); }

        for (const extra of part.extras || []) origin.add(extra);

        for (const anim of part.animations || []) {
            if (anim.builder) {
                const mat = anim.material === 'solid' ? materials.solid : materials.glow;
                const mesh = meshFromBuilder(anim.builder, mat, anim.name);
                if (!mesh) continue;
                if (anim.position) mesh.position.fromArray(anim.position);
                origin.add(mesh);
                animations.push({ ...anim, object: mesh, baseY: mesh.position.y, baseZ: mesh.position.z });
            } else if (anim.object) {
                origin.add(anim.object);
                animations.push({ ...anim, baseY: anim.object.position.y });
            }
        }

        root.add(origin);
    });

    const group = new THREE.Group();
    group.name = 'landmark_root';
    group.add(root);

    return {
        group,
        update(delta) {
            this.time = (this.time || 0) + delta;
            const t = this.time;
            for (const anim of animations) {
                const obj = anim.object;
                if (!obj) continue;
                switch (anim.type) {
                    case 'spinY':
                        obj.rotation.y += (anim.speed || 0.5) * delta;
                        if (anim.amplitude) obj.rotation.y = Math.sin(t * anim.speed) * anim.amplitude;
                        break;
                    case 'spinZ':
                        obj.rotation.z += (anim.speed || 0.5) * delta;
                        break;
                    case 'patrolZ': {
                        const span = anim.max - anim.min;
                        const pos = ((t * anim.speed + anim.phase) % span + span) % span;
                        obj.position.z = anim.min + pos;
                        break;
                    }
                    case 'bob':
                        obj.position.y = (anim.baseY ?? 0) + Math.sin(t * anim.speed) * anim.amp;
                        obj.rotation.z = Math.sin(t * anim.speed * 0.7) * 0.02;
                        break;
                    case 'beamSway':
                        obj.rotation.z = anim.base + Math.sin(t * anim.speed + anim.phase) * anim.amplitude;
                        obj.rotation.x = Math.cos(t * anim.speed * 0.8 + anim.phase) * anim.amplitude * 0.6;
                        break;
                    default:
                        break;
                }
            }
            if (materials.beam) {
                materials.beam.opacity = 0.12 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.4));
            }
        },
        dispose() {
            root.traverse((obj) => {
                if (obj.isMesh) obj.geometry.dispose();
            });
        }
    };
}
