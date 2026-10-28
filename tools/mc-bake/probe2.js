import path from 'node:path';
import fs from 'node:fs';
import { RegionFile } from './anvil.js';
import { chunkTopBlocks, blockColor } from './chunk-blocks.js';

const ROOT = path.resolve('Downloaded Assests/Maps');
const WORLDS = {
    neo_tazader: path.join(ROOT, 'GreaterKCMetro_v1.1/GreaterKCMetro/region'),
    chiang_tung: path.join(ROOT, 'Kingdom_of_Chiang_Tung/Kingdom of Chiang Tung/region'),
    curitiba: path.join(ROOT, 'Curitiba_3-12/Curitiba 3-12/region'),
    nantwich: path.join(ROOT, 'Map-1/Nantwich, Cheshire Java/region')
};
const TARGET = { neo_tazader: [0, 0], chiang_tung: [0, 0], curitiba: [6, -2], nantwich: [3, 3] };

for (const [id, dir] of Object.entries(WORLDS)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.mca') && fs.statSync(path.join(dir, f)).size > 100000);
    let [rx, rz] = TARGET[id];
    let file = path.join(dir, `r.${rx}.${rz}.mca`);
    if (!fs.existsSync(file) || fs.statSync(file).size < 100000) file = path.join(dir, files[Math.floor(files.length / 2)]);
    const region = RegionFile.open(file);
    const keys = region.keys();
    console.log(`\n=== ${id}: ${path.basename(file)} chunks=${keys.length}`);
    let done = 0;
    for (const key of keys.slice(0, 6)) {
        const chunk = region.readChunk(key.localX, key.localZ);
        if (!chunk) { console.log('  unreadable chunk', key); continue; }
        const data = chunk.sections ? chunk : (chunk.Level || chunk);
        const top = chunkTopBlocks(data);
        const hist = new Map();
        let min = 9999, max = -9999;
        for (let i = 0; i < 256; i++) {
            const y = top.y[i];
            if (y === -32768) continue;
            min = Math.min(min, y); max = Math.max(max, y);
            hist.set(top.block[i], (hist.get(top.block[i]) || 0) + 1);
        }
        const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
        console.log(`  chunk ${key.localX},${key.localZ} y=${min}..${max} top: ${sorted.map(([n, c]) => `${n}(${c})`).join(', ')}`);
        console.log(`    sample colors: ${sorted.slice(0, 4).map(([n]) => n + '=' + blockColor(n)).join(' ')}`);
        if (++done >= 3) break;
    }
}
