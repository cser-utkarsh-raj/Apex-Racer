import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_STYLES, WORLD_ALIASES, resolveWorldStyle } from '../src/world/WorldStyles.js';

const IDS = ['neo_tazader', 'chiang_tung', 'curitiba', 'nantwich'];

test('all four biomes exist and resolve to themselves', () => {
    for (const id of IDS) {
        assert.ok(WORLD_STYLES[id], `missing ${id}`);
        assert.equal(resolveWorldStyle(id), WORLD_STYLES[id]);
        assert.equal(WORLD_STYLES[id].id, id);
    }
});

test('aliases used by index.html and the menu resolve correctly', () => {
    assert.equal(resolveWorldStyle('neo').id, 'neo_tazader');
    assert.equal(resolveWorldStyle('tazader').id, 'neo_tazader');
    assert.equal(resolveWorldStyle('Chiang-Tung').id, 'chiang_tung');
    assert.equal(resolveWorldStyle('CHIANG TUNG').id, 'chiang_tung');
    assert.equal(resolveWorldStyle('iceland').id, 'nantwich');
    assert.equal(resolveWorldStyle('nantwich/iceland').id, 'nantwich');
    for (const [alias, target] of Object.entries(WORLD_ALIASES)) {
        assert.ok(WORLD_STYLES[target], `${alias} points at a real world`);
    }
});

test('unknown worlds fall back to neo instead of crashing', () => {
    assert.equal(resolveWorldStyle('atlantis').id, 'neo_tazader');
    assert.equal(resolveWorldStyle(undefined).id, 'neo_tazader');
    assert.equal(resolveWorldStyle(null).id, 'neo_tazader');
});

test('every style defines the fields the assembler consumes', () => {
    for (const id of IDS) {
        const s = WORLD_STYLES[id];
        assert.equal(typeof s.label, 'string');
        assert.equal(typeof s.raceName, 'string');
        assert.equal(typeof s.night, 'boolean');
        assert.equal(typeof s.exposure, 'number');
        assert.ok(s.sky && s.sky.top && s.sky.horizon && s.sky.ground);
        assert.equal(typeof s.sky.stars, 'number');
        assert.ok(s.fog && Number.isFinite(s.fog.color) && s.fog.density > 0);
        assert.ok(Number.isFinite(s.sun.intensity) && Array.isArray(s.sun.position));
        assert.ok(Number.isFinite(s.hemi.intensity));
        assert.ok(Number.isFinite(s.bloom.threshold));
        assert.ok(Number.isFinite(s.bloom.strength));
        assert.ok(s.water && Number.isFinite(s.water.opacity));
    }
});

test('road geometry settings are sane and merge-friendly', () => {
    for (const id of IDS) {
        const r = WORLD_STYLES[id].road;
        assert.ok(r.width >= 10 && r.width <= 40, `${id} width`);
        assert.ok(r.shoulder >= 0 && r.shoulder <= 4, `${id} shoulder`);
        assert.ok(r.sidewalk >= 0 && r.sidewalk <= 6, `${id} sidewalk`);
        assert.ok(r.streetlightSpacing >= 20, `${id} spacing`);
        assert.equal(r.roadColor.length, 3);
        assert.equal(r.sidewalkColor.length, 3);
        for (const c of [...r.roadColor, ...r.sidewalkColor]) {
            assert.ok(c >= 0 && c <= 1);
        }
        assert.ok(Number.isFinite(r.railColor));
        assert.ok(Number.isFinite(r.lineColor));
        assert.ok(Number.isFinite(r.edgeColor));
    }
});

test('only the night city enables emissive windows', () => {
    assert.equal(WORLD_STYLES.neo_tazader.windows.enabled, true);
    assert.ok(WORLD_STYLES.neo_tazader.windows.colors.length >= 2);
    for (const id of ['chiang_tung', 'curitiba', 'nantwich']) {
        assert.equal(WORLD_STYLES[id].windows.enabled, false);
    }
});

test('worlds are visually distinct (sky, fog and road presets differ)', () => {
    const signatures = IDS.map(id => {
        const s = WORLD_STYLES[id];
        return [s.sky.top, s.fog.color, s.road.width, s.sun.intensity, s.night].join('|');
    });
    assert.equal(new Set(signatures).size, IDS.length);
});
