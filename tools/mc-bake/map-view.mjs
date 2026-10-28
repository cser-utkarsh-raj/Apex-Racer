/**
 * Dev-only: coarse ASCII overview of a baked world, to check where the route
 * actually runs relative to the buildings. Not used at runtime.
 *
 *   node tools/mc-bake/map-view.mjs nantwich
 */
import fs from 'node:fs';

const id = process.argv[2] || 'nantwich';
const cell = Number(process.argv[3] || 12);
const dir = `assets/worlds/${id}`;
const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'));
const cols = m.tiles.cols, step = m.step, tm = m.tileMeters;

const W = Math.floor(m.size.x / cell);
const H = Math.floor(m.size.z / cell);
const height = new Float32Array(W * H).fill(-32768);
const colour = new Uint8Array(W * H);
const wet = new Uint8Array(W * H);
const palette = m.palette.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

for (let tz = 0; tz < m.tiles.z; tz++) {
    for (let tx = 0; tx < m.tiles.x; tx++) {
        const buf = fs.readFileSync(`${dir}/tiles/t_${tx}_${tz}.bin`);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (let i = 0; i < cols * cols; i++) {
            const y = view.getInt16(i * 3, true);
            if (y === -32768) continue;
            const cx = i % cols, cz = (i / cols) | 0;
            const wx = m.origin.x + tx * tm + (cx + 0.5) * step;
            const wz = m.origin.z + tz * tm + (cz + 0.5) * step;
            const gx = Math.floor((wx - m.origin.x) / cell);
            const gz = Math.floor((wz - m.origin.z) / cell);
            if (gx < 0 || gz < 0 || gx >= W || gz >= H) continue;
            const k = gz * W + gx;
            if (y > height[k]) { height[k] = y; colour[k] = view.getUint8(i * 3 + 2); }
        }
    }
}

// Route cells and local route height.
const routeCells = new Map();
for (let i = 0; i < m.route.length; i++) {
    const [x, y, z] = m.route[i];
    const gx = Math.floor((x - m.origin.x) / cell);
    const gz = Math.floor((z - m.origin.z) / cell);
    routeCells.set(gz * W + gx, y);
}

// Local reference height per Z row: interpolate the route so relief away from
// the road is measured against the nearby ground, not against y=0.
const rowRef = new Float32Array(H);
const routeByZ = m.route.slice().sort((a, b) => a[2] - b[2]);
for (let gz = 0; gz < H; gz++) {
    const z = m.origin.z + (gz + 0.5) * cell;
    let best = routeByZ[0];
    for (const p of routeByZ) if (Math.abs(p[2] - z) < Math.abs(best[2] - z)) best = p;
    rowRef[gz] = best[1];
}

const rows = [];
for (let gz = H - 1; gz >= 0; gz--) {
    let line = '';
    for (let gx = 0; gx < W; gx++) {
        const k = gz * W + gx;
        const y = height[k];
        const ry = routeCells.get(k);
        if (ry !== undefined) { line += 'R'; continue; }
        if (y === -32768) { line += ' '; continue; }
        const [r, g, b] = palette[colour[k]] || [128, 128, 128];
        const rel = y - rowRef[gz];
        if (b > r + 18 && b > g) { line += '~'; continue; }
        if (rel > 6) line += '#';
        else if (rel > 2.5) line += '=';
        else if (rel > 0.8) line += '+';
        else if (g > r + 14 && g > b + 8) line += ',';
        else if (r > g + 20) line += ':';
        else line += '.';
    }
    rows.push(line);
}

const ys = m.route.map(p => p[1]);
console.log(`${id}: ${W}x${H} cells of ${cell} m, origin ${m.origin.x},${m.origin.z}, route y ${Math.min(...ys)}..${Math.max(...ys)}`);
console.log('legend: R route  # tall  = raised  + low  , grass  : warm  . flat  ~ water');
console.log('   x ' + m.origin.x + ' .. ' + (m.origin.x + m.size.x));
for (let i = 0; i < rows.length; i++) {
    const z = m.origin.z + (rows.length - 1 - i) * cell;
    console.log(String(z).padStart(6) + ' ' + rows[i]);
}
