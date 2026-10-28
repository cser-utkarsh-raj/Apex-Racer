/**
 * Print the most common top blocks + height stats for chosen regions.
 *
 *   node tools/mc-bake/probe3.js <worldDir> <rx> <rz> [chunks]
 */
import path from 'node:path';
import { RegionFile } from './anvil.js';
import { chunkTopBlocks } from './chunk-blocks.js';

const dir = path.resolve(process.argv[2]);
const rx = Number(process.argv[3] || 0);
const rz = Number(process.argv[4] || 0);
const limit = Number(process.argv[5] || 24);
const region = RegionFile.open(path.join(dir, 'region', `r.${rx}.${rz}.mca`));
const keys = region.keys();
const hist = new Map();
let minY = 9999, maxY = -9999, cols = 0, seen = 0;

for (const key of keys) {
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
        minY = Math.min(minY, top.y[i]);
        maxY = Math.max(maxY, top.y[i]);
        hist.set(top.block[i], (hist.get(top.block[i]) || 0) + 1);
    }
    if (seen >= limit) break;
}

console.log(`r.${rx}.${rz}: chunks ${seen}  columns ${cols}  y ${minY}..${maxY}`);
for (const [name, count] of [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
    console.log(`   ${name.padEnd(34)} ${count}`);
}
