import path from 'node:path';
import { readNbtFile } from './nbt.js';
import { RegionFile } from './anvil.js';
import { chunkTopBlocks } from './chunk-blocks.js';

const ROOT = path.resolve('Downloaded Assests/Maps');

const WORLDS = {
    neo_tazader: path.join(ROOT, 'GreaterKCMetro_v1.1/GreaterKCMetro'),
    chiang_tung: path.join(ROOT, 'Kingdom_of_Chiang_Tung/Kingdom of Chiang Tung'),
    curitiba: path.join(ROOT, 'Curitiba_3-12/Curitiba 3-12'),
    nantwich: path.join(ROOT, 'Map-1/Nantwich, Cheshire Java')
};

for (const [id, dir] of Object.entries(WORLDS)) {
    const level = readNbtFile(path.join(dir, 'level.dat'));
    const d = level.Data || level;
    const version = (d.Version && d.Version.Name) || '?';
    const dv = d.DataVersion;
    const spawn = {
        x: d.SpawnX ?? (d.SpawnPos && d.SpawnPos[0]),
        y: d.SpawnY ?? (d.SpawnPos && d.SpawnPos[1]),
        z: d.SpawnZ ?? (d.SpawnPos && d.SpawnPos[2])
    };
    console.log(`\n=== ${id}`);
    console.log(`  dir      ${dir}`);
    console.log(`  version  ${version}  (DataVersion ${dv})`);
    console.log(`  spawn    x=${spawn.x} y=${spawn.y} z=${spawn.z}`);
    console.log(`  level    ${d.LevelName || ''}`);
}
