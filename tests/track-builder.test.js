import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-three.mjs';

const {
    buildGuardrailGeometry,
    buildRoadGeometry,
    buildStreetlights
} = await import('../src/world/TrackBuilder.js');
const { RoutePath } = await import('../src/world/RoutePath.js');

const route = new RoutePath([
    { x: 0, y: 10, z: -120 },
    { x: 20, y: 14, z: 0 },
    { x: 20, y: 18, z: 120 }
]);

function style(night = false) {
    return {
        night,
        road: {
            width: 20,
            shoulder: 1.5,
            sidewalk: 3,
            shelf: 9,
            roadColor: [0.12, 0.12, 0.13],
            sidewalkColor: [0.3, 0.3, 0.3],
            railColor: 0x8899aa,
            lineColor: 0xf4d24a,
            edgeColor: 0xffffff,
            streetlight: 0xffd9a0,
            streetlightSpacing: 40
        }
    };
}

function assertValidGeometry(geo, label) {
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    assert.ok(pos.length > 0, `${label} has positions`);
    assert.equal(pos.length % 18, 0, `${label} is made of quads`);
    assert.equal(col.length, pos.length, `${label} colours match positions`);
    for (let i = 0; i < pos.length; i++) {
        assert.ok(Number.isFinite(pos[i]), `${label} finite position ${i}`);
        assert.ok(Number.isFinite(col[i]), `${label} finite colour ${i}`);
    }
    for (let i = 0; i < col.length; i++) {
        assert.ok(col[i] >= 0 && col[i] <= 1, `${label} colour in range`);
    }
}

test('road ribbon covers the full route with flat up normals', () => {
    const geo = buildRoadGeometry(route, style());
    assertValidGeometry(geo, 'road');
    const nrm = geo.attributes.normal.array;
    for (let i = 0; i < nrm.length; i += 3) {
        assert.deepEqual([nrm[i], nrm[i + 1], nrm[i + 2]], [0, 1, 0]);
    }

    const pos = geo.attributes.position.array;
    let minZ = Infinity, maxZ = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        minZ = Math.min(minZ, pos[i + 2]);
        maxZ = Math.max(maxZ, pos[i + 2]);
        minY = Math.min(minY, pos[i + 1]);
        maxY = Math.max(maxY, pos[i + 1]);
    }
    assert.equal(minZ, route.zMin);
    assert.equal(maxZ, route.zMax);
    // Route climbs 8 m; ribbon floats a few cm above it.
    assert.ok(minY >= 10 && minY < 10.05);
    assert.ok(maxY >= 18 && maxY < 18.05);
});

test('road surface stays inside the route centreline + half width', () => {
    const geo = buildRoadGeometry(route, style());
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
        const z = pos[i + 2];
        const centre = route.atZ(z);
        assert.ok(Math.abs(pos[i] - centre.x) <= 20 / 2 + 1.5 + 1e-6);
    }
});

test('guardrails are generated on both sides with computed normals', () => {
    const geo = buildGuardrailGeometry(route, style());
    assertValidGeometry(geo, 'rails');
    const nrm = geo.attributes.normal.array;
    let nonzero = 0;
    for (let i = 0; i < nrm.length; i += 3) {
        if (Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) > 0.1) nonzero++;
    }
    assert.ok(nonzero > 0, 'rails have real normals');

    const pos = geo.attributes.position.array;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i]);
        maxX = Math.max(maxX, pos[i]);
    }
    // Route x spans 0..20; rails add the offset on both sides.
    assert.ok(minX <= -10);
    assert.ok(maxX >= 30);
});

test('guardrails follow bends instead of stepping sideways in world X', () => {
    // A hard S-bend: axis-aligned rail boxes used to leave gaps here.
    const bend = new RoutePath([
        { x: 0, y: 10, z: -120 },
        { x: 40, y: 10, z: -40 },
        { x: 0, y: 10, z: 40 },
        { x: 0, y: 10, z: 120 }
    ]);
    const geo = buildGuardrailGeometry(bend, style());
    const pos = geo.attributes.position.array;

    // Every rail beam is a box aligned with its segment, so on a bend its
    // corners must span a real amount of X. An axis-aligned rail (the old
    // bug) had a constant 0.12 m X span and read as floating slats.
    let wide = 0;
    for (let i = 0; i < pos.length; i += 18) {
        let minX = Infinity, maxX = -Infinity;
        for (let k = 0; k < 6; k++) {
            const x = pos[i + k * 3];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
        }
        if (maxX - minX > 1) wide++;
    }
    assert.ok(wide > 40, `expected oriented rail beams, got ${wide} wide quads`);
});

test('streetlights alternate sides and stay clear of the lanes', () => {
    const lights = buildStreetlights(route, style(false));
    assertValidGeometry(lights.poles, 'poles');
    assertValidGeometry(lights.lamps, 'lamps');
    assert.equal(lights.pools, null, 'no light pools during the day');

    const spacing = 40;
    const expected = Math.floor((route.zMax - route.zMin - 10) / spacing) + 1;
    // Each light is a pole + arm (5 quads each) and one lamp box (5 quads).
    assert.equal(lights.poles.attributes.position.array.length / 18, expected * 10);
    assert.equal(lights.lamps.attributes.position.array.length / 18, expected * 5);
});

test('night mode adds additive ground pools with a dark rim', () => {
    const day = buildStreetlights(route, style(false));
    const night = buildStreetlights(route, style(true));
    assert.ok(night.pools, 'night pools exist');
    assertValidGeometry(night.pools, 'pools');

    const col = night.pools.attributes.color.array;
    let dark = 0;
    for (let i = 0; i < col.length; i += 3) {
        if (col[i] === 0 && col[i + 1] === 0 && col[i + 2] === 0) dark++;
    }
    assert.ok(dark > 0, 'pool rims fade to black');

    assert.ok(
        night.pools.attributes.position.array.length >
        day.poles.attributes.position.array.length / 4
    );
});

test('streetlight count scales with spacing', () => {
    const dense = style(true);
    dense.road.streetlightSpacing = 20;
    const sparse = style(true);
    sparse.road.streetlightSpacing = 80;

    const denseCount = buildStreetlights(route, dense).lamps.attributes.position.array.length;
    const sparseCount = buildStreetlights(route, sparse).lamps.attributes.position.array.length;
    assert.ok(denseCount > sparseCount * 2);
});
