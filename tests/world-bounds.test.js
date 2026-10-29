import './helpers/register-three.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

// The three stub must be registered before these modules resolve.
const { WorldAssemblerV3 } = await import('../src/world/WorldAssemblerV3.js');
const { RoutePath } = await import('../src/world/RoutePath.js');

/**
 * Regression: getRoadBounds() used to copy the centreline in the wrong
 * direction, so `centerX` became undefined. Spawn, physics, guardrails and the
 * chase camera then all went NaN and the canvas rendered black.
 */
test('getRoadBounds keeps a finite centreline and spawn point', () => {
    const assembler = new WorldAssemblerV3({});
    assembler.route = new RoutePath([
        { x: -10, y: 5, z: -100 },
        { x: 10, y: 5, z: 100 }
    ]);
    assembler.style = {
        ...assembler.style,
        road: { ...assembler.style.road, width: 20 }
    };

    const bounds = assembler.getRoadBounds(0);
    assert.equal(bounds.centerX, 0);
    assert.ok(Number.isFinite(bounds.centerX));
    assert.ok(Number.isFinite(bounds.minX));
    assert.ok(Number.isFinite(bounds.maxX));
    assert.equal(bounds.x, bounds.centerX, 'legacy x alias stays in sync');

    const spawn = assembler.getSpawnPoint();
    for (const key of ['x', 'y', 'z', 'angle']) {
        assert.ok(Number.isFinite(spawn[key]), `spawn.${key} is finite (got ${spawn[key]})`);
    }
});

test('getRoadBounds and getTrackHeight stay finite across the whole route', () => {
    const assembler = new WorldAssemblerV3({});
    assembler.route = new RoutePath([
        { x: -40, y: 10, z: -200 },
        { x: 0, y: 12, z: 0 },
        { x: 40, y: 10, z: 200 }
    ]);
    assembler.style = {
        ...assembler.style,
        road: { ...assembler.style.road, width: 16, shoulder: 1.2, sidewalk: 2 }
    };

    for (let z = -220; z <= 220; z += 20) {
        const bounds = assembler.getRoadBounds(z);
        assert.ok(Number.isFinite(bounds.centerX), `centerX finite at z=${z}`);
        const h = assembler.getTrackHeight(bounds.centerX, z);
        assert.ok(Number.isFinite(h), `height finite at z=${z}`);
    }
});
