/**
 * WorldStyles — atmosphere, road furniture and palette tuning for the four
 * real Minecraft maps. The geometry comes from the actual map; this module
 * only decides how each place looks and feels.
 */
export const WORLD_STYLES = {
    neo_tazader: {
        id: 'neo_tazader',
        label: 'NEO-TAZADER',
        raceName: 'NEO-TAZADER MIDNIGHT CIRCUIT',
        night: true,
        sky: {
            top: '#03050c', horizon: '#182238', ground: '#04050a', stars: 1.0,
            clouds: { coverage: 0.32, softness: 1.1, color: '#39445c', shadow: '#0b0f19' }
        },
        fog: { color: 0x121a29, density: 0.0022 },
        sun: { color: 0x9fb6e8, intensity: 1.4, position: [-180, 260, -120] },
        moon: { color: 0xdfe8ff, size: 26, dir: [-180, 260, -120] },
        hemi: { sky: 0x8296b8, ground: 0x161a24, intensity: 0.85 },
        exposure: 1.28,
        bloom: { threshold: 0.72, strength: 0.82, radius: 0.66 },
        grade: {
            saturation: 1.18, contrast: 1.08, lift: 0.0,
            tint: '#e9efff', vignette: 0.38, grain: 0.032, aberration: 0.0018
        },
        road: {
            width: 26, shoulder: 1.6, sidewalk: 3.2, shelf: 10,
            roadColor: [0.10, 0.105, 0.12],
            sidewalkColor: [0.28, 0.285, 0.31],
            railColor: 0x66707f,
            lineColor: 0xf4d24a,
            edgeColor: 0xdfe7f5,
            streetlight: 0xffd9a0,
            streetlightSpacing: 34
        },
        windows: { enabled: true, colors: ['#ffb257', '#8fd0ff', '#ffd9a0', '#a7c9ff'] },
        water: { color: 0x0b2233, opacity: 0.92 },
        props: { palm: false, pine: false, bollards: true },
        vegetation: { type: 'broadleaf', density: 0, min: 0.8, max: 1.3, hedges: false }
    },

    chiang_tung: {
        id: 'chiang_tung',
        label: 'CHIANG TUNG',
        raceName: 'CHIANG TUNG MOUNTAIN TOUGE',
        night: false,
        sky: {
            top: '#2f6fae', horizon: '#cfdbe0', ground: '#5e5843', stars: 0,
            clouds: { coverage: 0.5, softness: 0.8, color: '#ffffff', shadow: '#a7b2ba' }
        },
        fog: { color: 0xcfdcdf, density: 0.0015 },
        sun: { color: 0xffd9a0, intensity: 1.9, position: [210, 120, 140] },
        hemi: { sky: 0xcfe2f5, ground: 0x50432f, intensity: 0.55 },
        exposure: 0.85,
        bloom: { threshold: 0.92, strength: 0.28, radius: 0.6 },
        grade: {
            saturation: 1.16, contrast: 1.08, lift: 0.003,
            tint: '#fff6ea', vignette: 0.30, grain: 0.024, aberration: 0.0012
        },
        road: {
            width: 16, shoulder: 1.2, sidewalk: 2.2, shelf: 7,
            roadColor: [0.105, 0.105, 0.11],
            sidewalkColor: [0.46, 0.42, 0.35],
            railColor: 0x8f9a9c,
            lineColor: 0xf0c94e,
            edgeColor: 0xe8e2d6,
            streetlight: 0xffca7a,
            streetlightSpacing: 40
        },
        windows: { enabled: false, colors: ['#ffcf7a'] },
        water: { color: 0x2f6f6a, opacity: 0.85 },
        props: { palm: false, pine: true, bollards: true },
        vegetation: { type: 'mixed', density: 0.02, min: 0.65, max: 1.45, hedges: true, hedgeSpacing: 4.0 }
    },

    curitiba: {
        id: 'curitiba',
        label: 'CURITIBA',
        raceName: 'CURITIBA AVENIDA SPRINT',
        night: false,
        sky: {
            top: '#2f7fc9', horizon: '#d7eaf3', ground: '#6c7a6a', stars: 0,
            clouds: { coverage: 0.44, softness: 0.9, color: '#ffffff', shadow: '#9fb0bb' }
        },
        fog: { color: 0xd2e5ee, density: 0.0014 },
        sun: { color: 0xfff6e6, intensity: 2.1, position: [160, 300, 180] },
        hemi: { sky: 0xdcefff, ground: 0x6a6650, intensity: 0.6 },
        exposure: 0.85,
        bloom: { threshold: 0.94, strength: 0.24, radius: 0.6 },
        grade: {
            saturation: 1.12, contrast: 1.07, lift: 0.001,
            tint: '#f4fbff', vignette: 0.28, grain: 0.022, aberration: 0.0010
        },
        road: {
            width: 22, shoulder: 1.5, sidewalk: 3.0, shelf: 9,
            roadColor: [0.10, 0.105, 0.115],
            sidewalkColor: [0.6, 0.585, 0.55],
            railColor: 0x9aa3a8,
            lineColor: 0xf3d34a,
            edgeColor: 0xf0f4f6,
            streetlight: 0xfff0c8,
            streetlightSpacing: 38
        },
        windows: { enabled: false, colors: ['#ffd8a0'] },
        water: { color: 0x1e6f86, opacity: 0.88 },
        props: { palm: true, pine: false, bollards: true },
        vegetation: { type: 'broadleaf', density: 0.012, min: 0.75, max: 1.55, hedges: true, hedgeSpacing: 5.0 }
    },

    nantwich: {
        id: 'nantwich',
        label: 'NANTWICH',
        raceName: 'NANTWICH VILLAGE RALLY',
        night: false,
        sky: {
            top: '#8796a4', horizon: '#dfe4e3', ground: '#5c5e55', stars: 0,
            clouds: { coverage: 0.76, softness: 1.1, color: '#f7f8f5', shadow: '#98a1a6' }
        },
        fog: { color: 0xccd6d7, density: 0.0020 },
        sun: { color: 0xeef2f6, intensity: 1.15, position: [90, 240, 120] },
        hemi: { sky: 0xdfe9f0, ground: 0x55564c, intensity: 0.95 },
        exposure: 0.90,
        bloom: { threshold: 0.97, strength: 0.16, radius: 0.5 },
        grade: {
            saturation: 0.99, contrast: 1.02, lift: 0.006,
            tint: '#f2f7f4', vignette: 0.26, grain: 0.03, aberration: 0.0010
        },
        road: {
            width: 12, shoulder: 1.0, sidewalk: 2.0, shelf: 6,
            roadColor: [0.095, 0.095, 0.10],
            sidewalkColor: [0.5, 0.5, 0.47],
            railColor: 0x8d979b,
            lineColor: 0xe8c95a,
            edgeColor: 0xe9eef1,
            streetlight: 0xffe3b0,
            streetlightSpacing: 44
        },
        windows: { enabled: false, colors: ['#ffcf8a'] },
        water: { color: 0x3d5f6b, opacity: 0.8 },
        props: { palm: false, pine: true, bollards: true },
        vegetation: { type: 'broadleaf', density: 0.016, min: 0.7, max: 1.35, hedges: true, hedgeSpacing: 3.4 }
    }
};

export const WORLD_ALIASES = {
    neo: 'neo_tazader',
    tazader: 'neo_tazader',
    greater_kc: 'neo_tazader',
    chiang: 'chiang_tung',
    chiangtung: 'chiang_tung',
    iceland: 'nantwich',
    nantwich_iceland: 'nantwich',
    'nantwich/iceland': 'nantwich'
};

export function resolveWorldStyle(id) {
    const key = String(id || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (WORLD_STYLES[key]) return WORLD_STYLES[key];
    if (WORLD_ALIASES[key] && WORLD_STYLES[WORLD_ALIASES[key]]) return WORLD_STYLES[WORLD_ALIASES[key]];
    return WORLD_STYLES.neo_tazader;
}
