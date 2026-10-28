/**
 * Rank regions by "looks like a hand-built town" score.
 *
 *   node tools/mc-bake/find-towns.js <worldDir> [sampleChunks]
 */
import path from 'node:path';
import fs from 'node:fs';
import { RegionFile } from './anvil.js';
import { chunkTopBlocks } from './chunk-blocks.js';

const dir = path.resolve(process.argv[2]);
const samples = Number(process.argv[3] || 10);
const regionDir = path.join(dir, 'region');
const files = fs.readdirSync(regionDir).filter(f => /^r\.-?\d+\.-?\d+\.mca$/.test(f));
const rows = [];

const TOWN = /bricks|planks|terracotta|concrete$|concrete_powder|quartz|wool|glass|stairs|slab|polished|deepslate|cobblestone|stone_bricks/;

for (const file of files) {
    const m = file.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/);
    const region = RegionFile.open(path.join(regionDir, file));
    const keys = region.keys();
    if (!keys.length) continue;
    const step = Math.max(1, Math.floor(keys.length / samples));
    let seen = 0, cols = 0, town = 0, greens = 0, roads = 0;
    let minY = 9999, maxY = -9999;
    const hist = new Map();

    for (let k = 0; k < keys.length && seen < samples; k += step) {
        const key = keys[k];
        const chunk = region.readChunk(key.localX, key.localZ);
        if (!chunk) continue;
        const level = chunk.Level || chunk;
        const status = String(level.Status || chunk.Status || 'minecraft:full').toLowerCase().replace('minecraft:', '');
        if (status !== 'full' && status !== 'spawn') continue;
        seen++;
        const top = chunkTopBlocks(chunk);
        for (let i = 0; i < 256; i++) {
            if (top.y[i] === -32768) continue;
            cols++;
            const b = top.block[i];
            minY = Math.min(minY, top.y[i]);
            maxY = Math.max(maxY, top.y[i]);
            if (TOWN.test(b)) town++;
            if (/grass|leaves|dirt|snow|podzol|mycelium|sand/.test(b)) greens++;
            if (/concrete$|stone$|andesite$|cobblestone$|gravel$|asphalt/.test(b)) roads++;
            hist.set(b, (hist.get(b) || 0) + 1);
        }
    }
    if (!cols) continue;
    rows.push({
        rx: Number(m[1]), rz: Number(m[2]), seen, cols,
        town: town / cols, greens: greens / cols, roads: roads / cols,
        span: maxY - minY, maxY,
        top: [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]
    });
}

rows.sort((a, b) => (b.town + b.span / 200) - (a.town + a.span / 200));
for (const r of rows.slice(0, 12)) {
    console.log(
        `r.${r.rx}.${r.rz}  ymax=${r.maxY} span=${r.span}` +
        `  town=${(r.town * 100).toFixed(0)}% green=${(r.greens * 100).toFixed(0)}%` +
        `  road=${(r.roads * 100).toFixed(0)}%  top=${r.top}`
    );
}
