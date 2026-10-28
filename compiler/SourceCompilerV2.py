import os
import json
import anvil
import math

root = "c:/Users/u_raj/OneDrive/Desktop/Apex"
maps_dir = os.path.join(root, "Downloaded Assests", "Maps")
library_dir = os.path.join(root, "assets", "source_library")
os.makedirs(library_dir, exist_ok=True)

manifest = {
    "version": "2.0.0",
    "sources": {},
    "total_modules": 0,
    "categories": {
        "roads": 0,
        "bridges": 0,
        "buildings": 0,
        "landmarks": 0
    }
}

def decode_modern_section(section):
    bs = section.get('block_states', {})
    palette = [x['Name'].value if hasattr(x['Name'], 'value') else str(x['Name']) for x in bs.get('palette', [])]
    if not palette or len(palette) <= 1:
        return []
    data_longs = bs.get('data', None)
    if data_longs is None:
        return []
    data = data_longs.value if hasattr(data_longs, 'value') else list(data_longs)
    bits_per_block = max(4, math.ceil(math.log2(len(palette))))
    blocks_per_long = 64 // bits_per_block
    mask = (1 << bits_per_block) - 1
    blocks = []
    for long_val in data:
        u_val = long_val if long_val >= 0 else long_val + (1 << 64)
        for i in range(blocks_per_long):
            idx = (u_val >> (i * bits_per_block)) & mask
            if idx < len(palette):
                blocks.append(palette[idx])
            if len(blocks) >= 4096:
                break
        if len(blocks) >= 4096:
            break
    return blocks

def process_source_world(source_name, region_dir, priority_mcas, is_modern=False):
    print(f"\n=======================================================")
    print(f"  PROCESSING SOURCE WORLD: {source_name}")
    print(f"=======================================================")
    
    if not os.path.exists(region_dir):
        return
        
    source_out = os.path.join(library_dir, source_name)
    os.makedirs(source_out, exist_ok=True)
    for sub in ['roads', 'buildings', 'bridges', 'landmarks']:
        os.makedirs(os.path.join(source_out, sub), exist_ok=True)
        
    source_stats = {
        "roads": 0,
        "bridges": 0,
        "buildings": 0,
        "total_voxels": 0
    }
    
    for mca_name in priority_mcas:
        mca_path = os.path.join(region_dir, mca_name)
        if not os.path.exists(mca_path): continue
        
        try:
            reg = anvil.Region.from_file(mca_path)
            
            for cx in range(0, 32, 2):
                for cz in range(0, 32, 2):
                    try:
                        chunk = reg.get_chunk(cx, cz)
                        structure_voxels = []
                        road_voxels = []
                        bridge_voxels = []
                        
                        if is_modern:
                            secs = chunk.data.get('sections', []) or chunk.data.get('Sections', [])
                            for s in secs:
                                y_val = s.get('Y')
                                if y_val is None: continue
                                y = y_val.value if hasattr(y_val, 'value') else int(y_val)
                                if y < 2 or y > 16: continue
                                y_base = y * 16
                                
                                # Check palette fast
                                bs = s.get('block_states', {})
                                pal = bs.get('palette', []) or s.get('Palette', [])
                                pal_names = [x['Name'].value if hasattr(x['Name'], 'value') else str(x.get('Name', x)) for x in pal]
                                if not any(any(k in n for k in ['concrete', 'quartz', 'glass', 'brick', 'iron', 'wood', 'planks', 'terracotta', 'stone_brick', 'asphalt']) for n in pal_names):
                                    continue
                                    
                                blocks = decode_modern_section(s)
                                if not blocks:
                                    # Fallback manual scan
                                    for lx in range(0, 16, 2):
                                        for lz in range(0, 16, 2):
                                            for ly in range(0, 16, 2):
                                                try:
                                                    b = chunk.get_block(lx, y_base + ly, lz)
                                                    if b and b.id not in [0, 'air', 'water', 'dirt', 'grass_block', 'stone', 'bedrock']:
                                                        bname = str(b.id)
                                                        color = '#f5f6fa'
                                                        if 'glass' in bname: color = '#74b9ff'
                                                        elif 'wood' in bname or 'planks' in bname: color = '#8d6e63'
                                                        elif 'brick' in bname: color = '#c0392b'
                                                        elif 'concrete' in bname: color = '#2d3436'
                                                        
                                                        structure_voxels.append({"x": lx, "y": (y_base + ly) - 62, "z": lz, "color": color})
                                                except: pass
                                else:
                                    for idx, bname in enumerate(blocks):
                                        if idx % 4 != 0: continue
                                        if any(k in bname for k in ['concrete', 'quartz', 'glass', 'brick', 'iron', 'wood', 'planks', 'terracotta', 'stone_brick', 'asphalt']):
                                            ly = idx // 256
                                            lz = (idx % 256) // 16
                                            lx = idx % 16
                                            
                                            color = '#f5f6fa'
                                            if 'glass' in bname: color = '#74b9ff'
                                            elif 'gray' in bname or 'concrete' in bname: color = '#2d3436'
                                            elif 'iron' in bname: color = '#dfe6e9'
                                            elif 'terracotta' in bname or 'brick' in bname: color = '#c0392b'
                                            elif 'wood' in bname or 'planks' in bname: color = '#8d6e63'
                                            
                                            item = {"x": lx, "y": (y_base + ly) - 64, "z": lz, "color": color}
                                            if any(k in bname for k in ['asphalt', 'concrete', 'gray_wool']): road_voxels.append(item)
                                            elif 'iron' in bname or 'bars' in bname: bridge_voxels.append(item)
                                            else: structure_voxels.append(item)
                        else:
                            # Legacy 1.12 parser
                            for x in range(0, 16, 2):
                                for z in range(0, 16, 2):
                                    for y in range(62, 130, 2):
                                        b = chunk.get_block(x, y, z)
                                        if b and b.id not in [0, 'air', 'water', 'dirt', 'grass', 'stone', 'bedrock']:
                                            bname = str(b.id)
                                            color = '#f5f6fa'
                                            if 'glass' in bname: color = '#74b9ff'
                                            elif 'brick' in bname: color = '#c0392b'
                                            elif 'iron' in bname or 'quartz' in bname: color = '#dfe6e9'
                                            elif 'concrete' in bname: color = '#2d3436'
                                            
                                            item = {"x": x, "y": y - 62, "z": z, "color": color}
                                            if 'concrete' in bname: road_voxels.append(item)
                                            elif 'iron' in bname: bridge_voxels.append(item)
                                            else: structure_voxels.append(item)
                        
                        # Export Building Shells
                        if len(structure_voxels) >= 20:
                            mod_id = f"{source_name}_building_c{cx}_{cz}"
                            mod_path = os.path.join(source_out, 'buildings', f"{mod_id}.json")
                            with open(mod_path, 'w') as f:
                                json.dump({
                                    "id": mod_id,
                                    "source": source_name,
                                    "category": "building_shell",
                                    "voxels": structure_voxels,
                                    "voxel_count": len(structure_voxels)
                                }, f)
                            source_stats["buildings"] += 1
                            source_stats["total_voxels"] += len(structure_voxels)
                            
                        # Export Road Modules with Sockets
                        if len(road_voxels) >= 15:
                            mod_id = f"{source_name}_road_segment_c{cx}_{cz}"
                            mod_path = os.path.join(source_out, 'roads', f"{mod_id}.json")
                            with open(mod_path, 'w') as f:
                                json.dump({
                                    "id": mod_id,
                                    "source": source_name,
                                    "category": "road_module",
                                    "entry_socket": {"x": 0, "z": -16, "width": 24, "heading": 0},
                                    "exit_socket": {"x": 0, "z": 16, "width": 24, "heading": 0},
                                    "voxels": road_voxels,
                                    "voxel_count": len(road_voxels)
                                }, f)
                            source_stats["roads"] += 1
                            source_stats["total_voxels"] += len(road_voxels)
                            
                        # Export Bridges
                        if len(bridge_voxels) >= 12:
                            mod_id = f"{source_name}_bridge_c{cx}_{cz}"
                            mod_path = os.path.join(source_out, 'bridges', f"{mod_id}.json")
                            with open(mod_path, 'w') as f:
                                json.dump({
                                    "id": mod_id,
                                    "source": source_name,
                                    "category": "bridge_structure",
                                    "voxels": bridge_voxels,
                                    "voxel_count": len(bridge_voxels)
                                }, f)
                            source_stats["bridges"] += 1
                            source_stats["total_voxels"] += len(bridge_voxels)
                    except:
                        pass
        except:
            pass
            
    print(f"  [SUCCESS] {source_name}: {source_stats['buildings']} buildings, {source_stats['roads']} roads, {source_stats['bridges']} bridges ({source_stats['total_voxels']:,} voxels).")
    manifest["sources"][source_name] = source_stats
    manifest["categories"]["buildings"] += source_stats["buildings"]
    manifest["categories"]["roads"] += source_stats["roads"]
    manifest["categories"]["bridges"] += source_stats["bridges"]
    manifest["total_modules"] += (source_stats["buildings"] + source_stats["roads"] + source_stats["bridges"])

# 1. Tazader City (r.0.0, r.0.1, r.1.0, r.1.1)
taz_region = os.path.join(maps_dir, "Tazader_City_2015", "Tazader City 2015 (PC)", "region")
process_source_world("tazader", taz_region, ['r.0.1.mca', 'r.0.0.mca', 'r.1.0.mca', 'r.1.1.mca'], is_modern=False)

# 2. Chiang Tung (r.0.0, r.-1.0, r.0.1, r.-1.1)
chiang_region = os.path.join(maps_dir, "Kingdom_of_Chiang_Tung", "Kingdom of Chiang Tung", "region")
process_source_world("chiang_tung", chiang_region, ['r.0.0.mca', 'r.-1.0.mca', 'r.0.1.mca', 'r.-1.1.mca'], is_modern=True)

# 3. Curitiba (r.0.0, r.0.-1, r.-1.0, r.-1.-1)
cur_region = os.path.join(maps_dir, "Curitiba_3-12", "Curitiba 3-12", "region")
process_source_world("curitiba", cur_region, ['r.0.0.mca', 'r.0.-1.mca', 'r.-1.0.mca', 'r.-1.-1.mca'], is_modern=True)

# 4. Greater KC Metro (r.0.0, r.0.1, r.1.0, r.1.1)
kc_region = os.path.join(maps_dir, "GreaterKCMetro_v1.1", "GreaterKCMetro", "region")
process_source_world("greater_kc", kc_region, ['r.0.0.mca', 'r.0.1.mca', 'r.1.0.mca', 'r.1.1.mca'], is_modern=True)

# Save Master Source Manifest
manifest_path = os.path.join(root, "assets", "source_library", "asset_manifest.json")
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2)

print("\n=======================================================")
print(f"  MASTER COMPILER V2 COMPLETED:")
print(f"  Total Modules Extracted: {manifest['total_modules']}")
print(f"  Building Shells: {manifest['categories']['buildings']}")
print(f"  Road Modules: {manifest['categories']['roads']}")
print(f"  Bridges: {manifest['categories']['bridges']}")
print(f"  Manifest written to: {manifest_path}")
print("=======================================================")
