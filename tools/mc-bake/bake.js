/**
 * Bake a real Minecraft Java world into APEX streamable terrain tiles.
 *
 *   node tools/mc-bake/bake.js --world <id> [--dir <world>] [--cx 256] [--cz -256]
 *                              [--size 1536] [--step 2] [--tile 256]
 *                              [--south 512] [--north -768]
 *
 * Output: assets/worlds/<id>/manifest.json + assets/worlds/<id>/tiles/t_X_Z.bin
 *
 * Tile format (little endian):
 *   int16 height  * cols*cols   (absolute world Y, block units)
 *   uint8  colour * cols*cols   (index into manifest.palette)
 *
 * A dynamic-programming route walks the map from south to north choosing the
 * cheapest cells (real streets are cheap, buildings and water are expensive),
 * so the race road follows the actual city instead of floating over it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RegionFile } from './anvil.js';
import { chunkTopBlocks, blockColor, normalizeBlockName } from './chunk-blocks.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const WORLDS = {
    neo_tazader: {
        // Downtown Kansas City sits in region r.0.-1 (x -512..0, z -512..0).
        dir: 'Downloaded Assests/Maps/GreaterKCMetro_v1.1/GreaterKCMetro',
        cx: -96, cz: -256, size: 1536, name: 'NEO-TAZADER',
        weave: 0.07, preferLow: 0.6,
        anchors: [{ x: -210, z: -260, radius: 240, strength: 0.05 }]
    },
    chiang_tung: {
        // Walled city + mountain temple complex is region r.0.0.
        dir: 'Downloaded Assests/Maps/Kingdom_of_Chiang_Tung/Kingdom of Chiang Tung',
        cx: 256, cz: 256, size: 1280, name: 'CHIANG TUNG',
        weave: 0.08, elevationBias: 0.55, preferLow: 0.2,
        anchors: [
            { x: 256, z: 300, radius: 200, strength: 0.07 },
            { x: 420, z: 640, radius: 220, strength: 0.05 }
        ]
    },
    curitiba: {
        // Hand-built Curitiba skyline sits at world x 240..400, z 0..32.
        dir: 'Downloaded Assests/Maps/Curitiba_3-12/Curitiba 3-12',
        cx: 320, cz: 0, size: 1280, name: 'CURITIBA',
        weave: 0.05, preferLow: 0.6,
        anchors: [{ x: 320, z: 16, radius: 170, strength: 0.16 }]
    },
    nantwich: {
        // The medieval town spans regions r.1..r.5 / r.1..r.4.
        dir: 'Downloaded Assests/Maps/Map-1/Nantwich, Cheshire Java',
        cx: 2176, cz: 1664, size: 1536, name: 'NANTWICH',
        weave: 0.06, preferLow: 1.6,
        anchors: [{ x: 2200, z: 1860, radius: 280, strength: 0.07 }]
    }
};

const worldId = arg('world', 'neo_tazader');
const cfg = WORLDS[worldId];
if (!cfg) throw new Error(`Unknown world ${worldId}`);
const worldDir = path.resolve(ROOT, arg('dir', cfg.dir));
const cx = Number(arg('cx', cfg.cx));
const cz = Number(arg('cz', cfg.cz));
const size = Number(arg('size', cfg.size));       // blocks (square)
const step = Number(arg('step', 2));              // metres per column
const tileMeters = Number(arg('tile', 256));
const outDir = path.resolve(ROOT, arg('out', `assets/worlds/${worldId}`));

const half = size / 2;
const minX = Math.floor((cx - half) / 16) * 16;
const maxX = minX + size;
const minZ = Math.floor((cz - half) / 16) * 16;
const maxZ = minZ + size;

const cols = size / step;

const ROAD_BLOCKS = /asphalt|black_concrete|gray_concrete|grey_concrete|andesite$|smooth_stone$|stone_bricks$|polished_andesite$|cracked_stone_bricks$|stone$|gravel$|cobblestone$|diorite$/;
const BUILD_BLOCKS = /concrete|terracotta|quartz|bricks|planks|wool|glass|smooth_stone_slab|slab$|stairs$/;



console.log(`\n[bake] ${worldId}  area x ${minX}..${maxX}  z ${minZ}..${maxZ}  cols ${cols}²  step ${step}`);

/* ------------------------------------------------------------------ */
/* 1. Read every column of the area                                    */
/* ------------------------------------------------------------------ */
const heights = new Int16Array(cols * cols).fill(-32768);
const blocks = new Array(cols * cols).fill('air');
const water = new Int16Array(cols * cols).fill(-32768);

const regionDir = path.join(worldDir, 'region');
const rx0 = Math.floor(minX / 512), rx1 = Math.floor((maxX - 1) / 512);
const rz0 = Math.floor(minZ / 512), rz1 = Math.floor((maxZ - 1) / 512);
let chunksRead = 0, columnsFilled = 0;

for (let rz = rz0; rz <= rz1; rz++) {
    for (let rx = rx0; rx <= rx1; rx++) {
        const file = path.join(regionDir, `r.${rx}.${rz}.mca`);
        if (!fs.existsSync(file)) continue;
        const stat = fs.statSync(file);
        if (stat.size < 4096) continue;
        const region = RegionFile.open(file);
        for (const key of region.keys()) {
            const chunkX = rx * 32 + key.localX;
            const chunkZ = rz * 32 + key.localZ;
            const baseX = chunkX * 16;
            const baseZ = chunkZ * 16;
            if (baseX + 15 < minX || baseX > maxX || baseZ + 15 < minZ || baseZ > maxZ) continue;
            const chunk = region.readChunk(key.localX, key.localZ);
            if (!chunk) continue;
            const level = chunk.Level || chunk;
            const status = String(level.Status || chunk.Status || 'minecraft:full')
                .toLowerCase().replace('minecraft:', '');
            if (status && status !== 'full' && status !== 'spawn') continue;
            const top = chunkTopBlocks(chunk);
            chunksRead++;

            for (let lz = 0; lz < 16; lz++) {
                for (let lx = 0; lx < 16; lx++) {
                    const i = lz * 16 + lx;
                    const wx = baseX + lx;
                    const wz = baseZ + lz;
                    if (wx < minX || wx >= maxX || wz < minZ || wz >= maxZ) continue;
                    const col = Math.floor((wz - minZ) / step) * cols + Math.floor((wx - minX) / step);
                    const y = top.y[i];
                    const w = top.water[i];
                    if (w > water[col]) water[col] = w;
                    // Water surface wins over the riverbed so lakes/rivers read as
                    // flat water instead of grass-coloured dips.
                    const surfaceY = (w > -32768 && w >= y) ? w : y;
                    if (surfaceY === -32768) continue;
                    if (surfaceY > heights[col] || (heights[col] === -32768 && surfaceY > -32768)) {
                        heights[col] = surfaceY;
                        blocks[col] = (w > -32768 && w >= y) ? 'water' : top.block[i];
                    }
                }
            }
        }
    }
}

for (let i = 0; i < heights.length; i++) if (heights[i] !== -32768) columnsFilled++;
console.log(`[bake] chunks=${chunksRead} columns=${columnsFilled}/${heights.length} (${(columnsFilled / heights.length * 100).toFixed(1)}%)`);

// Fill gaps by nearest-neighbour so no holes appear in the mesh.
fillGaps(heights, blocks, cols);

/* ------------------------------------------------------------------ */
/* 2. Palette                                                          */
/* ------------------------------------------------------------------ */
const palette = ['#000000'];
const paletteIndex = new Map([['#000000', 0]]);
const colourIndex = new Uint8Array(heights.length);
for (let i = 0; i < heights.length; i++) {
    const base = blockColor(blocks[i]);
    if (!paletteIndex.has(base)) {
        paletteIndex.set(base, palette.length);
        palette.push(base);
    }
    colourIndex[i] = paletteIndex.get(base);
}
console.log(`[bake] palette ${palette.length} colours`);

/* ------------------------------------------------------------------ */
/* 3. Road route (dynamic programming, follows real streets)           */
/* ------------------------------------------------------------------ */
const routeStep = 2;                 // columns
const routeCells = Math.floor(cols / routeStep);
const maxLateral = 4;                // columns per route cell (= 16 m at 4 m cells)
const route = computeRoute(heights, blocks, cols, routeStep, maxLateral, cfg);
console.log(`[bake] route ${route.length} points  x ${route[0].x}..${route[route.length - 1].x}`);

/* ------------------------------------------------------------------ */
/* 4. Obstacles near the route (for vehicle collision)                 */
/* ------------------------------------------------------------------ */
const obstacles = computeObstacles(heights, route, step, minX, minZ, cols);
console.log(`[bake] obstacles ${obstacles.length}`);

/* ------------------------------------------------------------------ */
/* 5. Write tiles                                                      */
/* ------------------------------------------------------------------ */
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'tiles'), { recursive: true });

const tileCols = Math.round(tileMeters / step);
const tilesX = Math.ceil(cols / tileCols);
const tilesZ = Math.ceil(cols / tileCols);
const buffer = Buffer.alloc(tileCols * tileCols * 3);

for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) {
        buffer.fill(0);
        let o = 0;
        for (let rz = 0; rz < tileCols; rz++) {
            for (let rx = 0; rx < tileCols; rx++) {
                const gx = tx * tileCols + rx;
                const gz = tz * tileCols + rz;
                const gi = gz * cols + gx;
                const h = gx < cols && gz < cols ? heights[gi] : -32768;
                buffer.writeInt16LE(h, o);
                buffer[o + 2] = gx < cols && gz < cols ? colourIndex[gi] : 0;
                o += 3;
            }
        }
        fs.writeFileSync(path.join(outDir, 'tiles', `t_${tx}_${tz}.bin`), buffer);
    }
}

/* ------------------------------------------------------------------ */
/* 6. Manifest                                                         */
/* ------------------------------------------------------------------ */
const waterLevel = (() => {
    let best = -32768;
    for (let i = 0; i < water.length; i++) if (water[i] > best) best = water[i];
    return best === -32768 ? null : best;
})();

let maxY = -32768, minY = 32768;
for (let i = 0; i < heights.length; i++) {
    if (heights[i] === -32768) continue;
    maxY = Math.max(maxY, heights[i]);
    minY = Math.min(minY, heights[i]);
}

const manifest = {
    id: worldId,
    label: cfg.name,
    source: path.relative(ROOT, worldDir).replace(/\\/g, '/'),
    version: 1,
    origin: { x: minX, z: minZ },
    size: { x: size, z: size },
    step,
    tileMeters,
    tiles: { x: tilesX, z: tilesZ, cols: tileCols },
    palette,
    range: { minY, maxY },
    waterLevel,
    columns: cols,
    totalBlocks: columnsFilled,
    route: route.map(p => [Math.round(p.x), Math.round(p.y * 100) / 100, Math.round(p.z)]),
    obstacles
};

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
const manifestSize = fs.statSync(path.join(outDir, 'manifest.json')).size;
const tileSize = fs.statSync(path.join(outDir, 'tiles', 't_0_0.bin')).size;
console.log(`[bake] wrote ${tilesX * tilesZ} tiles (${(tileSize / 1024).toFixed(0)} kB each), manifest ${(manifestSize / 1024).toFixed(0)} kB`);
console.log(`[bake] height range ${minY}..${maxY}  water ${waterLevel}  spawn x=${route[0].x} z=${route[0].z}`);

// Route diagnostics: length, x spread, steepest grade.
{
    let len = 0, maxGrade = 0, xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < route.length; i++) {
        xMin = Math.min(xMin, route[i].x); xMax = Math.max(xMax, route[i].x);
        if (i === 0) continue;
        const d = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
        len += d;
        if (d > 0.5) maxGrade = Math.max(maxGrade, Math.abs(route[i].y - route[i - 1].y) / d);
    }
    console.log(`[bake] route length ${len.toFixed(0)} m  x ${xMin.toFixed(0)}..${xMax.toFixed(0)}  max grade ${(maxGrade * 100).toFixed(1)}%  y ${route[0].y.toFixed(1)}..${route[route.length - 1].y.toFixed(1)}`);
}

/* ================================================================== */
/* helpers                                                            */
/* ================================================================== */

function fillGaps(h, b, n) {
    // Simple multi-pass dilation; map exports are mostly rectangular so this
    // converges in a couple of passes.
    for (let pass = 0; pass < 6; pass++) {
        let changed = 0;
        for (let z = 0; z < n; z++) {
            for (let x = 0; x < n; x++) {
                const i = z * n + x;
                if (h[i] !== -32768) continue;
                let sum = 0, count = 0, block = null;
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, nz = z + dz;
                        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
                        const j = nz * n + nx;
                        if (h[j] === -32768) continue;
                        sum += h[j]; count++;
                        if (!block) block = b[j];
                    }
                }
                if (count) { h[i] = Math.round(sum / count); b[i] = block; changed++; }
            }
        }
        if (!changed) break;
    }
    for (let i = 0; i < h.length; i++) {
        if (h[i] === -32768) { h[i] = 64; b[i] = 'stone'; }
        if (!b[i] || b[i] === 'air') b[i] = 'stone';
    }
}


function computeRoute(h, blockNames, n, routeStepSize, maxLat, cfg = {}) {
    const cells = Math.floor(n / routeStepSize);
    const rows = cells;
    // Cost of standing on a cell: cheap = real street, expensive = building/water.
    const cost = new Float32Array(rows * cells);
    let avgY = 0;
    for (let z = 0; z < cells; z++) {
        for (let x = 0; x < cells; x++) {
            const gi = (z * routeStepSize) * n + (x * routeStepSize);
            const y = h[gi];
            const block = blockNames[gi] || 'stone';
            let c = 4.0;
            if (ROAD_BLOCKS.test(block)) c = 0.7;
            else if (/leaves|log|wood/.test(block)) c = 2.6;
            else if (/grass|dirt|podzol|mycelium|farmland|path|snow/.test(block)) c = 1.6;
            else if (/water/.test(block)) c = 40;
            else if (BUILD_BLOCKS.test(block)) c = 5.0;

            // Local roughness: tall jumps mean a building right next door.
            let rough = 0;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = Math.min(cells - 1, Math.max(0, x + dx));
                const nz = Math.min(cells - 1, Math.max(0, z + dz));
                rough = Math.max(rough, Math.abs(h[nz * routeStepSize * n + nx * routeStepSize] - y));
            }
            c += Math.min(18, rough) * 0.55;
            cost[z * cells + x] = c;
            avgY += y;
        }
    }
    avgY /= Math.max(1, rows * cells);

    // Optional: streets are the lowest connected surface. In stone towns the
    // roof material is the same block as the pavement (stone_bricks in
    // Nantwich), and roofs are perfectly flat, so height is the only reliable
    // street signal. Penalise anything above the row's low percentile.
    if (cfg.preferLow) {
        const k = cfg.preferLow;
        const row = new Float32Array(cells);
        for (let z = 0; z < cells; z++) {
            for (let x = 0; x < cells; x++) row[x] = h[(z * routeStepSize) * n + x * routeStepSize];
            const sorted = Array.from(row).sort((a, b) => a - b);
            const floor = sorted[Math.floor(sorted.length * 0.18)];
            for (let x = 0; x < cells; x++) {
                const above = row[x] - floor;
                if (above > 0) cost[z * cells + x] += Math.min(30, above * k);
            }
        }
    }

    // Optional: pull the circuit towards hillsides (mountain worlds) without
    // ever paying so much that it prefers climbing rooftops or tree canopies.
    if (cfg.elevationBias) {
        const bias = cfg.elevationBias;
        const SCENIC = /grass|snow|stone|dirt|gravel|sand|podzol|mycelium|path|clay|tuff/;
        for (let z = 0; z < cells; z++) {
            for (let x = 0; x < cells; x++) {
                const gi = (z * routeStepSize) * n + (x * routeStepSize);
                const y = h[gi];
                if (y <= avgY) continue;
                const block = blockNames[gi] || 'stone';
                if (BUILD_BLOCKS.test(block) || /leaves|log|wood|water/.test(block)) continue;
                if (!SCENIC.test(block)) continue;
                cost[z * cells + x] -= Math.min(18, (y - avgY) * bias);
            }
        }
    }

    // Forbid the outer 6 cells so the road never hugs the baked boundary.
    const margin = 6;
    for (let z = 0; z < cells; z++) {
        for (let x = 0; x < cells; x++) {
            if (x < margin || x >= cells - margin) cost[z * cells + x] += 25;
        }
    }

    // Pull the path through the map with a gentle weave so the circuit has
    // real corners instead of one endless straight line.
    const weaveAmp = cells * (cfg.weave ?? 0.06);
    for (let z = 0; z < cells; z++) {
        const desired = cells / 2 + Math.sin(z * 0.030) * weaveAmp + Math.sin(z * 0.011 + 1.7) * weaveAmp * 0.55;
        for (let x = 0; x < cells; x++) {
            cost[z * cells + x] += Math.abs(x - desired) * 0.085;
        }
    }

    // Named landmarks (downtown, temple, skyline) the route must pass through.
    for (const anchor of cfg.anchors || []) {
        const acx = (anchor.x - minX) / (step * routeStepSize);
        const acz = (anchor.z - minZ) / (step * routeStepSize);
        const radius = Math.max(1, (anchor.radius || 160) / (step * routeStepSize));
        const strength = anchor.strength ?? 0.06;
        for (let z = 0; z < cells; z++) {
            const dz = (z - acz) / radius;
            if (Math.abs(dz) > 3) continue;
            const weight = strength * Math.exp(-dz * dz);
            for (let x = 0; x < cells; x++) {
                cost[z * cells + x] += Math.abs(x - acx) * weight;
            }
        }
    }

    const startX = Math.floor(cells / 2);
    const best = new Float32Array(rows * cells).fill(Infinity);
    const prev = new Int16Array(rows * cells).fill(-1);
    for (let x = 0; x < cells; x++) best[x] = 0;

    for (let z = 1; z < rows; z++) {
        for (let x = 0; x < cells; x++) {
            let bestCost = Infinity, bestPrev = -1;
            for (let dx = -maxLat; dx <= maxLat; dx++) {
                const px = x + dx;
                if (px < 0 || px >= cells) continue;
                const candidate = best[(z - 1) * cells + px]
                    + Math.abs(dx) * 0.55
                    + Math.abs(dx) * Math.abs(dx) * 0.12;
                if (candidate < bestCost) { bestCost = candidate; bestPrev = px; }
            }
            best[z * cells + x] = bestCost + cost[z * cells + x];
            prev[z * cells + x] = bestPrev;
        }
    }

    // End: prefer the cheapest of the middle thirds.
    let endX = startX, endCost = Infinity;
    for (let x = Math.floor(cells * 0.25); x < Math.ceil(cells * 0.75); x++) {
        const c = best[(rows - 1) * cells + x];
        if (c < endCost) { endCost = c; endX = x; }
    }
    const path = [];
    let x = endX;
    for (let z = rows - 1; z >= 0; z--) {
        path.push({ xIdx: x, zIdx: z });
        x = prev[z * cells + x] ?? x;
    }
    path.reverse();

    // Keep the spawn/despawn on the baked area, never on its edge.
    const trim = Math.max(3, Math.round(rows * 0.06));
    path.splice(0, trim);
    path.splice(path.length - trim, trim);

    // Convert to world space, smooth X and Y, clamp grade.
    const pts = path.map(p => {
        const gi = (p.zIdx * routeStepSize) * n + p.xIdx * routeStepSize;
        return { x: (p.xIdx * routeStepSize) * step + minX + step / 2, z: (p.zIdx * routeStepSize) * step + minZ + step / 2, y: h[gi] };
    });

    // Smooth X with a wide window (streets are straight-ish, cars need flow).
    const smoothX = new Float32Array(pts.length);
    const win = 9;
    for (let i = 0; i < pts.length; i++) {
        let sum = 0, wsum = 0;
        for (let k = -win; k <= win; k++) {
            const j = Math.min(pts.length - 1, Math.max(0, i + k));
            const w = 1 - Math.abs(k) / (win + 1);
            sum += pts[j].x * w; wsum += w;
        }
        smoothX[i] = sum / wsum;
    }
    for (let i = 0; i < pts.length; i++) pts[i].x = smoothX[i];

    // Elevation: running average of the terrain, then grade limiting.
    const y = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
        let sum = 0, count = 0;
        for (let k = -6; k <= 6; k++) {
            const j = Math.min(pts.length - 1, Math.max(0, i + k));
            sum += pts[j].y; count++;
        }
        y[i] = sum / count + 0.6;
    }
    // Forward + backward grade pass (max 7.5%).
    const maxGrade = 0.075 * 4;
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < y.length; i++) y[i] = Math.min(y[i], y[i - 1] + maxGrade), y[i] = Math.max(y[i], y[i - 1] - maxGrade);
        for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + maxGrade), y[i] = Math.max(y[i], y[i + 1] - maxGrade);
    }

    // Quantise to 5 cm, then clamp again: rounding must never push a segment
    // over the 7.5% limit (the physics grade test caught this before).
    for (let i = 0; i < y.length; i++) y[i] = Math.round(y[i] * 20) / 20;
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < y.length; i++) y[i] = Math.min(y[i], y[i - 1] + maxGrade), y[i] = Math.max(y[i], y[i - 1] - maxGrade);
        for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + maxGrade), y[i] = Math.max(y[i], y[i + 1] - maxGrade);
    }
    for (let i = 0; i < pts.length; i++) pts[i].y = y[i];

    return pts;
}

const colourToBlock = new Map();
function blockFromColour(idx, pal) {
    const hex = pal[idx] || '#000000';
    if (!colourToBlock.has(hex)) colourToBlock.set(hex, guessBlockForColour(hex));
    return colourToBlock.get(hex);
}

function guessBlockForColour(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (r + g + b) / 3;
    if (b > r + 25 && b > g) return 'water';
    if (g > r + 12) return 'grass_block';
    if (lum > 150 && Math.abs(r - b) < 12) return 'smooth_stone';
    if (lum < 70) return 'black_concrete';
    return 'stone';
}

function computeObstacles(h, route, stepSize, originX, originZ, n) {
    // 8 m cells that sit well above the road and are close to it.
    const cell = 8;
    const cells = Math.floor(n * stepSize / cell);
    const routeZ = new Map();
    for (const p of route) routeZ.set(Math.round((p.z - originZ) / cell), p);

    const solid = new Uint8Array(cells * cells);
    for (let cz = 0; cz < cells; cz++) {
        for (let cx2 = 0; cx2 < cells; cx2++) {
            let maxH = -32768;
            for (let z = 0; z < cell; z += 2) {
                for (let x = 0; x < cell; x += 2) {
                    const gx = Math.min(n - 1, Math.floor((cx2 * cell + x) / stepSize));
                    const gz = Math.min(n - 1, Math.floor((cz * cell + z) / stepSize));
                    maxH = Math.max(maxH, h[gz * n + gx]);
                }
            }
            const rp = routeZ.get(cz);
            const centreX = originX + cx2 * cell + cell / 2;
            if (rp && Math.abs(centreX - rp.x) < 34 && maxH > rp.y + 3.5) solid[cz * cells + cx2] = 1;
        }
    }

    // Merge horizontal runs, then stack identical runs vertically.
    const out = [];
    for (let cz = 0; cz < cells; cz++) {
        let runStart = -1;
        for (let cx2 = 0; cx2 <= cells; cx2++) {
            const on = cx2 < cells && solid[cz * cells + cx2] === 1;
            if (on && runStart < 0) runStart = cx2;
            if (!on && runStart >= 0) {
                const x0 = originX + runStart * cell;
                const width = (cx2 - runStart) * cell;
                out.push({
                    x: x0 + width / 2,
                    z: originZ + cz * cell + cell / 2,
                    rx: width / 2,
                    rz: cell / 2
                });
                runStart = -1;
            }
        }
    }
    return out;
}
