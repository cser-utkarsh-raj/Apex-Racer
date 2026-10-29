import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planVehicleMerge } from '../src/vehicles/VehicleMergePlan.js';
import { TemplateCache } from '../src/traffic/TemplateCache.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/* ---------------- merge planning ---------------- */

function mesh(name, material, geometry = { id: name }) {
    return { name, isMesh: true, geometry, material, parent: null };
}

function group(name, children = []) {
    const node = {
        name,
        isMesh: false,
        children,
        parent: null,
        traverse(fn) {
            fn(this);
            for (const child of this.children) {
                if (child.traverse) child.traverse(fn);
                else fn(child);
            }
        }
    };
    for (const child of children) child.parent = node;
    return node;
}

test('body cubes are batched per material and wheels are left intact', () => {
    const paint = { uuid: 'paint' };
    const glass = { uuid: 'glass' };

    const bodyA = mesh('bodyA', paint);
    const bodyB = mesh('bodyB', paint);
    const windows = mesh('windows', glass);
    const wheelFl = group('pneu1', [mesh('tyre', paint), mesh('rim', glass)]);
    const wheelFr = group('pneu2', [mesh('tyre', paint)]);

    const car = group('vehicle', [group('bone', [bodyA, bodyB, windows]), wheelFl, wheelFr]);

    const plan = planVehicleMerge(car, { keepGroups: [wheelFl, wheelFr] });

    assert.equal(plan.kept, 3, 'every mesh inside a kept wheel is preserved');
    assert.equal(plan.removable.length, 3, 'only body meshes are removed');
    assert.deepEqual(
        plan.byMaterial.get('paint').meshes.map((m) => m.name).sort(),
        ['bodyA', 'bodyB']
    );
    assert.deepEqual(
        plan.byMaterial.get('glass').meshes.map((m) => m.name),
        ['windows']
    );
});

test('an empty or invalid model produces an empty plan', () => {
    for (const value of [null, undefined, {}, { traverse: 'nope' }]) {
        const plan = planVehicleMerge(value, {});
        assert.equal(plan.removable.length, 0);
        assert.equal(plan.kept, 0);
    }
});

test('meshes without geometry or material are skipped', () => {
    const broken = { name: 'broken', isMesh: true, geometry: null, material: null, parent: null };
    const car = group('vehicle', [broken, mesh('ok', { uuid: 'm' })]);
    const plan = planVehicleMerge(car, {});
    assert.equal(plan.removable.length, 1);
    assert.equal(plan.removable[0].name, 'ok');
});

/* ---------------- traffic template cache ---------------- */

test('a model template is built once and shared by every spawn', async () => {
    const cache = new TemplateCache();
    let builds = 0;
    const factory = async (id) => {
        builds++;
        return { id };
    };

    const [first, second] = await Promise.all([
        cache.load('taxi', factory),
        cache.load('taxi', factory)
    ]);
    const third = await cache.load('taxi', factory);

    assert.equal(builds, 1, 'concurrent + later loads reuse the template');
    assert.equal(first, second);
    assert.equal(first, third);
    assert.equal(cache.size, 1);
    assert.equal(cache.get('taxi'), first);
});

test('different models get their own templates', async () => {
    const cache = new TemplateCache();
    const taxi = await cache.load('taxi', (id) => ({ id }));
    const van = await cache.load('van', (id) => ({ id }));
    assert.notEqual(taxi, van);
    assert.equal(taxi.id, 'taxi');
    assert.equal(van.id, 'van');
    assert.equal(cache.size, 2);
});

test('a failed build is not cached, so the next spawn retries', async () => {
    const cache = new TemplateCache();
    let attempts = 0;
    const factory = async () => {
        attempts++;
        if (attempts === 1) throw new Error('network down');
        return { ok: true };
    };

    await assert.rejects(cache.load('police_car', factory), /network down/);
    assert.equal(cache.has('police_car'), false);

    const template = await cache.load('police_car', factory);
    assert.deepEqual(template, { ok: true });
    assert.equal(attempts, 2);
});

test('clear() drops templates and pending work', async () => {
    const cache = new TemplateCache();
    await cache.load('taxi', () => ({ id: 'taxi' }));
    cache.clear();
    assert.equal(cache.size, 0);
    assert.equal(cache.get('taxi'), null);
});

/* ---------------- wiring ---------------- */

test('the game bakes the player body and each wheel, and traffic uses the cache', () => {
    const main = read('src/main.js');
    assert.match(main, /from '\.\/vehicles\/VehicleMerger\.js'/);
    assert.match(main, /keepGroups: wheelGroups/);
    assert.match(main, /mergeVehicleParts\(wheel/);

    const traffic = read('src/traffic/TrafficSystem.js');
    assert.match(traffic, /TemplateCache/);
    assert.match(traffic, /mergeVehicleParts\(raw/);
    assert.match(traffic, /template\.clone\(true\)/);
    assert.match(traffic, /async prewarm\(/, 'traffic models are baked during loading');

    assert.match(main, /await this\.trafficSystem\.prewarm\(\)/, 'prewarm is awaited before play');
});
