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
        sky: { top: '#03050c', horizon: '#141b2e', ground: '#04050a', stars: 0.9 },
        fog: { color: 0x0d1524, density: 0.0032 },
        sun: { color: 0xb8c8e8, intensity: 1.55, position: [-180, 260, -120] },
        moon: { color: 0xdfe8ff, size: 26 },
        hemi: { sky: 0x8296b8, ground: 0x161a24, intensity: 0.88 },
        exposure: 1.18,
        bloom: { threshold: 0.82, strength: 0.72, radius: 0.62 },
        road: {
            width: 26, shoulder: 1.6, sidewalk: 3.2, shelf: 10,
            roadColor: [0.145, 0.15, 0.165],
            sidewalkColor: [0.28, 0.285, 0.31],
            railColor: 0x59637a,
            lineColor: 0xf4d24a,
            edgeColor: 0xdfe7f5,
            streetlight: 0xffd9a0,
            streetlightSpacing: 34
        },
        windows: { enabled: true, colors: ['#ffb257', '#8fd0ff', '#ffd9a0', '#a7c9ff'] },
        water: { color: 0x0b2233, opacity: 0.92 },
        props: { palm: false, pine: false, bollards: true }
    },

    chiang_tung: {
        id: 'chiang_tung',
        label: 'CHIANG TUNG',
        raceName: 'CHIANG TUNG MOUNTAIN TOUGE',
        night: false,
        sky: { top: '#3f78ab', horizon: '#dccfb6', ground: '#6b5a44', stars: 0 },
        fog: { color: 0xd4c3a6, density: 0.0021 },
        sun: { color: 0xffe2b8, intensity: 2.05, position: [220, 180, 160] },
        hemi: { sky: 0xcfe2f5, ground: 0x50432f, intensity: 0.78 },
        exposure: 1.0,
        bloom: { threshold: 0.92, strength: 0.35, radius: 0.6 },
        road: {
            width: 16, shoulder: 1.2, sidewalk: 2.2, shelf: 7,
            roadColor: [0.115, 0.115, 0.12],
            sidewalkColor: [0.46, 0.42, 0.35],
            railColor: 0x8a7a5f,
            lineColor: 0xf0c94e,
            edgeColor: 0xe8e2d6,
            streetlight: 0xffca7a,
            streetlightSpacing: 40
        },
        windows: { enabled: false, colors: ['#ffcf7a'] },
        water: { color: 0x2f6f6a, opacity: 0.85 },
        props: { palm: false, pine: true, bollards: true }
    },

    curitiba: {
        id: 'curitiba',
        label: 'CURITIBA',
        raceName: 'CURITIBA AVENIDA SPRINT',
        night: false,
        sky: { top: '#3f83c4', horizon: '#cfe6f0', ground: '#6f7a6a', stars: 0 },
        fog: { color: 0xd3e6ee, density: 0.0022 },
        sun: { color: 0xfff3dc, intensity: 2.65, position: [160, 320, 210] },
        hemi: { sky: 0xdcefff, ground: 0x6a6650, intensity: 0.95 },
        exposure: 1.0,
        bloom: { threshold: 0.9, strength: 0.3, radius: 0.6 },
        road: {
            width: 22, shoulder: 1.5, sidewalk: 3.0, shelf: 9,
            roadColor: [0.11, 0.115, 0.125],
            sidewalkColor: [0.6, 0.585, 0.55],
            railColor: 0x9aa3a8,
            lineColor: 0xf3d34a,
            edgeColor: 0xf0f4f6,
            streetlight: 0xfff0c8,
            streetlightSpacing: 38
        },
        windows: { enabled: false, colors: ['#ffd8a0'] },
        water: { color: 0x1e6f86, opacity: 0.88 },
        props: { palm: true, pine: false, bollards: true }
    },

    nantwich: {
        id: 'nantwich',
        label: 'NANTWICH',
        raceName: 'NANTWICH VILLAGE RALLY',
        night: false,
        sky: { top: '#6f8ba4', horizon: '#d7e0e2', ground: '#5e5f58', stars: 0 },
        fog: { color: 0xc9d4d8, density: 0.0022 },
        sun: { color: 0xeaf1f5, intensity: 1.9, position: [90, 240, 120] },
        hemi: { sky: 0xdfe9f0, ground: 0x55564c, intensity: 1.2 },
        exposure: 1.1,
        bloom: { threshold: 0.96, strength: 0.2, radius: 0.5 },
        road: {
            width: 12, shoulder: 1.0, sidewalk: 2.0, shelf: 6,
            roadColor: [0.1, 0.1, 0.105],
            sidewalkColor: [0.5, 0.5, 0.47],
            railColor: 0x7b8388,
            lineColor: 0xe8c95a,
            edgeColor: 0xe9eef1,
            streetlight: 0xffe3b0,
            streetlightSpacing: 44
        },
        windows: { enabled: false, colors: ['#ffcf8a'] },
        water: { color: 0x3d5f6b, opacity: 0.8 },
        props: { palm: false, pine: true, bollards: true }
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
