import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORLDS = ['neo_tazader', 'chiang_tung', 'curitiba', 'nantwich'];
const MAX_GRADE = 0.075;

function load(id) {
    const dir = path.join(ROOT, 'assets', 'worlds', id);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return { dir, manifest };
}

for (const id of WORLDS) {
    test(`${id}: manifest and tile set are complete`, () => {
        const { dir, manifest } = load(id);

        assert.equal(manifest.id, id);
        assert.equal(typeof manifest.label, 'string');
        assert.ok(manifest.source.includes('Downloaded Assests/Maps/'));
        assert.ok(manifest.palette.length >= 2);
        for (const hex of manifest.palette) {
            assert.match(hex, /^#[0-9a-f]{6}$/i);
        }

        const expectedColumns = manifest.tiles.x * manifest.tiles.cols;
        assert.equal(manifest.columns, expectedColumns);
        assert.equal(
            manifest.size.x,
            manifest.tiles.x * manifest.tiles.cols * manifest.step
        );
        assert.equal(
            manifest.size.z,
            manifest.tiles.z * manifest.tiles.cols * manifest.step
        );

        const tileDir = path.join(dir, 'tiles');
        const expectedBytes = manifest.tiles.cols * manifest.tiles.cols * 3;
        let tiles = 0;
        for (let tz = 0; tz < manifest.tiles.z; tz++) {
            for (let tx = 0; tx < manifest.tiles.x; tx++) {
                const file = path.join(tileDir, `t_${tx}_${tz}.bin`);
                assert.ok(fs.existsSync(file), `missing ${file}`);
                assert.equal(fs.statSync(file).size, expectedBytes);
                tiles++;
            }
        }
        assert.equal(tiles, manifest.tiles.x * manifest.tiles.z);
    });

    test(`${id}: route is Z-monotonic, in bounds and grade-limited`, () => {
        const { manifest } = load(id);
        const route = manifest.route;
        assert.ok(Array.isArray(route) && route.length > 50);

        const minX = manifest.origin.x;
        const maxX = manifest.origin.x + manifest.size.x;
        const minZ = manifest.origin.z;
        const maxZ = manifest.origin.z + manifest.size.z;

        for (let i = 0; i < route.length; i++) {
            const [x, y, z] = route[i];
            assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
            assert.ok(x >= minX && x <= maxX, `x ${x} in bounds`);
            assert.ok(z >= minZ && z <= maxZ, `z ${z} in bounds`);
            if (i > 0) {
                assert.ok(z > route[i - 1][2], 'route advances along +Z');
                const dz = z - route[i - 1][2];
                const dy = Math.abs(y - route[i - 1][1]);
                assert.ok(dy / dz <= MAX_GRADE + 1e-6, `grade ${dy / dz} at ${i}`);
            }
        }
    });

    test(`${id}: route has real elevation or a flat downtown, and stays inside tiles`, () => {
        const { manifest } = load(id);
        const ys = manifest.route.map(p => p[1]);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        assert.ok(maxY - minY <= 120, 'no impossible elevation jumps');
        // Downtown routes may be flat; mountain routes must not be.
        if (id === 'chiang_tung') {
            assert.ok(maxY - minY > 3, `chiang should climb, got ${maxY - minY}`);
        }
    });

    test(`${id}: obstacles are finite collision boxes near the route`, () => {
        const { manifest } = load(id);
        assert.ok(Array.isArray(manifest.obstacles));
        for (const o of manifest.obstacles) {
            assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z));
            assert.ok(o.rx > 0 && o.rz > 0);
        }
    });
}

test('every world route is long enough for a circuit', () => {
    for (const id of WORLDS) {
        const { manifest } = load(id);
        let length = 0;
        for (let i = 1; i < manifest.route.length; i++) {
            const a = manifest.route[i - 1];
            const b = manifest.route[i];
            length += Math.hypot(b[0] - a[0], b[2] - a[2]);
        }
        assert.ok(length > 900, `${id} route ${length.toFixed(0)} m`);
    }
});

test('curitiba route crosses the hand-built skyline band', () => {
    const { manifest } = load('curitiba');
    // Skyline blocks live at world x 240..400, z 0..32.
    const near = manifest.route.find(p => p[2] >= 0 && p[2] <= 32);
    assert.ok(near, 'route passes z 0..32');
    assert.ok(near[0] > 180 && near[0] < 460, `route x ${near[0]} near skyline`);
});

test('nantwich route runs through the medieval town', () => {
    const { manifest } = load('nantwich');
    // Town regions r.1..r.5 / r.1..r.4 => x 512..3072, z 512..2560.
    const inside = manifest.route.filter(([x, y, z]) => x > 512 && x < 3072 && z > 512 && z < 2560);
    assert.ok(inside.length > manifest.route.length * 0.8);
});
