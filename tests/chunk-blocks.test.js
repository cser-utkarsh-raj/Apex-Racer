import test from 'node:test';
import assert from 'node:assert/strict';
import {
    blockColor,
    chunkSections,
    chunkTopBlocks,
    decodePacked,
    normalizeBlockName
} from '../tools/mc-bake/chunk-blocks.js';

/* ------------------------------------------------------------------ */
/* packing helpers                                                     */
/* ------------------------------------------------------------------ */

function packCompact(indices, bits) {
    const perLong = Math.floor(64 / bits);
    const longs = new BigInt64Array(Math.ceil(indices.length / perLong));
    for (let i = 0; i < indices.length; i++) {
        const li = Math.floor(i / perLong);
        const shift = BigInt((i % perLong) * bits);
        longs[li] |= BigInt(indices[i]) << shift;
    }
    return longs;
}

function packPadded(indices, bits) {
    const longs = new BigInt64Array(Math.ceil((indices.length * bits) / 64));
    for (let i = 0; i < indices.length; i++) {
        const start = i * bits;
        const li = Math.floor(start / 64);
        const offset = start % 64;
        longs[li] |= BigInt(indices[i]) << BigInt(offset);
        const spill = offset + bits - 64;
        if (spill > 0) longs[li + 1] |= BigInt(indices[i]) >> BigInt(64 - offset);
    }
    return longs;
}

function legacySection(entries) {
    const blocks = new Uint8Array(4096);
    for (const [index, id] of entries) blocks[index] = id;
    return { Blocks: blocks };
}

function paletteSection(entries, palette, Y) {
    const indices = new Array(4096).fill(0);
    for (const [index, paletteIndex] of entries) indices[index] = paletteIndex;
    return {
        Y,
        Palette: palette.map(Name => ({ Name })),
        BlockStates: packPadded(indices, 4)
    };
}

/* ------------------------------------------------------------------ */
/* decodePacked                                                        */
/* ------------------------------------------------------------------ */

test('decodePacked round-trips compact (1.16+) and padded (1.13) layouts', () => {
    const values = Array.from({ length: 4096 }, (_, i) => i % 7);

    for (const bits of [4, 5, 6]) {
        const compact = decodePacked(packCompact(values, bits), bits);
        assert.deepEqual([...compact], values, `compact bits=${bits}`);
    }

    for (const bits of [4, 5]) {
        const padded = decodePacked(packPadded(values, bits), bits);
        assert.deepEqual([...padded], values, `padded bits=${bits}`);
    }
});

test('decodePacked returns zeroes for missing data', () => {
    assert.deepEqual([...decodePacked(null, 4, 4)], [0, 0, 0, 0]);
});

/* ------------------------------------------------------------------ */
/* chunkSections                                                       */
/* ------------------------------------------------------------------ */

test('chunkSections understands 1.18, 1.13+ and legacy layouts', () => {
    const modern = { sections: [{ Y: 0 }] };
    assert.deepEqual(chunkSections(modern), { sections: modern.sections, pre118: false });

    const flattened = { Level: { Sections: [{ Y: 0 }] } };
    assert.deepEqual(chunkSections(flattened), { sections: flattened.Level.Sections, pre118: true });

    const legacy = { Level: { sections: [{ Blocks: new Uint8Array(4096) }] } };
    assert.deepEqual(chunkSections(legacy), { sections: legacy.Level.sections, pre118: true });

    assert.deepEqual(chunkSections(null), { sections: [], pre118: false });
});

/* ------------------------------------------------------------------ */
/* chunkTopBlocks                                                      */
/* ------------------------------------------------------------------ */

test('legacy numeric blocks produce the highest solid block per column', () => {
    // Section 0: stone at (x=1,z=2,y=4) and water at y=3 of the same column.
    const index = (4 << 8) | (2 << 4) | 1;
    const waterIndex = (3 << 8) | (2 << 4) | 1;
    // Section 1: a cobblestone roof at y=2 -> world y = 18.
    const roofIndex = (2 << 8) | (2 << 4) | 1;

    const chunk = {
        Level: {
            Status: 'full',
            Sections: [
                legacySection([[index, 1], [waterIndex, 8]]),
                legacySection([[roofIndex, 4]])
            ]
        }
    };

    const top = chunkTopBlocks(chunk);
    const col = (2 << 4) | 1;
    assert.equal(top.y[col], 18);
    assert.equal(top.block[col], 'cobblestone');
    assert.equal(top.water[col], 3);
    assert.equal(top.block[col].includes('water'), false);

    // An untouched column stays empty.
    assert.equal(top.y[0], -32768);
    assert.equal(top.block[0], 'air');
});

test('1.13 palette chunks decode Names and BlockStates', () => {
    const colIndex = (5 << 8) | (1 << 4) | 3;
    const chunk = {
        Level: {
            Sections: [
                paletteSection([[colIndex, 1]], ['minecraft:air', 'minecraft:stone_bricks'], 2)
            ]
        }
    };

    const top = chunkTopBlocks(chunk);
    const col = (1 << 4) | 3;
    assert.equal(top.y[col], 2 * 16 + 5);
    assert.equal(top.block[col], 'stone_bricks');
});

test('1.18 section Y offsets world heights correctly', () => {
    const colIndex = (7 << 8) | (4 << 4) | 2;
    const chunk = {
        sections: [{
            Y: -4,
            block_states: {
                palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:polished_deepslate' }],
                data: packCompact(Array.from({ length: 4096 }, (_, i) => i === colIndex ? 1 : 0), 4)
            }
        }]
    };

    const top = chunkTopBlocks(chunk);
    const col = (4 << 4) | 2;
    assert.equal(top.y[col], -64 + 7);
    assert.equal(top.block[col], 'polished_deepslate');
});

test('a fully empty chunk yields the sentinel height', () => {
    const top = chunkTopBlocks({ sections: [] });
    assert.equal(top.y.every(v => v === -32768), true);
    assert.equal(top.water.every(v => v === -32768), true);
    assert.equal(top.block.every(b => b === 'air'), true);
});

/* ------------------------------------------------------------------ */
/* names + colours                                                     */
/* ------------------------------------------------------------------ */

test('normalizeBlockName strips the minecraft namespace only', () => {
    assert.equal(normalizeBlockName('minecraft:stone_bricks'), 'stone_bricks');
    assert.equal(normalizeBlockName('stone_bricks'), 'stone_bricks');
    assert.equal(normalizeBlockName('create:andesite_alloy'), 'create:andesite_alloy');
    assert.equal(normalizeBlockName(undefined), 'air');
});

test('blockColor maps the material families used by the four maps', () => {
    assert.equal(blockColor('air'), '#000000');
    assert.equal(blockColor('minecraft:grass_block'), '#5b8546');
    assert.equal(blockColor('oak_leaves'), '#4a7a3c');
    assert.equal(blockColor('water'), '#2f6f8f');
    assert.equal(blockColor('stone_bricks'), '#9c5a4a');
    assert.equal(blockColor('polished_deepslate'), '#4b4b50');
    assert.equal(blockColor('black_concrete'), '#232528');
    assert.equal(blockColor('spruce_planks'), '#6b4f34');
    assert.equal(blockColor('unknown_block'), '#8a8a86');
});
