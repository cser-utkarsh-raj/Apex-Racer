/**
 * Geometry budget probe: replicate the tile mesher and report quad counts.
 *
 *   node tools/mc-bake/stats-geometry.js neo_tazader 2 3
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const id = process.argv[2] || 'neo_tazader';
const wantTx = Number(process.argv[3] ?? 2);
const wantTz = Number(process.argv[4] ?? 3);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/worlds', id, 'manifest.json'), 'utf8'));
const cols = manifest.tiles.cols;
const step = manifest.step;

function decode(buf) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const heights = new Int16Array(cols * cols);
    const colors = new Uint8Array(cols * cols);
    for (let i = 0; i < cols * cols; i++) {
        heights[i] = view.getInt16(i * 3, true);
        colors[i] = buf[i * 3 + 2];
    }
    return { heights, colors };
}

const route = manifest.route.map(p => ({ x: p[0], y: p[1], z: p[2] }));

function routeAt(z) {
    if (z <= route[0].z) return route[0];
    if (z >= route[route.length - 1].z) return route[route.length - 1];
    let lo = 0, hi = route.length - 1;
    while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (route[mid].z <= z) lo = mid; else hi = mid;
    }
    const a = route[lo], b = route[lo + 1];
    const t = (z - a.z) / ((b.z - a.z) || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z };
}

const half = 13, shoulder = 1.6, sidewalk = 3.2, shelf = 10;

for (const [tx, tz] of [[wantTx, wantTz]]) {
    const file = path.join(ROOT, 'assets/worlds', id, 'tiles', `t_${tx}_${tz}.bin`);
    const tile = decode(fs.readFileSync(file));
    const ox = manifest.origin.x + tx * cols * step;
    const oz = manifest.origin.z + tz * cols * step;

    const surface = new Float32Array(cols * cols);
    const colour = new Uint8Array(cols * cols);
    const road = new Uint8Array(cols * cols);
    const walk = new Uint8Array(cols * cols);

    for (let cz = 0; cz < cols; cz++) {
        const wz = oz + (cz + 0.5) * step;
        const c = routeAt(wz);
        for (let cx = 0; cx < cols; cx++) {
            const i = cz * cols + cx;
            const wx = ox + (cx + 0.5) * step;
            surface[i] = tile.heights[i];
            colour[i] = tile.colors[i];
            const abs = Math.abs(wx - c.x);
            if (abs <= half + 0.35) { surface[i] = c.y; road[i] = 1; }
            else if (abs <= half + shoulder + 0.35) { surface[i] = c.y + 0.01; }
            else if (abs <= half + shoulder + sidewalk + 0.35) { surface[i] = c.y + 0.16; walk[i] = 1; }
            else if (abs <= half + shoulder + sidewalk + shelf) {
                const cap = c.y + 2.2;
                if (surface[i] > cap) surface[i] = cap;
                if (surface[i] < c.y - 1.2) surface[i] = c.y - 1.2;
            }
        }
    }

    let tops = 0, walls = 0, dropped = 0;
    for (let cz = 0; cz < cols; cz++) {
        let cx = 0;
        while (cx < cols) {
            const i = cz * cols + cx;
            const h = surface[i];
            let run = 1;
            while (cx + run < cols) {
                const j = i + run;
                if (surface[j] !== h) break;
                if (colour[j] !== colour[i]) break;
                if (road[j] !== road[i] || walk[j] !== walk[i]) break;
                run++;
            }
            tops++;
            cx += run;
        }
    }
    const get = (x, z) => (x < 0 || z < 0 || x >= cols || z >= cols) ? null : surface[z * cols + x];
    for (let cz = 0; cz < cols; cz++) {
        for (let cx = 0; cx < cols; cx++) {
            const h = surface[cz * cols + cx];
            const sides = [get(cx - 1, cz), get(cx + 1, cz), get(cx, cz - 1), get(cx, cz + 1)];
            for (const n of sides) {
                if (n !== null && h > n) {
                    if (h - n > 0.22) walls++; else dropped++;
                }
            }
        }
    }
    console.log(`${id} tile ${tx},${tz}: topQuads=${tops} wallQuads=${walls} skippedSmall=${dropped} total=${tops + walls}`);
    console.log(`  approx verts ${(tops + walls) * 6}  bytes ${(((tops + walls) * 6 * 9 * 4) / 1048576).toFixed(1)} MB`);
}
