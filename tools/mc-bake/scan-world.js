/**
 * Scan a Java world and report which regions actually contain generated
 * terrain, plus rough density/height stats. Used to pick bake centres.
 *
 *   node tools/mc-bake/scan-world.js <worldDir>
 */
import path from 'node:path';
import fs from 'node:fs';
import { RegionFile } from './anvil.js';
import { chunkTopBlocks, chunkSections } from './chunk-blocks.js';

const dir = path.resolve(process.argv[2] || '.');
const regionDir = path.join(dir, 'region');
const files = fs.readdirSync(regionDir).filter(f => /^r\.-?\d+\.-?\d+\.mca$/.test(f));

const rows = [];
for (const file of files) {
    const m = file.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/);
    const rx = Number(m[1]);
    const rz = Number(m[2]);
    const region = RegionFile.open(path.join(regionDir, file));
    const keys = region.keys();
    if (!keys.length) continue;

    let full = 0, sampled = 0, build = 0, road = 0, water = 0, sumY = 0, nY = 0, maxY = -9999;
    for (const key of keys.slice(0, 8)) {
        const chunk = region.readChunk(key.localX, key.localZ);
        if (!chunk) continue;
        const level = chunk.Level || chunk;
        const status = String(level.Status || chunk.Status || '').toLowerCase().replace('minecraft:', '');
        sampled++;
        if (status && status !== 'full' && status !== 'spawn') continue;
        full++;
        const top = chunkTopBlocks(chunk);
        for (let i = 0; i < 256; i++) {
            const y = top.y[i];
            if (y === -32768) continue;
            const block = top.block[i];
            sumY += y; nY++; maxY = Math.max(maxY, y);
            if (/concrete|terracotta|quartz|bricks|planks|wool|glass|smooth_stone|polished/.test(block)) build++;
            if (/asphalt|black_concrete|gray_concrete|andesite|smooth_stone$|stone_bricks|stone$/.test(block)) road++;
            if (block.includes('water')) water++;
        }
    }
    rows.push({
        rx, rz,
        chunks: keys.length,
        fullRatio: sampled ? full / sampled : 0,
        avgY: nY ? sumY / nY : 0,
        maxY,
        build: build / Math.max(1, nY),
        road: road / Math.max(1, nY),
        water: water / Math.max(1, nY)
    });
    region.buf = null;
}

const usable = rows.filter(r => r.fullRatio > 0.5 && r.avgY > -9000);
usable.sort((a, b) => (b.build + b.road) - (a.build + a.road));
console.log(`regions=${rows.length} usable=${usable.length}`);
for (const r of usable.slice(0, 14)) {
    console.log(`r.${r.rx}.${r.rz}  chunks=${r.chunks} full=${(r.fullRatio * 100).toFixed(0)}% avgY=${r.avgY.toFixed(1)} maxY=${r.maxY} build=${(r.build * 100).toFixed(0)}% road=${(r.road * 100).toFixed(0)}% water=${(r.water * 100).toFixed(0)}%`);
}
const all = usable.reduce((a, r) => ({ minY: Math.min(a.minY, r.avgY), maxY: Math.max(a.maxY, r.maxY) }), { minY: 9999, maxY: -9999 });
console.log(`avgY range ${all.minY.toFixed(1)} .. ${all.maxY}`);
