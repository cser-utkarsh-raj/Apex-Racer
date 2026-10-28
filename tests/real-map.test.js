import test from 'node:test';
import assert from 'node:assert/strict';
import { RealMap, decodeTile, hexToRgb } from '../src/world/RealMap.js';

const COLS = 2;
const STEP = 2;
const TILE_METERS = COLS * STEP;

function manifest(overrides = {}) {
    return {
        id: 'test_world',
        step: STEP,
        tileMeters: TILE_METERS,
        tiles: { x: 2, z: 2, cols: COLS },
        origin: { x: 0, z: 0 },
        size: { x: 8, z: 8 },
        columns: 4,
        palette: ['#000000', '#ff0000', '#00ff00'],
        route: [[0, 5, 0], [0, 5, 8]],
        waterLevel: null,
        obstacles: [],
        ...overrides
    };
}

/** Encode one tile buffer: int16 LE height + 1 palette byte per column. */
function tileBuffer(cols, fn) {
    const buffer = new ArrayBuffer(cols * cols * 3);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < cols * cols; i++) {
        const { y, c } = fn(i);
        view.setInt16(i * 3, y, true);
        bytes[i * 3 + 2] = c;
    }
    return buffer;
}

function fakeFetch(map) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (url.endsWith('/manifest.json')) {
            return { ok: true, status: 200, json: async () => map };
        }
        const match = url.match(/t_(\d+)_(\d+)\.bin$/);
        if (!match) return { ok: false, status: 404 };
        const tx = Number(match[1]), tz = Number(match[2]);
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => tileBuffer(COLS, i => ({
                y: tz * 100 + tx * 10 + (i % COLS),
                c: (tx + tz) % 3
            }))
        };
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

test('decodeTile reads interleaved int16 height + palette byte', () => {
    const buffer = tileBuffer(2, i => ({ y: i - 2, c: i + 1 }));
    const tile = decodeTile(buffer, 2);
    assert.deepEqual([...tile.heights], [-2, -1, 0, 1]);
    assert.deepEqual([...tile.colors], [1, 2, 3, 4]);
});

test('hexToRgb converts css colours to 0..1 floats', () => {
    assert.deepEqual(hexToRgb('#ff0000'), [1, 0, 0]);
    assert.deepEqual(hexToRgb('#00ff00'), [0, 1, 0]);
    const grey = hexToRgb('#808080');
    assert.ok(Math.abs(grey[0] - 128 / 255) < 1e-9);
});

test('load fetches manifest and builds a RoutePath', async () => {
    const fetchImpl = fakeFetch(manifest());
    const map = await RealMap.load('test_world', { fetchImpl, baseUrl: '/w' });

    assert.equal(map.id, 'test_world');
    assert.equal(fetchImpl.calls[0], '/w/manifest.json');
    assert.equal(map.route.zMin, 0);
    assert.equal(map.route.zMax, 8);
    assert.deepEqual(map.palette[1], [1, 0, 0]);
});

test('load rejects a bad manifest response', async () => {
    await assert.rejects(
        () => RealMap.load('missing', { fetchImpl: async () => ({ ok: false, status: 404 }) }),
        /HTTP 404/
    );
});

test('ensureTile decodes, caches and de-duplicates concurrent requests', async () => {
    const fetchImpl = fakeFetch(manifest());
    const map = new RealMap(manifest(), { fetchImpl, baseUrl: '/w' });

    const [a, b] = await Promise.all([map.ensureTile(0, 0), map.ensureTile(0, 0)]);
    assert.equal(a, b);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(a.heights[0], 0);
    assert.equal(a.colors[0], 0);
    assert.equal(a.tx, 0);
    assert.equal(a.tz, 0);

    const again = await map.ensureTile(0, 0);
    assert.equal(again, a);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(map.loadedBytes, COLS * COLS * 3);
});

test('ensureTile returns null outside the baked tile grid', async () => {
    const fetchImpl = fakeFetch(manifest());
    const map = new RealMap(manifest(), { fetchImpl, baseUrl: '/w' });

    assert.equal(await map.ensureTile(-1, 0), null);
    assert.equal(await map.ensureTile(2, 0), null);
    assert.equal(await map.ensureTile(0, 2), null);
    assert.equal(fetchImpl.calls.length, 0);
});

test('heightAt and colorAt read only loaded tiles', async () => {
    const fetchImpl = fakeFetch(manifest());
    const map = new RealMap(manifest(), { fetchImpl, baseUrl: '/w' });

    assert.equal(map.heightAt(1, 1), null);
    await map.ensureTile(0, 0);

    // (1,1) is tile 0,0 column (0,0) with y = 0.
    assert.equal(map.heightAt(1, 1), 0);
    // (3,3) is tile 0,0 column (1,1) with y = 1.
    assert.equal(map.heightAt(3, 3), 1);
    // Palette 0 is black.
    assert.deepEqual(map.colorAt(1, 1), [0, 0, 0]);
    // Second tile is not streamed yet.
    assert.equal(map.heightAt(5, 1), null);
    assert.equal(map.colorAt(5, 1), null);
});

test('tileCoordAt clamps to the baked area and returns null at edges', () => {
    const map = new RealMap(manifest());
    assert.deepEqual(map.tileCoordAt(0, 0), { tx: 0, tz: 0, cx: 0, cz: 0 });
    assert.deepEqual(map.tileCoordAt(3, 3), { tx: 0, tz: 0, cx: 1, cz: 1 });
    assert.deepEqual(map.tileCoordAt(4, 4), { tx: 1, tz: 1, cx: 0, cz: 0 });
    assert.equal(map.tileCoordAt(-0.1, 1), null);
    assert.equal(map.tileCoordAt(1, -0.1), null);
    assert.equal(map.tileCoordAt(8, 1), null);
    assert.equal(map.tileCoordAt(1, 8), null);
    assert.equal(map.contains(4, 4), true);
    assert.equal(map.contains(8, 4), false);
});

test('groundAt falls back to the route when a tile is missing', () => {
    const map = new RealMap(manifest());
    assert.equal(map.groundAt(1, 4), 5);
});

test('tilesInRange covers every column row in the Z window', () => {
    const map = new RealMap(manifest());
    const tiles = map.tilesInRange(-50, 50);
    // Two tile rows x two tile columns.
    assert.equal(tiles.length, 4);
    assert.deepEqual(tiles[0], { tx: 0, tz: 0 });
    assert.deepEqual(tiles[3], { tx: 1, tz: 1 });
});

test('dispose clears the tile cache', async () => {
    const fetchImpl = fakeFetch(manifest());
    const map = new RealMap(manifest(), { fetchImpl, baseUrl: '/w' });
    await map.ensureTile(0, 0);
    map.dispose();
    assert.equal(map.tiles.size, 0);
    assert.equal(map.loadedBytes, 0);
    assert.equal(map.heightAt(1, 1), null);
});
