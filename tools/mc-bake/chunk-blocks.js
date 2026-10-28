/**
 * Chunk → per-column top-block sampling for Minecraft 1.8 … 1.20 Java worlds.
 *
 * Returns, for every (x,z) column of a chunk, the highest non-air block and
 * its block id. Handles legacy numeric ids, 1.13+ palettes and 1.18+ chunk
 * section layouts.
 */

const AIR = new Set(['air', 'cave_air', 'void_air', 'structure_void']);

/** Legacy numeric block ids → modern names (only what map builds actually use). */
const LEGACY = {
    0: 'air', 1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone', 5: 'oak_planks',
    6: 'oak_sapling', 7: 'bedrock', 8: 'water', 9: 'water', 10: 'lava', 11: 'lava',
    12: 'sand', 13: 'gravel', 14: 'gold_ore', 15: 'iron_ore', 16: 'coal_ore', 17: 'oak_log',
    18: 'oak_leaves', 19: 'sponge', 20: 'glass', 21: 'lapis_ore', 22: 'lapis_block',
    23: 'dispenser', 24: 'sandstone', 25: 'note_block', 26: 'red_bed', 27: 'powered_rail',
    28: 'detector_rail', 29: 'sticky_piston', 30: 'cobweb', 31: 'grass', 32: 'dead_bush',
    33: 'piston', 35: 'white_wool', 37: 'dandelion', 38: 'poppy', 39: 'brown_mushroom',
    40: 'red_mushroom', 41: 'gold_block', 42: 'iron_block', 43: 'smooth_stone_slab',
    44: 'stone_slab', 45: 'bricks', 46: 'tnt', 47: 'bookshelf', 48: 'mossy_cobblestone',
    49: 'obsidian', 50: 'torch', 51: 'fire', 52: 'spawner', 53: 'oak_stairs', 54: 'chest',
    55: 'redstone_wire', 56: 'diamond_ore', 57: 'diamond_block', 58: 'crafting_table',
    59: 'wheat', 60: 'farmland', 61: 'furnace', 62: 'furnace', 63: 'oak_sign',
    64: 'oak_door', 65: 'ladder', 66: 'rail', 67: 'cobblestone_stairs', 68: 'oak_wall_sign',
    69: 'lever', 70: 'stone_pressure_plate', 71: 'iron_door', 72: 'oak_pressure_plate',
    73: 'redstone_ore', 74: 'redstone_ore', 75: 'redstone_torch', 76: 'redstone_torch',
    77: 'stone_button', 78: 'snow', 79: 'ice', 80: 'snow_block', 81: 'cactus',
    82: 'clay', 83: 'sugar_cane', 84: 'jukebox', 85: 'oak_fence', 86: 'carved_pumpkin',
    87: 'netherrack', 88: 'soul_sand', 89: 'glowstone', 90: 'nether_portal',
    91: 'jack_o_lantern', 92: 'cake', 95: 'white_stained_glass', 96: 'oak_trapdoor',
    97: 'infested_stone', 98: 'stone_bricks', 99: 'brown_mushroom_block',
    100: 'red_mushroom_block', 101: 'iron_bars', 102: 'glass_pane', 103: 'melon',
    104: 'pumpkin_stem', 105: 'melon_stem', 106: 'vine', 107: 'oak_fence_gate',
    108: 'brick_stairs', 109: 'stone_brick_stairs', 110: 'mycelium', 111: 'lily_pad',
    112: 'nether_bricks', 113: 'nether_brick_fence', 114: 'nether_brick_stairs',
    115: 'nether_wart', 116: 'enchanting_table', 117: 'brewing_stand', 118: 'cauldron',
    120: 'end_portal_frame', 121: 'end_stone', 123: 'redstone_lamp', 124: 'redstone_lamp',
    125: 'oak_slab', 126: 'oak_slab', 128: 'sandstone_stairs', 129: 'emerald_ore',
    130: 'ender_chest', 131: 'tripwire_hook', 133: 'emerald_block', 134: 'spruce_stairs',
    135: 'birch_stairs', 136: 'jungle_stairs', 137: 'command_block', 138: 'beacon',
    139: 'cobblestone_wall', 141: 'carrots', 142: 'potatoes', 145: 'anvil',
    146: 'trapped_chest', 152: 'redstone_block', 153: 'nether_quartz_ore',
    154: 'hopper', 155: 'quartz_block', 156: 'quartz_stairs', 157: 'activator_rail',
    158: 'dropper', 159: 'white_terracotta', 160: 'white_stained_glass_pane',
    161: 'acacia_leaves', 162: 'acacia_log', 163: 'acacia_stairs', 164: 'dark_oak_stairs',
    168: 'prismarine', 169: 'sea_lantern', 170: 'hay_block', 171: 'white_carpet',
    172: 'terracotta', 173: 'coal_block', 174: 'packed_ice', 175: 'sunflower',
    179: 'red_sandstone', 180: 'red_sandstone_stairs', 181: 'red_sandstone_slab',
    182: 'red_sandstone_slab', 183: 'spruce_fence_gate', 184: 'birch_fence_gate',
    185: 'jungle_fence_gate', 186: 'dark_oak_fence_gate', 187: 'acacia_fence_gate',
    188: 'spruce_fence', 189: 'birch_fence', 190: 'jungle_fence', 191: 'dark_oak_fence',
    192: 'acacia_fence', 193: 'spruce_door', 194: 'birch_door', 195: 'jungle_door',
    196: 'acacia_door', 197: 'dark_oak_door', 198: 'end_rod', 199: 'chorus_plant',
    200: 'chorus_flower', 201: 'purpur_block', 202: 'purpur_pillar', 203: 'purpur_stairs',
    205: 'purpur_slab', 206: 'end_stone_bricks', 207: 'beetroots', 208: 'dirt_path',
    209: 'end_portal', 210: 'repeating_command_block', 211: 'chain_command_block',
    213: 'magma_block', 214: 'nether_wart_block', 215: 'red_nether_bricks',
    216: 'bone_block', 217: 'structure_void', 218: 'observer', 219: 'white_shulker_box',
    220: 'orange_shulker_box', 221: 'magenta_shulker_box', 222: 'light_blue_shulker_box',
    223: 'yellow_shulker_box', 224: 'lime_shulker_box', 225: 'pink_shulker_box',
    226: 'gray_shulker_box', 227: 'light_gray_shulker_box', 228: 'cyan_shulker_box',
    229: 'purple_shulker_box', 230: 'blue_shulker_box', 231: 'brown_shulker_box',
    232: 'green_shulker_box', 233: 'red_shulker_box', 234: 'black_shulker_box',
    235: 'white_glazed_terracotta', 236: 'orange_glazed_terracotta',
    237: 'magenta_glazed_terracotta', 238: 'light_blue_glazed_terracotta',
    239: 'yellow_glazed_terracotta', 240: 'lime_glazed_terracotta',
    241: 'pink_glazed_terracotta', 242: 'gray_glazed_terracotta',
    243: 'light_gray_glazed_terracotta', 244: 'cyan_glazed_terracotta',
    245: 'purple_glazed_terracotta', 246: 'blue_glazed_terracotta',
    247: 'brown_glazed_terracotta', 248: 'green_glazed_terracotta',
    249: 'red_glazed_terracotta', 250: 'black_glazed_terracotta',
    251: 'white_concrete', 252: 'white_concrete_powder', 255: 'structure_block'
};

// 1.13+ flattening changed a few ids, these are the only ones we care about.
const LEGACY_16 = { 31: 'grass', 175: 'tall_grass' };

const SUFFIX_COLORS = {
    white: '#d8dcdd', orange: '#c46a2b', magenta: '#a54a94', light_blue: '#6fa9c9',
    yellow: '#d8c23a', lime: '#79b02a', pink: '#d98aa0', gray: '#4a4d50',
    light_gray: '#9a9d9f', cyan: '#3c7f8c', purple: '#6f4b96', blue: '#3c4a92',
    brown: '#6b4a2f', green: '#3f6b34', red: '#a63b34', black: '#232528'
};

export function normalizeBlockName(name) {
    if (!name) return 'air';
    return name.includes(':') && !name.startsWith('minecraft:')
        ? name
        : name.replace(/^minecraft:/, '');
}

function bitsFor(size) {
    let bits = 4;
    while ((1 << bits) < size) bits++;
    return Math.min(16, bits);
}

/** Unpack a 4096-entry section from a BigInt64Array palette index array. */
export function decodePacked(longs, bits, count = 4096) {
    const out = new Uint16Array(count);
    if (!longs || longs.length === 0) return out;
    const perLong = Math.floor(64 / bits);
    const compactLength = Math.ceil(count / perLong);
    const paddedLength = Math.ceil((count * bits) / 64);
    const compact = longs.length <= compactLength + 1 && longs.length !== paddedLength;
    const mask = (1n << BigInt(bits)) - 1n;

    if (compact) {
        for (let i = 0; i < count; i++) {
            const li = (i / perLong) | 0;
            const shift = BigInt((i % perLong) * bits);
            const value = (longs[li] >> shift) & mask;
            out[i] = Number(value);
        }
    } else {
        for (let i = 0; i < count; i++) {
            const start = i * bits;
            const li = (start / 64) | 0;
            const offset = start % 64;
            // Mask before merging: an arithmetic shift of a negative BigInt
            // sign-extends, and those high bits would otherwise corrupt the
            // low bits of a value that spans two longs.
            const spill = offset + bits - 64;
            const lowBits = spill > 0 ? bits - spill : bits;
            let value = (longs[li] >> BigInt(offset)) & ((1n << BigInt(lowBits)) - 1n);
            if (spill > 0 && li + 1 < longs.length) {
                const spillMask = (1n << BigInt(spill)) - 1n;
                value |= (longs[li + 1] & spillMask) << BigInt(64 - offset);
            }
            out[i] = Number(value & mask);
        }
    }
    return out;
}

function sectionY(section, index, pre118) {
    if (typeof section.Y === 'number') return section.Y;
    return pre118 ? index : index - 4; // 1.18+ sections start at y = -64
}

/** Return the section array regardless of chunk format (1.8 … 1.21). */
export function chunkSections(chunk) {
    if (!chunk) return { sections: [], pre118: false };
    if (Array.isArray(chunk.sections)) return { sections: chunk.sections, pre118: false };
    const level = chunk.Level || chunk;
    if (Array.isArray(level.Sections)) return { sections: level.Sections, pre118: true };
    if (Array.isArray(level.sections)) return { sections: level.sections, pre118: true };
    return { sections: [], pre118: false };
}

function legacySectionData(section) {
    const blocks = section.Blocks;
    if (!blocks || blocks.length !== 4096) return null;
    const add = section.Add;
    const ids = new Uint16Array(4096);
    for (let i = 0; i < 4096; i++) {
        let id = blocks[i] & 0xff;
        if (add) {
            const nibble = (add[i >> 1] >> ((i & 1) * 4)) & 0xf;
            id |= nibble << 8;
        }
        ids[i] = id;
    }
    return ids;
}

function paletteNames(palette) {
    return palette.map(entry => {
        if (typeof entry === 'string') return normalizeBlockName(entry);
        return normalizeBlockName(entry && entry.Name);
    });
}

function sectionArray(section) {
    if (section.block_states) {
        const states = section.block_states;
        const names = paletteNames(states.palette || []);
        const bits = bitsFor(Math.max(2, names.length));
        const indices = decodePacked(states.data, bits, 4096);
        return { names, indices };
    }
    if (section.Palette) {
        const names = paletteNames(section.Palette);
        const bits = bitsFor(Math.max(2, names.length));
        const indices = decodePacked(section.BlockStates, bits, 4096);
        return { names, indices };
    }
    const ids = legacySectionData(section);
    if (ids) {
        return {
            names: null,
            legacyIds: ids
        };
    }
    return null;
}

/**
 * Sample all 256 columns of a chunk.
 * Returns { y: Int16Array(256), block: Array(256), water: Int16Array(256) }.
 * Column index = (z << 4) | x with world-relative chunk coords.
 */
export function chunkTopBlocks(chunk) {
    const out = {
        y: new Int16Array(256).fill(-32768),
        block: new Array(256).fill('air'),
        water: new Int16Array(256).fill(-32768)
    };
    const { sections, pre118 } = chunkSections(chunk);
    if (!sections.length) return out;

    // Walk sections from the top down; first solid block wins per column.
    const ordered = sections
        .map((section, index) => ({ section, y: sectionY(section, index, pre118) }))
        .filter(s => s.section)
        .sort((a, b) => b.y - a.y);

    for (const { section, y: sy } of ordered) {
        const decoded = sectionArray(section);
        if (!decoded) continue;

        for (let i = 0; i < 4096; i++) {
            const col = i & 255; // (y<<8 | z<<4 | x) layout => low 8 bits are x|z
            const localY = i >> 8;
            const worldY = sy * 16 + localY;
            let name;
            if (decoded.legacyIds) {
                const id = decoded.legacyIds[i];
                name = LEGACY[id] || (id ? `legacy_${id}` : 'air');
                if (LEGACY_16[id]) name = LEGACY_16[id];
            } else {
                const idx = decoded.indices[i];
                name = decoded.names[idx] || 'air';
            }
            if (AIR.has(name)) continue;

            if (name.includes('water')) {
                if (worldY > out.water[col]) out.water[col] = worldY;
                continue; // never treat water as the top solid surface
            }
            if (worldY > out.y[col]) {
                out.y[col] = worldY;
                out.block[col] = name;
            }
            if (out.y[col] >= worldY) {
                // Higher blocks already recorded for this column inside this
                // section; nothing else to do for it.
            }
        }
    }
    return out;
}

/** Approximate an sRGB colour for a block id (used to tint baked meshes). */
export function blockColor(name) {
    const id = normalizeBlockName(name);
    if (id === 'air') return '#000000';
    if (id.includes('water')) return '#2f6f8f';
    if (id.includes('lava') || id === 'magma_block') return '#c2531f';
    if (id.includes('leaves') || id.includes('vine') || id === 'moss_block' || id === 'grass') return '#4a7a3c';
    if (id === 'grass_block' || id === 'podzol' || id === 'mycelium') return '#5b8546';
    if (id === 'dirt' || id === 'coarse_dirt' || id === 'rooted_dirt' || id === 'farmland') return '#6f5638';
    if (id === 'dirt_path') return '#8a7448';
    if (id === 'sand' || id === 'sandstone' || id.includes('end_stone')) return '#d9c891';
    if (id === 'red_sand') return '#b56a3a';
    if (id === 'gravel') return '#8b8a87';
    if (id === 'clay') return '#9aa4a8';
    if (id.includes('snow')) return '#eef3f6';
    if (id === 'ice' || id === 'packed_ice' || id === 'blue_ice' || id === 'frosted_ice') return '#a9cfdf';
    if (id === 'obsidian' || id === 'crying_obsidian') return '#241f33';
    if (id === 'bedrock') return '#3d3d3d';
    if (id === 'netherrack') return '#6a3a3a';
    if (id === 'glowstone' || id === 'sea_lantern' || id === 'shroomlight') return '#ffd98a';
    if (id === 'torch' || id === 'lantern' || id === 'soul_lantern') return '#ffcf7a';
    if (id.includes('glass')) return '#a8c9d8';
    if (id.includes('quartz') || id === 'calcite' || id === 'white_wool' || id === 'white_concrete') return '#d9d9d4';
    if (id.includes('terracotta') || id === 'terracotta') {
        const suffix = id.split('_')[0];
        return SUFFIX_COLORS[suffix] || '#9a5b43';
    }
    if (id.includes('concrete') || id.includes('wool') || id.includes('carpet')) {
        const suffix = id.split('_')[0];
        return SUFFIX_COLORS[suffix] || '#b9b9b9';
    }
    if (id.includes('planks') || id.includes('log') || id.includes('wood')) {
        if (id.startsWith('spruce')) return '#6b4f34';
        if (id.startsWith('dark_oak')) return '#4a3524';
        if (id.startsWith('birch')) return '#d3c79b';
        if (id.startsWith('jungle')) return '#a5764d';
        if (id.startsWith('acacia')) return '#ad6b3d';
        return '#b08a55';
    }
    if (id.includes('brick')) return '#9c5a4a';
    if (id.includes('iron') || id.includes('anvil') || id.includes('rail')) return '#9b9b9b';
    if (id.includes('gold')) return '#d8b455';
    if (id.includes('deepslate')) return '#4b4b50';
    if (id.includes('blackstone')) return '#3a3236';
    if (id.includes('tuff')) return '#6c6b64';
    if (id.includes('dripstone')) return '#8a7a6a';
    if (id.includes('copper')) return '#7f9c85';
    if (id.includes('prismarine')) return '#5f9d94';
    if (id.includes('purpur')) return '#a678a8';
    if (id.includes('asphalt') || id === 'black_concrete' || id === 'black_concrete_powder') return '#26282c';
    if (id.includes('road') || id === 'gray_concrete' || id === 'smooth_stone' || id === 'andesite') return '#575a5e';
    if (id.includes('stone') || id.includes('cobble') || id === 'tuff' || id === 'basalt') return '#7c7b78';
    return '#8a8a86';
}
