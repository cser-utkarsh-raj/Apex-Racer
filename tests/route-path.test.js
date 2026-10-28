import test from 'node:test';
import assert from 'node:assert/strict';
import { RoutePath } from '../src/world/RoutePath.js';

/** Straight test route heading -Z with two x offsets. */
function straightRoute() {
    return new RoutePath([
        { x: 0, y: 10, z: 100 },
        { x: 10, y: 12, z: 0 },
        { x: 10, y: 14, z: -100 }
    ]);
}

test('sorts points by Z and reports bounds/length', () => {
    const route = new RoutePath([
        { x: 5, y: 0, z: 50 },
        { x: 0, y: 0, z: -50 },
        { x: 2, y: 0, z: 0 }
    ]);

    assert.deepEqual(route.points.map(p => p.z), [-50, 0, 50]);
    assert.equal(route.zMin, -50);
    assert.equal(route.zMax, 50);
    assert.equal(route.empty, false);
    // (0,-50)->(2,0)->(5,50): two diagonal legs.
    const expected = Math.hypot(2, 50) + Math.hypot(3, 50);
    assert.ok(Math.abs(route.length - expected) < 1e-9);
});

test('detects an empty route', () => {
    const empty = new RoutePath([]);
    assert.equal(empty.empty, true);
    assert.equal(empty.length, 0);
    assert.deepEqual(empty.atZ(12), { x: 0, y: 0, z: 12, heading: 0, dx: 0, slope: 0 });
});

test('interpolates x/y and clamps outside the route', () => {
    const route = straightRoute();
    const mid = route.atZ(50);
    assert.equal(mid.x, 5);
    assert.equal(mid.y, 11);

    const before = route.atZ(500);
    assert.equal(before.x, 0);
    assert.equal(before.y, 10);

    const after = route.atZ(-500);
    assert.equal(after.x, 10);
    assert.equal(after.y, 14);
});

test('heading points along -Z for a canonical forward vector', () => {
    const route = straightRoute();
    for (const z of [-80, -20, 20, 80]) {
        const s = route.atZ(z);
        const fx = -Math.sin(s.heading);
        const fz = -Math.cos(s.heading);
        const len = Math.hypot(s.dx, 1);
        assert.ok(Math.abs(fx - (-s.dx / len)) < 1e-9, `forward x at z=${z}`);
        assert.ok(Math.abs(fz - (-1 / len)) < 1e-9, `forward z at z=${z}`);
    }
});

test('heading is negative when the route moves to +X as Z decreases', () => {
    // Car at heading 0 faces -Z; +X is a right turn, so the heading is negative.
    const route = straightRoute();
    const s = route.atZ(50);
    assert.ok(s.heading < 0);
    assert.ok(route.headingAt(50) < 0);
    // Forward X is +X in world space.
    assert.ok(-Math.sin(s.heading) > 0);
});

test('bounds expose a unit normal to the +X side and symmetric edges', () => {
    const route = straightRoute();
    const b = route.bounds(50, 26);
    assert.equal(b.centerX, 5);
    assert.equal(b.width, 26);
    assert.equal(b.halfWidth, 13);
    assert.equal(b.leftX ?? b.minX, -8);
    assert.equal(b.rightX ?? b.maxX, 18);
    assert.ok(Math.abs(Math.hypot(b.nx, b.nz) - 1) < 1e-9);
    // Normal points to +X when the road runs straight down -Z.
    assert.ok(b.nx > 0);
});

test('segments tile the requested Z window without gaps', () => {
    const route = straightRoute();
    const segs = route.segments(20, -100, 100, 50);
    assert.equal(segs.length, 4);
    assert.equal(segs[0].startZ, -100);
    assert.equal(segs[0].endZ, -50);
    assert.equal(segs[3].endZ, 100);
    for (let i = 1; i < segs.length; i++) {
        assert.equal(segs[i].startZ, segs[i - 1].endZ);
    }
    for (const s of segs) {
        assert.equal(s.width, 20);
        assert.ok(Number.isFinite(s.startX));
        assert.ok(Number.isFinite(s.endX));
    }
});

test('xAt/yAt/headingAt are convenience wrappers', () => {
    const route = straightRoute();
    assert.equal(route.xAt(0), 10);
    assert.equal(route.yAt(0), 12);
    assert.equal(route.headingAt(0), route.atZ(0).heading);
});
