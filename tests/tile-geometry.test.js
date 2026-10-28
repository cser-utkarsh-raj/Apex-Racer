import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-three.mjs';

// Registered three stub must be active before these dynamic imports resolve.
const { buildTileGeometry, hash2 } = await import('../src/world/RealMapGeometry.js');
const { RoutePath } = await import('../src/world/RoutePath.js');

const COLS = 16;
const STEP = 1;

function makeManifest(overrides = {}) {
    return {
        id: 'unit',
        step: STEP,
        tileMeters: COLS * STEP,
        tiles: { x: 1, z: 1, cols: COLS },
        origin: { x: 0, z: 0 },
        size: { x: COLS * STEP, z: COLS * STEP },
        columns: COLS,
        palette: ['#000000', '#ffffff', '#804020'],
        route: [],
        ...overrides
    };
}

function flatTile(height = 20, colour = 1) {
    return {
        heights: new Int16Array(COLS * COLS).fill(height),
        colors: new Uint8Array(COLS * COLS).fill(colour)
    };
}

function build(tile, overrides = {}) {
    return buildTileGeometry(tile, {
        manifest: makeManifest(),
        route: new RoutePath([]),
        tx: 0,
        tz: 0,
        palette: [[0, 0, 0], [1, 1, 1], [0.5, 0.25, 0.125]],
        road: {
            width: 8, shoulder: 1, sidewalk: 1, shelf: 2,
            roadColor: [0.1, 0.1, 0.1], sidewalkColor: [0.5, 0.5, 0.5]
        },
        windows: false,
        windowColors: ['#ffcf8a'],
        ...overrides
    });
}

function quadCount(geometry) {
    return geometry.attributes.position.array.length / 18;
}

test('hash2 is deterministic and 32-bit unsigned', () => {
    assert.equal(hash2(3, 7, 11), hash2(3, 7, 11));
    assert.notEqual(hash2(3, 7, 11), hash2(7, 3, 11));
    const v = hash2(-5, 9, 0);
    assert.ok(v >= 0 && v <= 0xffffffff);
});

test('a flat tile merges to one quad per row', () => {
    const { litGeometry, glowGeometry, ox, oz } = build(flatTile(20, 1));
    assert.equal(quadCount(litGeometry), COLS); // 16 rows x 1 greedy run
    assert.equal(glowGeometry, null);
    assert.equal(ox, 0);
    assert.equal(oz, 0);

    const pos = litGeometry.attributes.position.array;
    const col = litGeometry.attributes.color.array;
    assert.equal(pos.length, COLS * 18);
    assert.equal(col.length, pos.length);
    assert.equal(litGeometry.attributes.normal.array.length, pos.length);

    // All normals point up and all vertices sit at y = 20.
    for (let i = 0; i < litGeometry.attributes.normal.array.length; i += 3) {
        assert.equal(litGeometry.attributes.normal.array[i + 1], 1);
        assert.equal(pos[i + 1], 20);
    }
    // Tile-local coordinates stay inside the 16 m tile.
    for (let i = 0; i < pos.length; i += 3) {
        assert.ok(pos[i] >= 0 && pos[i] <= COLS * STEP);
        assert.ok(pos[i + 2] >= 0 && pos[i + 2] <= COLS * STEP);
    }
});

test('taller columns produce wall quads', () => {
    const tile = flatTile(20, 1);
    const tower = 1 * COLS + 1;
    tile.heights[tower] = 30;

    const { litGeometry } = build(tile);
    const pos = litGeometry.attributes.position.array;
    let maxY = -Infinity;
    let wallVertices = 0;
    for (let i = 0; i < pos.length; i += 3) {
        maxY = Math.max(maxY, pos[i + 1]);
        if (pos[i + 1] === 20) wallVertices++;
    }
    assert.equal(maxY, 30);
    assert.ok(wallVertices > 0);
    // 16 merged roof runs, two extra runs in the tower row, plus 4 wall faces.
    assert.equal(quadCount(litGeometry), COLS + 2 + 4);
});

test('corridor carve raises road, shoulder and sidewalk to route height', () => {
    const route = new RoutePath([{ x: 8, y: 10, z: -50 }, { x: 8, y: 10, z: 50 }]);
    const { litGeometry } = build(flatTile(20, 1), { route });
    const pos = litGeometry.attributes.position.array;
    const ys = new Set();
    for (let i = 0; i < pos.length; i += 3) ys.add(Math.round(pos[i + 1] * 100) / 100);

    assert.ok(ys.has(10), 'road surface');
    assert.ok(ys.has(10.02), 'shoulder');
    assert.ok(ys.has(10.16), 'raised sidewalk');
    assert.ok(ys.has(20), 'untouched map');
});

test('night mode dims terrain but leaves asphalt alone', () => {
    const day = build(flatTile(20, 1));
    const night = build(flatTile(20, 1), { night: true });

    const dayCol = day.litGeometry.attributes.color.array;
    const nightCol = night.litGeometry.attributes.color.array;
    assert.ok(nightCol[0] < dayCol[0]);
    assert.ok(Math.abs(nightCol[0] - dayCol[0] * 0.68) < 1e-6);

    // Asphalt is a corridor colour and must not be dimmed twice.
    const route = new RoutePath([{ x: 8, y: 10, z: -50 }, { x: 8, y: 10, z: 50 }]);
    const dayRoad = build(flatTile(20, 1), { route });
    const nightRoad = build(flatTile(20, 1), { route, night: true });
    const dayRoadPos = dayRoad.litGeometry.attributes.position.array;
    const nightRoadPos = nightRoad.litGeometry.attributes.position.array;
    const findRoadVertex = (pos, col) => {
        for (let i = 0; i < pos.length; i += 3) {
            if (Math.abs(pos[i + 1] - 10) < 1e-6) return [col[i], col[i + 1], col[i + 2]];
        }
        return null;
    };
    assert.deepEqual(
        findRoadVertex(nightRoadPos, nightRoad.litGeometry.attributes.color.array),
        findRoadVertex(dayRoadPos, dayRoad.litGeometry.attributes.color.array)
    );
});

test('window quads appear only on tall façades with windows enabled', () => {
    const tile = flatTile(20, 1);
    const tower = 1 * COLS + 1;
    tile.heights[tower] = 32;

    const off = build(tile, { windows: false });
    assert.equal(off.glowGeometry, null);

    const on = build(tile, { windows: true, windowColors: ['#ffcf8a', '#8fd0ff'] });
    assert.ok(on.glowGeometry, 'expected a glow mesh');
    const glowPos = on.glowGeometry.attributes.position.array;
    assert.ok(glowPos.length > 0);
    // Windows sit inside the tower façade, between roof level and the top.
    for (let i = 0; i < glowPos.length; i += 3) {
        assert.ok(glowPos[i + 1] >= 20);
        assert.ok(glowPos[i + 1] <= 32);
    }
});

test('walls use a darker top vertex than bottom vertex', () => {
    const tile = flatTile(20, 1);
    tile.heights[1 * COLS + 1] = 30;
    const { litGeometry } = build(tile);
    const pos = litGeometry.attributes.position.array;
    const col = litGeometry.attributes.color.array;

    // Gather the four wall faces by finding non-up normals.
    const nrm = litGeometry.attributes.normal.array;
    let found = false;
    for (let i = 0; i < nrm.length; i += 9) {
        if (nrm[i + 1] === 1) continue;
        const y0 = pos[i + 1];
        const y2 = pos[i + 7];
        if (Math.abs(y2 - y0) < 1) continue;
        const c0 = col[i];
        const c2 = col[i + 6];
        assert.ok(c2 < c0, 'top of the wall should be darker');
        found = true;
    }
    assert.equal(found, true);
});

test('vegetation cliffs use an earth tone instead of bright green', () => {
    // A grass-topped hill must not render as a 10 m green wall.
    const tile = flatTile(20, 1);
    tile.heights[2 * COLS + 2] = 30;
    const grass = [[0, 0, 0], [0.36, 0.55, 0.25], [0.5, 0.25, 0.125]];
    const { litGeometry } = build(tile, { palette: grass });
    const pos = litGeometry.attributes.position.array;
    const col = litGeometry.attributes.color.array;
    const nrm = litGeometry.attributes.normal.array;

    let checked = 0;
    for (let i = 0; i < nrm.length; i += 9) {
        if (nrm[i + 1] === 1) continue; // skip roofs
        const y0 = pos[i + 1], y1 = pos[i + 7];
        if (Math.abs(y1 - y0) < 5) continue;
        const r = col[i], g = col[i + 1], b = col[i + 2];
        assert.ok(r > 0.18, 'cliff face is not black');
        assert.ok(g < r * 1.25, `cliff face too green: r=${r} g=${g}`);
        assert.ok(b < g, 'earth has a warm order r >= g > b');
        checked++;
    }
    assert.ok(checked >= 4, 'checked all four cliff faces');
});

test('built façades keep their material colour', () => {
    const tile = flatTile(20, 1);
    tile.heights[2 * COLS + 2] = 30;
    const concrete = [[0, 0, 0], [0.5, 0.5, 0.5], [0.5, 0.25, 0.125]];
    const { litGeometry } = build(tile, { palette: concrete });
    const pos = litGeometry.attributes.position.array;
    const col = litGeometry.attributes.color.array;
    const nrm = litGeometry.attributes.normal.array;

    for (let i = 0; i < nrm.length; i += 9) {
        if (nrm[i + 1] === 1) continue;
        if (Math.abs(pos[i + 7] - pos[i + 1]) < 5) continue;
        const r = col[i], g = col[i + 1], b = col[i + 2];
        assert.ok(Math.abs(r - g) < 0.02 && Math.abs(g - b) < 0.02, 'concrete stays grey');
        break;
    }
});

test('missing columns are skipped instead of drawing at the sentinel height', () => {
    const tile = flatTile(20, 1);
    // Knock out one whole column.
    for (let cz = 0; cz < COLS; cz++) tile.heights[cz * COLS + 3] = -32768;

    const { litGeometry } = build(tile);
    const pos = litGeometry.attributes.position.array;
    const nrm = litGeometry.attributes.normal.array;
    for (let i = 0; i < pos.length; i += 3) {
        assert.ok(pos[i + 1] !== -32768);
    }
    // The hole splits each row into two greedy top runs (walls are separate).
    let topQuads = 0;
    for (let i = 0; i < nrm.length; i += 18) {
        if (nrm[i + 1] === 1) topQuads++;
    }
    assert.equal(topQuads, COLS * 2);
});
