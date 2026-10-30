import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const IDS = [
    'gtv_ford_gt',
    'gtv_ford_mustang_shelby_gt500',
    'gtv_ford_bronco_sport',
    'gtv_ford_f150',
    'ae86'
];

function readModel(id) {
    return JSON.parse(fs.readFileSync(
        path.join(ROOT, 'assets/processed/vehicles/models', `${id}.json`), 'utf8'));
}

test('all five reworked vehicles have a baked body and four named wheels', () => {
    for (const id of IDS) {
        const model = readModel(id);
        assert.equal(model.format, 'apex-vehicle-v1', `${id} format`);
        assert.equal(model.id, id, `${id} id`);
        assert.ok(model.body, `${id} body`);

        const bodyVerts = model.body.position.length / 3;
        assert.ok(bodyVerts > 100, `${id} body has geometry`);
        assert.equal(model.body.position.length % 3, 0, `${id} body positions`);
        assert.equal(model.body.normal.length, model.body.position.length, `${id} body normals`);
        assert.equal(model.body.uv.length, bodyVerts * 2, `${id} body uvs`);

        assert.equal(model.wheels.length, 4, `${id} wheel count`);
        assert.deepEqual(
            model.wheels.map(w => w.name).sort(),
            ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
            `${id} wheel names`
        );

        for (const wheel of model.wheels) {
            const verts = wheel.geometry.position.length / 3;
            assert.ok(verts > 20, `${id}/${wheel.name} geometry`);
            assert.equal(wheel.geometry.normal.length, wheel.geometry.position.length);
            assert.equal(wheel.geometry.uv.length, verts * 2);
            assert.ok(wheel.pivot.length === 3 && wheel.pivot.every(Number.isFinite));

            let maxIndex = verts - 1;
            if (wheel.geometry.index.length) {
                maxIndex = 0;
                for (const i of wheel.geometry.index) if (i > maxIndex) maxIndex = i;
            }
            assert.ok(maxIndex < verts, `${id}/${wheel.name} index bounds`);
        }
    }
});

test('wheel pivots follow the canonical X/Z layout (front is -Z, left is -X)', () => {
    for (const id of IDS) {
        const model = readModel(id);
        const byName = Object.fromEntries(model.wheels.map(w => [w.name, w.pivot]));

        assert.ok(byName.wheel_fl[2] < byName.wheel_rl[2], `${id} front/rear Z`);
        assert.ok(byName.wheel_fr[2] < byName.wheel_rr[2], `${id} front/rear Z right`);
        assert.ok(byName.wheel_fl[0] < 0, `${id} left X`);
        assert.ok(byName.wheel_fr[0] > 0, `${id} right X`);
        assert.ok(byName.wheel_fl[1] < 0.8, `${id} wheel height sane`);
    }
});

test('every baked vehicle has its runtime texture beside it', () => {
    for (const id of IDS) {
        const file = path.join(ROOT, 'assets/processed/vehicles/textures', `${id}.png`);
        assert.ok(fs.existsSync(file), `${id} texture exists`);
        assert.ok(fs.statSync(file).size > 100, `${id} texture is not empty`);
    }
});
