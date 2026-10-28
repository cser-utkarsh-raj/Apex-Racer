import os
import sys
import json
try:
    import anvil
except ImportError:
    print("Please install anvil-parser: pip install anvil-parser")
    sys.exit(1)

# Basic Block to Hex Color Map for realistic rendering
BLOCK_COLORS = {
    'minecraft:grass_block': '#27ae60',
    'minecraft:dirt': '#8b5a2b',
    'minecraft:stone': '#7f8c8d',
    'minecraft:cobblestone': '#95a5a6',
    'minecraft:stone_bricks': '#636e72',
    'minecraft:quartz_block': '#f5f6fa',
    'minecraft:quartz_bricks': '#dcdde1',
    'minecraft:gray_concrete': '#2d3436',
    'minecraft:light_gray_concrete': '#636e72',
    'minecraft:black_concrete': '#1e272e',
    'minecraft:white_concrete': '#f5f6fa',
    'minecraft:cyan_concrete': '#00cec9',
    'minecraft:water': '#0984e3',
    'minecraft:glass': '#81ecec',
    'minecraft:white_stained_glass': '#dfe6e9',
    'minecraft:black_stained_glass': '#2d3436',
    'minecraft:bricks': '#c23616',
    'minecraft:sand': '#f1c40f',
    'minecraft:sandstone': '#f39c12',
    'minecraft:oak_planks': '#e1b12c',
    'minecraft:spruce_planks': '#c23616',
    'minecraft:smooth_stone': '#7f8c8d',
    'minecraft:leaves': '#2ecc71',
    'minecraft:oak_leaves': '#2ecc71',
    'minecraft:glowstone': '#fbc531',
    'minecraft:sea_lantern': '#00a8ff'
}

DEFAULT_COLOR = '#bdc3c7'

EXCLUDE = [
    'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air',
    'minecraft:tall_grass', 'minecraft:grass', 'minecraft:dandelion',
    'minecraft:poppy', 'minecraft:fern', 'minecraft:large_fern',
    'minecraft:dead_bush'
]

MAP_CONFIGS = {
    'neo_tazader': {
        'path': r'C:\Users\u_raj\OneDrive\Desktop\Apex\Downloaded Assests\Maps\Tazader_City_2015\Tazader City 2015 (PC)\region',
        'bounds': {'min_cx': 0, 'max_cx': 10, 'min_cz': 0, 'max_cz': 10}
    },
    'chiang_tung': {
        'path': r'C:\Users\u_raj\OneDrive\Desktop\Apex\Downloaded Assests\Maps\Kingdom_of_Chiang_Tung\Kingdom of Chiang Tung\region',
        'bounds': {'min_cx': -5, 'max_cx': 5, 'min_cz': -5, 'max_cz': 5}
    },
    'curitiba': {
        'path': r'C:\Users\u_raj\OneDrive\Desktop\Apex\Downloaded Assests\Maps\Curitiba_3-12\Curitiba 3-12\region',
        'bounds': {'min_cx': 0, 'max_cx': 10, 'min_cz': 0, 'max_cz': 10}
    },
    'nantwich': {
        'path': r'C:\Users\u_raj\OneDrive\Desktop\Apex\Downloaded Assests\Maps\Map-1\Nantwich, Cheshire Java\region',
        'bounds': {'min_cx': 40, 'max_cx': 50, 'min_cz': 40, 'max_cz': 50}
    }
}

def extract_map(map_id, config):
    print(f"Extracting {map_id}...")
    out_dir = os.path.join(r'C:\Users\u_raj\OneDrive\Desktop\Apex\assets\maps', map_id)
    os.makedirs(out_dir, exist_ok=True)
    
    path = config['path']
    bounds = config['bounds']
    
    regions_cache = {}
    
    for cz in range(bounds['min_cz'], bounds['max_cz'] + 1):
        for cx in range(bounds['min_cx'], bounds['max_cx'] + 1):
            rx, rz = cx // 32, cz // 32
            rkey = (rx, rz)
            
            if rkey not in regions_cache:
                rfile = os.path.join(path, f"r.{rx}.{rz}.mca")
                if os.path.exists(rfile):
                    try:
                        regions_cache[rkey] = anvil.Region.from_file(rfile)
                    except Exception as e:
                        print(f"Error loading {rfile}: {e}")
                        regions_cache[rkey] = None
                else:
                    regions_cache[rkey] = None
                    
            region = regions_cache[rkey]
            if not region:
                continue
                
            try:
                chunk = region.get_chunk(cx, cz)
            except Exception:
                continue
                
            voxels = []
            
            # Simple surface scan to save time (only top visible blocks)
            for lx in range(16):
                for lz in range(16):
                    # We start scanning from high up down to bedrock
                    for y in range(200, -64, -1):
                        try:
                            block = chunk.get_block(lx, y, lz)
                            if block:
                                bid = getattr(block, 'id', getattr(block, 'name', str(block)))
                                bid = str(bid)
                                if bid not in EXCLUDE:
                                    c = BLOCK_COLORS.get(bid)
                                    if not c:
                                        if 'glass' in bid: c = BLOCK_COLORS['minecraft:glass']
                                        elif 'concrete' in bid: c = BLOCK_COLORS['minecraft:gray_concrete']
                                        elif 'wood' in bid or 'log' in bid: c = '#8b5a2b'
                                        elif 'leaves' in bid: c = '#2ecc71'
                                        else: c = DEFAULT_COLOR
                                    
                                    voxels.append({
                                        "x": lx,
                                        "y": y,
                                        "z": lz,
                                        "c": c
                                    })
                                    break # Only get surface to optimize!
                        except Exception as e:
                            if 'Out of bounds' not in str(e):
                                pass
                            pass
                            
            if voxels:
                chunk_file = os.path.join(out_dir, f"chunk_{cx}_{cz}.json")
                with open(chunk_file, 'w') as f:
                    json.dump({"cx": cx, "cz": cz, "voxels": voxels}, f)
                print(f"  Saved {chunk_file} ({len(voxels)} voxels)")

if __name__ == "__main__":
    for map_id, config in MAP_CONFIGS.items():
        extract_map(map_id, config)
    print("Done!")
