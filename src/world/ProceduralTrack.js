import * as THREE from 'three';

/**
 * ProceduralTrack.js — deterministic math, biome presets and geometry builders
 * for the APEX streaming voxel world.
 *
 * Coordinate contract:
 *   forward is -Z, the car spawns on the road centreline.
 *   curveX(z) and roadElevation(z) are pure functions of Z, so every chunk
 *   boundary agrees exactly and getTrackHeight() is synchronous and cheap.
 */

export const CHUNK_LENGTH = 80;
export const ROAD_SAMPLE_STEP = 4;
export const TERRAIN_CELL = 8;

/* ------------------------------------------------------------------ */
/* Track maths                                                         */
/* ------------------------------------------------------------------ */

export function curveX(z) {
    return Math.sin(z * 0.015) * 35 + Math.cos(z * 0.005) * 15;
}

export function curveSlope(z) {
    return Math.cos(z * 0.015) * 35 * 0.015 - Math.sin(z * 0.005) * 15 * 0.005;
}

export function roadElevation(z) {
    return Math.sin(z * 0.02) * 8 + Math.cos(curveX(z) * 0.02) * 4;
}

/** Heading in radians for the canonical -Z forward convention. */
export function roadHeading(z) {
    return Math.atan2(curveSlope(z), 1);
}

export function trackFrame(z) {
    const dx = curveSlope(z);
    const inv = 1 / Math.hypot(dx, 1);
    return {
        x: -dx * inv,
        z: -inv,
        nx: inv,
        nz: -dx * inv,
        yaw: Math.atan2(dx, 1),
        inv
    };
}

export function getRoadBoundsFor(z, biome) {
    const width = biome.roadWidth;
    const centerX = curveX(z);
    const f = trackFrame(z);
    return {
        z,
        centerX,
        leftX: centerX - width / 2,
        rightX: centerX + width / 2,
        width,
        y: roadElevation(z),
        heading: f.yaw,
        tangentX: f.x,
        tangentZ: f.z,
        normalX: f.nx,
        normalZ: f.nz,
        shoulder: biome.shoulder
    };
}

function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
}

/**
 * Height of the drivable surface. On the asphalt/shoulder this is the exact
 * spline elevation; outside it follows the stepped voxel terrain.
 */
export function terrainHeightAt(x, z, biome) {
    const centerX = curveX(z);
    const roadY = roadElevation(z);
    const corridor = biome.roadWidth / 2 + biome.shoulder;
    const lateral = Math.abs(x - centerX);

    if (lateral <= corridor + 1.0) return roadY + 0.04;

    const outside = lateral - corridor;
    const wave =
        Math.sin(z * 0.037 + Math.sin(x * 0.011) * 2.2) * 2.8 +
        Math.cos(x * 0.029 - z * 0.013) * 2.1;

    let raw;

    if (biome.ocean && x > centerX) {
        // Coastal drop into the sea on the +X flank.
        const t = smoothstep(outside / 58);
        raw = roadY - 0.45 - t * (roadY - biome.ocean.level + 1.2);
        raw += wave * 0.12 * (1 - t * 0.5);
    } else {
        const reach = biome.terrainReach || 150;
        const rise = Math.pow(Math.min(1, outside / reach), 1.15) * biome.hillHeight;
        raw = roadY - 0.55 + rise + wave * (biome.roughness || 0.6);
    }

    const step = biome.terrainStep || 2.0;
    return Math.floor(raw / step) * step;
}

/**
 * Ground height that matches the *rendered* terrain mesh.
 * The terrain is built from 8 m cell centres, so props sampled at arbitrary
 * positions would otherwise float or sink by up to a couple of steps.
 */
export function groundHeightAt(x, z, biome) {
    const cell = TERRAIN_CELL;
    const corridor = biome.roadWidth / 2 + biome.shoulder;
    // Mesh rows are centred on z ≡ cell/2 (mod cell), independent of chunk.
    const zc = cell * Math.round((z - cell * 0.5) / cell) + cell * 0.5;
    const lateral = x - curveX(zc);
    const lat = Math.abs(lateral);
    if (lat <= corridor + 1.0) return terrainHeightAt(x, zc, biome);
    const col = Math.floor((lat - corridor) / cell);
    const off = corridor + (col + 0.5) * cell;
    const xc = curveX(zc) + Math.sign(lateral) * off;
    return terrainHeightAt(xc, zc, biome);
}

/* ------------------------------------------------------------------ */
/* Biome presets                                                       */
/* ------------------------------------------------------------------ */

export const BIOMES = {
    neo_tazader: {
        id: 'neo_tazader',
        label: 'NEO-TAZADER',
        raceName: 'NEO-TAZADER NIGHT RUN',
        sky: 0x070b16,
        fog: 0x0b1224,
        fogDensity: 0.009,
        exposure: 1.2,
        bloomThreshold: 0.62,
        hemiSky: 0x7590ff,
        hemiGround: 0x120a1a,
        hemiIntensity: 1.1,
        sunColor: 0x9fb7ff,
        sunIntensity: 1.15,
        roadWidth: 30,
        shoulder: 3.0,
        roadColor: 0x15171d,
        shoulderColor: 0x282b33,
        lineColor: 0xf2c94c,
        edgeColor: 0xd7dde6,
        railColor: 0x3a4558,
        poleColor: 0x3d4658,
        terrainWidth: 210,
        terrainReach: 150,
        hillHeight: 18,
        roughness: 0.65,
        terrainStep: 2.2,
        terrainPalette: ['#10141b', '#191d27', '#222736', '#2b3040'],
        terrainWallColor: '#0b0e14',
        snowLine: null,
        buildingCities: ['tazader', 'greater_kc'],
        buildingChance: 0.76,
        buildingSpacing: 34,
        buildingSetback: 26,
        templateChance: 0.85,
        buildingWidth: 26,
        maxBuildingHeight: 130,
        buildingStyle: 'cyber',
        buildingPalette: ['#1c2436', '#242d42', '#2f3a52', '#161c2a'],
        windowColors: ['#55e6ff', '#ff4fd8', '#ffe066', '#7c9dff'],
        windowBandStep: 8,
        storefrontColor: 0xff4fd8,
        streetlightSpacing: 28,
        streetlightColor: 0x66f0ff,
        glowStripe: true,
        treeChance: 0.1,
        treeSpacing: 26,
        treeSpread: 55,
        treeKinds: ['neon'],
        treePalette: ['#2f5d5a', '#334a63'],
        skyline: true,
        ocean: null,
        rocks: false,
        foundation: '#0e131d'
    },

    chiang_tung: {
        id: 'chiang_tung',
        label: 'CHIANG TUNG',
        raceName: 'CHIANG TUNG MIST PASS',
        sky: 0x9fb9c8,
        fog: 0xc9dad8,
        fogDensity: 0.0048,
        exposure: 1.22,
        bloomThreshold: 0.9,
        hemiSky: 0xdfeae8,
        hemiGround: 0x3b4630,
        hemiIntensity: 1.0,
        sunColor: 0xffe0b0,
        sunIntensity: 1.9,
        roadWidth: 22,
        shoulder: 2.2,
        roadColor: 0x30302d,
        shoulderColor: 0x4b4a40,
        lineColor: 0xf1c40f,
        edgeColor: 0xe8e8dd,
        railColor: 0x6b6454,
        poleColor: 0x4a3d30,
        terrainWidth: 230,
        terrainReach: 130,
        hillHeight: 46,
        roughness: 1.15,
        terrainStep: 2.4,
        terrainPalette: ['#3a5236', '#475f3d', '#567147', '#668253', '#79956a'],
        terrainWallColor: '#26351f',
        snowLine: 52,
        snowColor: '#e8efe9',
        buildingCities: ['chiang_tung'],
        buildingChance: 0.3,
        buildingSpacing: 52,
        buildingSetback: 32,
        templateChance: 0.32,
        buildingWidth: 21,
        maxBuildingHeight: 55,
        buildingStyle: 'pagoda',
        buildingPalette: ['#d9c4a0', '#c2a278', '#8f5b42', '#6f4636'],
        windowColors: ['#ffb45e', '#ffd79a'],
        windowBandStep: 7,
        storefrontColor: 0xffa33c,
        streetlightSpacing: 34,
        streetlightColor: 0xffb45e,
        glowStripe: false,
        treeChance: 0.62,
        treeSpacing: 13,
        treeSpread: 52,
        treeKinds: ['cherry', 'bamboo', 'pine'],
        treePalette: ['#e8a6bb', '#d88ba6', '#3f6b3a', '#5b7f43', '#7f9b55'],
        skyline: true,
        ocean: null,
        rocks: true,
        foundation: '#3b332b'
    },

    curitiba: {
        id: 'curitiba',
        label: 'CURITIBA',
        raceName: 'CURITIBA COASTAL SPRINT',
        sky: 0x86c4e8,
        fog: 0xbcdcec,
        fogDensity: 0.0038,
        exposure: 1.22,
        bloomThreshold: 0.92,
        hemiSky: 0xdff2ff,
        hemiGround: 0x4c5a3a,
        hemiIntensity: 1.05,
        sunColor: 0xfff4d6,
        sunIntensity: 2.35,
        roadWidth: 26,
        shoulder: 2.6,
        roadColor: 0x24272c,
        shoulderColor: 0x34373c,
        lineColor: 0xf5c542,
        edgeColor: 0xf0f3f5,
        railColor: 0x8b97a3,
        poleColor: 0x707b84,
        terrainWidth: 220,
        terrainReach: 120,
        hillHeight: 13,
        roughness: 0.55,
        terrainStep: 1.8,
        terrainPalette: ['#628b4c', '#71995a', '#82a868', '#d7c08a', '#c5ad79'],
        terrainWallColor: '#3c5a32',
        snowLine: null,
        buildingCities: ['curitiba'],
        buildingChance: 0.54,
        buildingSpacing: 40,
        buildingSetback: 22,
        templateChance: 0.75,
        buildingWidth: 23,
        maxBuildingHeight: 46,
        buildingStyle: 'coastal',
        buildingPalette: ['#f2c14e', '#ef8354', '#4f9da6', '#e56b6f', '#f7e3af'],
        windowColors: ['#fff1c9', '#8be0ff', '#ffd166'],
        windowBandStep: 6,
        storefrontColor: 0x8be0ff,
        streetlightSpacing: 32,
        streetlightColor: 0xfff4cf,
        glowStripe: false,
        treeChance: 0.55,
        treeSpacing: 15,
        treeSpread: 50,
        treeKinds: ['palm', 'palm', 'pine'],
        treePalette: ['#2f7a45', '#3f8f51', '#5aa65d'],
        skyline: false,
        ocean: { level: -8, color: 0x1f93b0 },
        rocks: false,
        foundation: '#a58c62'
    },

    nantwich: {
        id: 'nantwich',
        label: 'NANTWICH / ICELAND',
        raceName: 'NANTWICH HIGHLAND CLASH',
        sky: 0x5d9fd6,
        fog: 0xc9dceb,
        fogDensity: 0.0027,
        exposure: 1.32,
        bloomThreshold: 0.95,
        hemiSky: 0xdcecff,
        hemiGround: 0x6d6459,
        hemiIntensity: 1.45,
        sunColor: 0xfff6e0,
        sunIntensity: 2.2,
        roadWidth: 18,
        shoulder: 2.0,
        roadColor: 0x2b2d31,
        shoulderColor: 0x3a3c3f,
        lineColor: 0xf0c94e,
        edgeColor: 0xe6e9ec,
        railColor: 0x737a82,
        poleColor: 0x5c636b,
        terrainWidth: 260,
        terrainReach: 150,
        hillHeight: 44,
        roughness: 1.3,
        terrainStep: 2.0,
        terrainPalette: ['#8b8378', '#9a9186', '#aaa29a', '#bbb4aa', '#cec8be'],
        terrainWallColor: '#8d8377',
        snowLine: 8,
        snowColor: '#f2f6fa',
        snowWallColor: '#c3d2de',
        buildingCities: ['greater_kc'],
        buildingChance: 0.3,
        buildingSpacing: 60,
        buildingSetback: 26,
        templateChance: 0.45,
        buildingWidth: 16,
        maxBuildingHeight: 24,
        buildingStyle: 'nordic',
        buildingPalette: ['#7d6b57', '#5c4f42', '#e3ded2', '#8f7d64'],
        windowColors: ['#ffd39b'],
        windowBandStep: 5,
        storefrontColor: 0xffb85c,
        streetlightSpacing: 46,
        streetlightColor: 0xffd39b,
        glowStripe: false,
        treeChance: 0.45,
        treeSpacing: 17,
        treeSpread: 62,
        treeKinds: ['pine', 'pine', 'pine'],
        treePalette: ['#2f4a32', '#3a5a3a', '#466647'],
        skyline: false,
        ocean: null,
        rocks: true,
        foundation: '#3b352f'
    }
};

export const WORLD_ALIASES = {
    neo_tazader: 'neo_tazader',
    neo_tazad: 'neo_tazader',
    'neo-tazader': 'neo_tazader',
    chiang_tung: 'chiang_tung',
    chiang: 'chiang_tung',
    curitiba: 'curitiba',
    nantwich: 'nantwich',
    iceland: 'nantwich',
    nantwich_iceland: 'nantwich',
    'nantwich/iceland': 'nantwich'
};

export function resolveBiome(worldId) {
    const id = WORLD_ALIASES[String(worldId || '').toLowerCase()] || 'neo_tazader';
    return BIOMES[id];
}

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashInt(x, y, z) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
}

export function resolveColor(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value) return 0x8899aa;
    let hex = String(value).trim().replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return Number.isFinite(n) ? n : 0x8899aa;
}

const colorCache = new Map();
const tempColor = new THREE.Color();

function colorRgb(hex) {
    const key = typeof hex === 'number' ? hex : resolveColor(hex);
    let rgb = colorCache.get(key);
    if (!rgb) {
        tempColor.setHex(key);
        rgb = [tempColor.r, tempColor.g, tempColor.b];
        colorCache.set(key, rgb);
    }
    return rgb;
}

function shade(hex, factor) {
    const rgb = colorRgb(hex);
    const c = new THREE.Color(rgb[0] * factor, rgb[1] * factor, rgb[2] * factor);
    return c.getHex();
}

/* ------------------------------------------------------------------ */
/* Geometry buffer helpers                                             */
/* ------------------------------------------------------------------ */

function addTri(buf, a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) return;
    nx /= len; ny /= len; nz /= len;

    const rgb = colorRgb(color);
    for (const p of [a, b, c]) {
        buf.positions.push(p[0], p[1], p[2]);
        buf.normals.push(nx, ny, nz);
        buf.colors.push(rgb[0], rgb[1], rgb[2]);
    }
}

function addQuad(buf, a, b, c, d, color, desiredNormal = null) {
    if (desiredNormal) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (nx * desiredNormal[0] + ny * desiredNormal[1] + nz * desiredNormal[2] < 0) {
            const t = b; b = d; d = t;
        }
    }
    addTri(buf, a, b, c, color);
    addTri(buf, a, c, d, color);
}

function makeGeometry(buf) {
    if (!buf.positions.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    g.computeBoundingSphere();
    return g;
}

/* ------------------------------------------------------------------ */
/* Road ribbon                                                        */
/* ------------------------------------------------------------------ */

function isDash(z, phaseOffset = 0) {
    const phase = ((z + phaseOffset) % 9 + 9) % 9;
    return phase < 5.5;
}

export function buildRoadChunkGeometry(zStart, zEnd, biome) {
    const buf = { positions: [], normals: [], colors: [] };
    const half = biome.roadWidth / 2;
    const shoulder = biome.shoulder;
    const segments = Math.max(2, Math.ceil((zStart - zEnd) / ROAD_SAMPLE_STEP));
    const step = (zStart - zEnd) / segments;

    const strip = (z0, z1, off0, off1, lift, color) => {
        const c0 = curveX(z0), c1 = curveX(z1);
        const y0 = roadElevation(z0) + lift, y1 = roadElevation(z1) + lift;
        addQuad(buf,
            [c0 + off0, y0, z0],
            [c0 + off1, y0, z0],
            [c1 + off1, y1, z1],
            [c1 + off0, y1, z1],
            color,
            [0, 1, 0]
        );
    };

    for (let i = 0; i < segments; i++) {
        const z0 = zStart - i * step;
        const z1 = z0 - step;

        // Asphalt.
        strip(z0, z1, -half, half, 0, biome.roadColor);

        // Shoulders.
        strip(z0, z1, -half - shoulder, -half, -0.035, biome.shoulderColor);
        strip(z0, z1, half, half + shoulder, -0.035, biome.shoulderColor);

        // Continuous edge lines.
        strip(z0, z1, -half + 0.42, -half + 0.62, 0.035, biome.edgeColor);
        strip(z0, z1, half - 0.62, half - 0.42, 0.035, biome.edgeColor);

        // Double yellow centre dashes.
        if (isDash(z0)) {
            strip(z0, z1, -0.34, -0.16, 0.04, biome.lineColor);
            strip(z0, z1, 0.16, 0.34, 0.04, biome.lineColor);
        }

        // White lane dashes for a four-lane ribbon.
        if (isDash(z0, 3.2)) {
            strip(z0, z1, -half * 0.5 - 0.1, -half * 0.5 + 0.1, 0.032, biome.edgeColor);
        }
        if (isDash(z0, 6.4)) {
            strip(z0, z1, half * 0.5 - 0.1, half * 0.5 + 0.1, 0.032, biome.edgeColor);
        }
    }

    return makeGeometry(buf);
}

/* ------------------------------------------------------------------ */
/* Stepped voxel terrain                                              */
/* ------------------------------------------------------------------ */

function terrainColorFor(biome, h, roadY, row, col) {
    if (biome.snowLine !== null && h >= biome.snowLine) return biome.snowColor;
    if (biome.ocean && h <= biome.ocean.level + 2.2) return '#c8b286';

    const palette = biome.terrainPalette;
    const band = biome.terrainBand || 7;
    const level = Math.max(0, Math.min(palette.length - 1,
        Math.floor((h - roadY + 3) / band)));
    const jitter = (hashInt(row, col, level) % 5 === 0) ? 1 : 0;
    return palette[Math.min(palette.length - 1, level + jitter)];
}

export function buildTerrainChunkGeometry(zStart, zEnd, biome) {
    const buf = { positions: [], normals: [], colors: [] };
    const half = biome.roadWidth / 2;
    const shoulder = biome.shoulder;
    const corridor = half + shoulder + 0.45;
    const cell = TERRAIN_CELL;
    const cols = Math.max(4, Math.ceil((biome.terrainWidth || 200) / cell));
    const rows = Math.max(2, Math.ceil((zStart - zEnd) / cell));
    const wallColor = biome.terrainWallColor || '#202020';
    const snowLine = biome.snowLine;
    const snowWallColor = biome.snowWallColor || wallColor;
    const wallColorFor = (top) =>
        (snowLine !== null && top >= snowLine) ? snowWallColor : wallColor;

    for (const side of [-1, 1]) {
        const heights = new Float32Array(rows * cols);
        const rowZVals = new Float32Array(rows + 1);

        for (let r = 0; r <= rows; r++) rowZVals[r] = zStart - r * cell;

        for (let r = 0; r < rows; r++) {
            const zc = zStart - (r + 0.5) * cell;
            for (let c = 0; c < cols; c++) {
                const off = corridor + (c + 0.5) * cell;
                heights[r * cols + c] = terrainHeightAt(curveX(zc) + side * off, zc, biome);
            }
        }

        for (let r = 0; r < rows; r++) {
            const z0 = rowZVals[r];
            const z1 = rowZVals[r + 1];
            for (let c = 0; c < cols; c++) {
                const h = heights[r * cols + c];
                const o0 = corridor + c * cell;
                const o1 = o0 + cell;
                const c0 = curveX(z0), c1 = curveX(z1);

                // Top face, per-cell constant height => genuine voxel steps.
                const p0 = [c0 + side * o0, h, z0];
                const p1 = [c0 + side * o1, h, z0];
                const p2 = [c1 + side * o1, h, z1];
                const p3 = [c1 + side * o0, h, z1];
                const color = terrainColorFor(biome, h, roadElevation((z0 + z1) * 0.5), r, c);
                addQuad(buf, p0, p1, p2, p3, color, [0, 1, 0]);

                // Wall towards the road.
                if (c === 0) {
                    const roadY = roadElevation(z0) - 0.45;
                    if (h > roadY + 0.02) {
                        const x0 = c0 + side * o0;
                        const x1 = c1 + side * o0;
                        addQuad(buf,
                            [x0, roadY, z0], [x1, roadY, z1],
                            [x1, h, z1], [x0, h, z0],
                            wallColorFor(h), [-side, 0, 0]);
                    }
                }

                // Wall towards the next column (terrace cliff). Adding the
                // wall for either height direction closes every sky gap.
                if (c < cols - 1) {
                    const hn = heights[r * cols + c + 1];
                    if (Math.abs(h - hn) > 0.02) {
                        const top = Math.max(h, hn);
                        const bottom = Math.min(h, hn);
                        const x0 = c0 + side * o1;
                        const x1 = c1 + side * o1;
                        addQuad(buf,
                            [x0, bottom, z0], [x1, bottom, z1],
                            [x1, top, z1], [x0, top, z0],
                            wallColorFor(top), [side, 0, 0]);
                    }
                }

                // Wall towards the next row (forward cliff). The last row
                // also checks the first row of the chunk ahead so chunk
                // seams never open into the sky.
                if (r < rows - 1) {
                    const hn = heights[(r + 1) * cols + c];
                    if (Math.abs(h - hn) > 0.02) {
                        const top = Math.max(h, hn);
                        const bottom = Math.min(h, hn);
                        const x0 = c1 + side * o0;
                        const x1 = c1 + side * o1;
                        addQuad(buf,
                            [x0, bottom, z1], [x1, bottom, z1],
                            [x1, top, z1], [x0, top, z1],
                            wallColorFor(top), [0, 0, -1]);
                    }
                } else {
                    const zNext = z1 - cell * 0.5;
                    const oCenter = corridor + (c + 0.5) * cell;
                    const hn = terrainHeightAt(
                        curveX(zNext) + side * oCenter, zNext, biome);
                    if (Math.abs(h - hn) > 0.02) {
                        const top = Math.max(h, hn);
                        const bottom = Math.min(h, hn);
                        const x0 = c1 + side * o0;
                        const x1 = c1 + side * o1;
                        addQuad(buf,
                            [x0, bottom, z1], [x1, bottom, z1],
                            [x1, top, z1], [x0, top, z1],
                            wallColorFor(top), [0, 0, -1]);
                    }
                }
            }
        }
    }

    return makeGeometry(buf);
}

/* ------------------------------------------------------------------ */
/* Building templates                                                 */
/* ------------------------------------------------------------------ */

export function prepareVoxelTemplate(data, biome) {
    const voxels = Array.isArray(data && data.voxels) ? data.voxels : [];
    if (!voxels.length) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const v of voxels) {
        if (!v) continue;
        const x = Number(v.x), y = Number(v.y), z = Number(v.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }

    if (!Number.isFinite(minX) || maxX <= minX && maxZ <= minZ) return null;

    const sizeX = Math.max(2, maxX - minX);
    const sizeY = Math.max(2, maxY - minY);
    const sizeZ = Math.max(2, maxZ - minZ);
    const footprint = Math.max(sizeX, sizeZ);
    const targetWidth = biome.buildingWidth || 22;
    let scale = targetWidth / footprint;
    const maxHeight = biome.maxBuildingHeight || 110;

    if (sizeY * scale > maxHeight) scale *= maxHeight / (sizeY * scale);
    scale = Math.max(0.55, Math.min(4.2, scale));

    const voxelSize = Math.max(1.15, 2 * scale);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const palette = biome.buildingPalette || ['#334455'];
    const prepared = [];

    for (const v of voxels) {
        if (!v) continue;
        const x = Number(v.x), y = Number(v.y), z = Number(v.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

        let color = resolveColor(v.color);
        const c = colorRgb(color);
        // Pale source-map quartz is retinted so each biome reads correctly.
        if (c[0] > 0.68 && c[1] > 0.68 && c[2] > 0.68) {
            color = resolveColor(palette[hashInt(x, y, z) % palette.length]);
        }

        prepared.push({
            x: (x - cx) * scale,
            y: (y - minY) * scale + voxelSize * 0.5,
            z: (z - cz) * scale,
            color
        });
    }

    if (!prepared.length) return null;

    return {
        voxels: prepared,
        voxelSize,
        width: sizeX * scale + voxelSize,
        depth: sizeZ * scale + voxelSize,
        height: sizeY * scale + voxelSize,
        count: prepared.length
    };
}

/* ------------------------------------------------------------------ */
/* Props / buildings / vegetation                                     */
/* ------------------------------------------------------------------ */

function pushBox(list, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    list.push({ x, y, z, sx, sy, sz, color: resolveColor(color), rx, ry, rz });
}

function localToWorld(x, z, yaw, lx, lz) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return {
        x: x + lx * cos + lz * sin,
        z: z - lx * sin + lz * cos
    };
}

function addLocalBox(solid, glow, x, z, baseY, yaw, lx, ly, lz, sx, sy, sz, color, isGlow = false) {
    const p = localToWorld(x, z, yaw, lx, lz);
    pushBox(isGlow ? glow : solid, p.x, baseY + ly, p.z, sx, sy, sz, color, 0, yaw, 0);
}

function addFacadeBands(solid, glow, x, z, baseY, yaw, halfW, depth, height, biome, side, lite) {
    const colors = biome.windowColors || ['#ffffff'];
    const step = biome.windowBandStep || 7;
    let index = 0;

    for (let y = Math.max(4, step * 0.7); y < height - 1.2; y += step) {
        const color = colors[index % colors.length];
        index++;

        // Two glowing bands on the local +/-X faces; one of them always
        // faces the road, so the effect reads from the cockpit camera.
        addLocalBox(solid, glow, x, z, baseY, yaw,
            halfW + 0.16, y, 0, 0.2, 0.32, depth * 0.8, color, true);
        if (!lite) {
            addLocalBox(solid, glow, x, z, baseY, yaw,
                -halfW - 0.16, y, 0, 0.2, 0.32, depth * 0.8, color, true);
        }
    }

    // Ground-floor storefront on the road-facing facade.
    if (!lite) {
        addLocalBox(solid, glow, x, z, baseY, yaw,
            -side * (halfW + 0.2), 2.5, 0, 0.24, 0.9, depth * 0.62,
            biome.storefrontColor || colors[0], true);
    }
}

function addVoxelTemplate(solid, glow, template, x, baseY, z, yaw, side, biome) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const vs = template.voxelSize;

    for (const v of template.voxels) {
        const wx = x + v.x * cos + v.z * sin;
        const wz = z - v.x * sin + v.z * cos;
        pushBox(solid, wx, baseY + v.y, wz, vs, vs, vs, v.color, 0, yaw, 0);
    }

    // Foundation hides terrain intersections on slopes.
    addLocalBox(solid, glow, x, z, baseY, yaw, 0, -1.4, 0,
        template.width * 0.92, 2.8, template.depth * 0.92,
        biome.foundation || '#222222');

    // Solid core keeps sparse source shells reading as buildings instead of
    // floating voxel clusters, while the original voxels stay as cladding.
    const corePalette = biome.buildingPalette || ['#334455'];
    const coreColor = shade(
        corePalette[hashInt(template.width * 10, template.height * 10, template.depth * 10) % corePalette.length],
        0.82
    );
    addLocalBox(solid, glow, x, z, baseY, yaw, 0, template.height * 0.46, 0,
        template.width * 0.66, template.height * 0.92, template.depth * 0.66,
        coreColor);

    addFacadeBands(solid, glow, x, z, baseY, yaw,
        template.width / 2, template.depth, template.height, biome, side, false);

    if (biome.glowStripe) {
        const c = (biome.windowColors || ['#55e6ff'])[0];
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                addLocalBox(solid, glow, x, z, baseY, yaw,
                    sx * (template.width / 2 + 0.08), template.height * 0.56,
                    sz * (template.depth / 2 + 0.08),
                    0.14, template.height * 0.78, 0.14, c, true);
            }
        }
    }
}

function addProceduralBuilding(solid, glow, x, z, baseY, yaw, width, depth, height,
    biome, side, rng, lite = false) {
    const palette = biome.buildingPalette || ['#334455'];
    const pick = () => palette[Math.floor(rng() * palette.length)];
    const style = biome.buildingStyle;

    if (style === 'pagoda') {
        const tiers = 3 + Math.floor(rng() * 2);
        let y = 0;
        let w = width, d = depth;
        for (let i = 0; i < tiers; i++) {
            const bodyH = Math.max(4, height / tiers * 0.62);
            addLocalBox(solid, glow, x, z, baseY, yaw, 0, y + bodyH / 2, 0,
                w, bodyH, d, pick());
            addLocalBox(solid, glow, x, z, baseY, yaw, 0, y + bodyH + 0.35, 0,
                w * 1.34, 0.7, d * 1.34, '#3b2720');
            if (!lite) {
                addLocalBox(solid, glow, x, z, baseY, yaw,
                    -side * (w * 0.5 + 0.18), y + bodyH * 0.58, 0,
                    0.2, 0.28, d * 0.7, biome.windowColors[0], true);
            }
            y += bodyH + 0.7;
            w *= 0.78;
            d *= 0.78;
        }
        addLocalBox(solid, glow, x, z, baseY, yaw, 0, y + 0.6, 0,
            0.35, 1.2, 0.35, '#d7b56d');
        return y + 1.2;
    }

    if (style === 'coastal') {
        const bodyH = Math.max(7, height * 0.78);
        addLocalBox(solid, glow, x, z, baseY, yaw, 0, bodyH / 2, 0,
            width, bodyH, depth, pick());
        addLocalBox(solid, glow, x, z, baseY, yaw, 0, bodyH + 0.4, 0,
            width * 1.1, 0.8, depth * 1.1, '#f2ede0');
        addLocalBox(solid, glow, x, z, baseY, yaw, 0, bodyH * 0.62, 0,
            width * 0.72, 0.9, depth * 0.72, pick());
        addFacadeBands(solid, glow, x, z, baseY, yaw,
            width / 2, depth, bodyH, biome, side, lite);
        if (!lite) {
            addLocalBox(solid, glow, x, z, baseY, yaw,
                -side * (width * 0.5 + 0.18), 3.1, 0,
                0.24, 0.55, depth * 0.7, biome.storefrontColor, true);
            addLocalBox(solid, glow, x, z, baseY, yaw, 0, bodyH + 2.5, 0,
                width * 0.55, 1.7, 0.35, biome.windowColors[0], true);
        }
        return bodyH + 3.2;
    }

    if (style === 'nordic') {
        const bodyH = Math.max(5, height * 0.62);
        addLocalBox(solid, glow, x, z, baseY, yaw, 0, bodyH / 2, 0,
            width, bodyH, depth, pick());
        addLocalBox(solid, glow, x, z, baseY, yaw, 0, bodyH + 0.75, 0,
            width * 1.2, 1.5, depth * 1.2, '#3b332b');
        addLocalBox(solid, glow, x, z, baseY, yaw, width * 0.24, bodyH + 2.1, 0,
            0.7, 3.2, 0.7, '#4c4238');
        if (!lite) {
            for (const wx of [-width * 0.26, width * 0.02]) {
                addLocalBox(solid, glow, x, z, baseY, yaw,
                    wx, bodyH * 0.55, -side * (depth * 0.5 + 0.12),
                    2.0, 1.5, 0.18, biome.windowColors[0], true);
            }
        }
        return bodyH + 2.8;
    }

    // Cyber tower (default): stacked boxes with glowing floor bands.
    const tiers = lite ? 2 : 3;
    let y = 0;
    let w = width, d = depth;
    let offsetX = 0, offsetZ = 0;

    for (let i = 0; i < tiers; i++) {
        const tierH = height / tiers;
        const color = pick();
        addLocalBox(solid, glow, x, z, baseY, yaw, offsetX, y + tierH / 2, offsetZ,
            w, tierH, d, color);

        const bands = Math.max(1, Math.floor(tierH / (lite ? 14 : 8)));
        for (let b = 1; b <= bands; b++) {
            const by = y + (tierH / (bands + 1)) * b;
            const c = biome.windowColors[(i + b) % biome.windowColors.length];
            addLocalBox(solid, glow, x, z, baseY, yaw,
                offsetX + w / 2 + 0.14, by, offsetZ, 0.18, 0.3, d * 0.8, c, true);
            if (!lite) {
                addLocalBox(solid, glow, x, z, baseY, yaw,
                    offsetX - w / 2 - 0.14, by, offsetZ, 0.18, 0.3, d * 0.8, c, true);
            }
        }

        y += tierH;
        w *= 0.8;
        d *= 0.8;
        offsetX += (rng() - 0.5) * width * 0.08;
        offsetZ += (rng() - 0.5) * depth * 0.08;
    }

    addLocalBox(solid, glow, x, z, baseY, yaw, offsetX, y + 1.0, offsetZ,
        w * 1.1, 2.0, d * 1.1, shade(pick(), 0.7));
    addLocalBox(solid, glow, x, z, baseY, yaw, offsetX, y + 3.2, offsetZ,
        0.26, 4.4, 0.26, '#59647a');

    if (!lite) {
        addLocalBox(solid, glow, x, z, baseY, yaw,
            -side * (width / 2 + 0.2), 2.8, 0,
            0.24, 0.85, depth * 0.62, biome.storefrontColor, true);
        addLocalBox(solid, glow, x, z, baseY, yaw,
            offsetX + w * 0.62, y + 2.1, offsetZ,
            w * 0.35, 0.4, 0.4, biome.windowColors[1 % biome.windowColors.length], true);
    }

    return y + 5;
}

function addTree(solid, glow, x, z, baseY, kind, scale, rng, biome) {
    const palette = biome.treePalette || ['#3f6b3a'];
    const leaf = palette[Math.floor(rng() * palette.length)];
    const trunk = '#5b4330';

    if (kind === 'palm') {
        const h = (7.5 + rng() * 3.5) * scale;
        pushBox(solid, x, baseY + h / 2, z, 0.42 * scale, h, 0.42 * scale, '#8a6746');

        const leaves = 5;
        for (let i = 0; i < leaves; i++) {
            const a = (i / leaves) * Math.PI * 2 + rng() * 0.25;
            const cx = Math.cos(a) * 2.1 * scale;
            const cz = Math.sin(a) * 2.1 * scale;
            pushBox(solid, x + cx, baseY + h + 0.2, z + cz,
                4.8 * scale, 0.2 * scale, 1.1 * scale,
                leaf, 0, a, 0.16 * Math.sin(a));
        }
        return;
    }

    if (kind === 'bamboo') {
        const h = (6 + rng() * 4) * scale;
        for (let i = 0; i < 3; i++) {
            const ox = (rng() - 0.5) * 1.8;
            const oz = (rng() - 0.5) * 1.8;
            pushBox(solid, x + ox, baseY + h / 2, z + oz,
                0.16, h, 0.16, '#5f7f3a');
        }
        pushBox(solid, x, baseY + h * 0.82, z, 2.8 * scale, 0.25, 2.8 * scale, leaf);
        return;
    }

    if (kind === 'cherry') {
        const h = (3.8 + rng() * 2.2) * scale;
        pushBox(solid, x, baseY + h / 2, z, 0.5 * scale, h, 0.5 * scale, trunk);
        pushBox(solid, x, baseY + h + 1.1 * scale, z,
            4.4 * scale, 2.8 * scale, 4.4 * scale, leaf);
        pushBox(solid, x + 1.3 * scale, baseY + h + 2.2 * scale, z - 0.7 * scale,
            2.6 * scale, 1.8 * scale, 2.6 * scale, palette[0]);
        return;
    }

    if (kind === 'neon') {
        const h = (3.2 + rng() * 2.0) * scale;
        pushBox(solid, x, baseY + h / 2, z, 0.4, h, 0.4, '#2b3442');
        pushBox(glow, x, baseY + h + 0.5, z, 1.5 * scale, 1.5 * scale, 1.5 * scale,
            biome.windowColors[Math.floor(rng() * biome.windowColors.length)]);
        return;
    }

    // Pine / broadleaf: stacked voxel canopy.
    const h = (4.2 + rng() * 2.8) * scale;
    pushBox(solid, x, baseY + h / 2, z, 0.55 * scale, h, 0.55 * scale, trunk);
    for (let i = 0; i < 3; i++) {
        const s = (4.6 - i * 1.05) * scale;
        pushBox(solid, x, baseY + h + 0.4 + i * 1.7 * scale, z,
            s, 2.0 * scale, s, leaf);
    }
}

export function buildChunkProps(zStart, zEnd, biome, templates, seed) {
    const solid = [];
    const glow = [];
    const buildings = [];
    const rng = mulberry32(seed);

    const corridor = biome.roadWidth / 2 + biome.shoulder;
    let vegetation = 0;
    let streetProps = 0;
    let buildingCount = 0;

    /* ---------------- Roadside buildings ---------------- */
    const spacing = biome.buildingSpacing || 38;
    for (let z = zStart - 8; z > zEnd + 8; z -= spacing) {
        for (const side of [-1, 1]) {
            if (rng() > biome.buildingChance) continue;

            const useTemplate = templates.length > 0 && rng() < (biome.templateChance ?? 0.78);
            let width, depth, height;
            let template = null;

            if (useTemplate) {
                template = templates[Math.floor(rng() * templates.length)];
                width = template.width;
                depth = template.depth;
                height = template.height;
            } else {
                width = (biome.buildingWidth || 22) * (0.7 + rng() * 0.55);
                depth = (biome.buildingWidth || 22) * (0.7 + rng() * 0.5);
                height = styleHeight(biome, rng);
            }

            const halfW = width / 2;
            const halfD = depth / 2;
            const maxHalf = Math.max(halfW, halfD);
            const lateral = corridor + 8 + rng() * (biome.buildingSetback || 20) + maxHalf;
            const x = curveX(z) + side * lateral;
            const baseY = groundHeightAt(x, z, biome);
            const yaw = trackFrame(z).yaw;

            if (template) {
                addVoxelTemplate(solid, glow, template, x, baseY, z, yaw, side, biome);
            } else {
                addProceduralBuilding(solid, glow, x, z, baseY, yaw,
                    width, depth, height, biome, side, rng, false);
            }

            buildings.push({
                x,
                z,
                r_x: maxHalf + 1.0,
                r_z: maxHalf + 1.0
            });
            buildingCount++;
        }
    }

    /* ---------------- Distant skyline ---------------- */
    if (biome.skyline) {
        for (let z = zStart - 18; z > zEnd; z -= 52) {
            for (const side of [-1, 1]) {
                if (rng() > 0.62) continue;
                const lateral = corridor + 70 + rng() * 105;
                const x = curveX(z) + side * lateral;
                const baseY = groundHeightAt(x, z, biome);
                const width = 18 + rng() * 18;
                const depth = 18 + rng() * 18;
                const height = biome.buildingStyle === 'pagoda'
                    ? 22 + rng() * 26
                    : 55 + rng() * 95;
                const farBiome = biome.buildingStyle === 'pagoda'
                    ? biome
                    : Object.assign({}, biome, { buildingStyle: 'cyber' });
                addProceduralBuilding(solid, glow, x, z, baseY, trackFrame(z).yaw,
                    width, depth, height, farBiome, side, rng, true);
            }
        }
    }

    /* ---------------- Vegetation ---------------- */
    const treeSpacing = biome.treeSpacing || 16;
    for (let z = zStart - 4; z > zEnd + 4; z -= treeSpacing) {
        for (const side of [-1, 1]) {
            if (rng() > biome.treeChance) continue;
            const lateral = corridor + 4 + rng() * (biome.treeSpread || 45);
            const x = curveX(z) + side * lateral;
            const baseY = groundHeightAt(x, z, biome);
            const kinds = biome.treeKinds || ['pine'];
            const kind = kinds[Math.floor(rng() * kinds.length)];
            addTree(solid, glow, x, z, baseY, kind, 0.8 + rng() * 0.65, rng, biome);
            vegetation++;
        }
    }

    /* ---------------- Streetlights ---------------- */
    let lightIndex = 0;
    const lightSpacing = biome.streetlightSpacing || 30;
    for (let z = zStart - 10; z > zEnd; z -= lightSpacing) {
        const side = (lightIndex++ % 2 === 0) ? -1 : 1;
        const x = curveX(z) + side * (corridor + 0.65);
        const y = roadElevation(z);
        const pole = biome.poleColor || '#4b535f';

        pushBox(solid, x, y + 3.6, z, 0.18, 7.2, 0.18, pole);
        pushBox(solid, x - side * 0.95, y + 7.15, z, 1.9, 0.14, 0.14, pole);
        pushBox(glow, x - side * 1.9, y + 7.08, z, 0.64, 0.16, 0.4,
            biome.streetlightColor);
        if (biome.glowStripe) {
            pushBox(glow, x, y + 3.6, z, 0.06, 6.2, 0.06,
                biome.windowColors[lightIndex % biome.windowColors.length]);
        }
        streetProps++;
    }

    /* ---------------- Guardrails ---------------- */
    const railSeg = 10;
    for (const side of [-1, 1]) {
        for (let z0 = zStart; z0 > zEnd; z0 -= railSeg) {
            const z1 = Math.max(zEnd, z0 - railSeg);
            const zMid = (z0 + z1) * 0.5;
            const x0 = curveX(z0) + side * (corridor + 0.25);
            const x1 = curveX(z1) + side * (corridor + 0.25);
            const y = roadElevation(zMid);
            const dx = x1 - x0, dz = z1 - z0;
            const len = Math.hypot(dx, dz);
            const yaw = Math.atan2(dx, dz);

            pushBox(solid, (x0 + x1) * 0.5, y + 0.92, zMid,
                0.12, 0.34, len + 0.18, biome.railColor, 0, yaw, 0);
            pushBox(solid, x0, y + 0.55, z0,
                0.16, 1.1, 0.16, biome.poleColor || '#5a6068');

            if ((Math.round(z0 / railSeg) & 1) === 0) {
                pushBox(glow, x0, y + 0.95, z0, 0.1, 0.1, 0.1,
                    biome.streetlightColor);
            }
        }
    }

    /* ---------------- Rocks / basalt columns ---------------- */
    if (biome.rocks) {
        for (let z = zStart - 6; z > zEnd + 6; z -= 17) {
            for (const side of [-1, 1]) {
                if (rng() > 0.42) continue;
                const lateral = corridor + 11 + rng() * 55;
                const x = curveX(z) + side * lateral;
                const baseY = groundHeightAt(x, z, biome);
                const column = rng() < 0.45;
                const blocks = column ? 1 : 2 + Math.floor(rng() * 2);

                for (let i = 0; i < blocks; i++) {
                    const w = column ? 1.2 + rng() * 1.6 : 2 + rng() * 2.5;
                    const h = column ? 6 + rng() * 9 : 1.2 + rng() * 2.2;
                    pushBox(solid,
                        x + (rng() - 0.5) * 2, baseY + h / 2, z + (rng() - 0.5) * 2,
                        w, h, w, column ? '#3b3a3c' : '#5d564c',
                        0, rng() * Math.PI, 0);
                }
            }
        }
    }

    return {
        solid,
        glow,
        buildings,
        vegetation,
        streetProps,
        buildingCount,
        propCount: solid.length + glow.length
    };
}

function styleHeight(biome, rng) {
    switch (biome.buildingStyle) {
        case 'pagoda': return 16 + rng() * 22;
        case 'coastal': return 10 + rng() * 22;
        case 'nordic': return 7 + rng() * 8;
        default: return 42 + rng() * 70;
    }
}

