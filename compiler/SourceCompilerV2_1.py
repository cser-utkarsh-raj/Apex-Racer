import os
import json
import anvil
import math

root = "c:/Users/u_raj/OneDrive/Desktop/Apex"
maps_dir = os.path.join(root, "Downloaded Assests", "Maps")
library_dir = os.path.join(root, "assets", "source_library_v2")
os.makedirs(library_dir, exist_ok=True)

manifest = {
    "version": "2.1.0",
    "sources": {},
    "totals": {
        "straight_roads": 0,
        "curves": 0,
        "intersections": 0,
        "t_junctions": 0,
        "highways": 0,
        "ramps_elevated": 0,
        "bridges_overpasses": 0,
        "mountain_touge": 0,
        "building_shells": 0,
        "total_modules": 0,
        "total_voxels": 0
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

def process_world(source_name, region_dir, mca_list, is_modern=False):
    print(f"\n=======================================================")
    print(f"  EXTRACTING TOPOLOGIES: {source_name}")
    print(f"=======================================================")
    
    if not os.path.exists(region_dir):
        return
        
    source_out = os.path.join(library_dir, source_name)
    subdirs = ['straight_roads', 'curves', 'intersections', 't_junctions', 'highways', 'ramps', 'bridges', 'mountain_touge', 'buildings']
    for s in subdirs:
        os.makedirs(os.path.join(source_out, s), exist_ok=True)
        
    stats = {
        "straight_roads": 0,
        "curves": 0,
        "intersections": 0,
        "t_junctions": 0,
        "highways": 0,
        "ramps_elevated": 0,
        "bridges_overpasses": 0,
        "mountain_touge": 0,
        "building_shells": 0,
        "total_voxels": 0
    }
    
    for mca_name in mca_list:
        mca_path = os.path.join(region_dir, mca_name)
        if not os.path.exists(mca_path): continue
        
        try:
            reg = anvil.Region.from_file(mca_path)
            
            for cx in range(0, 32, 2):
                for cz in range(0, 32, 2):
                    try:
                        chunk = reg.get_chunk(cx, cz)
                        road_voxels = []
                        bridge_voxels = []
                        building_voxels = []
                        
                        if is_modern:
                            secs = chunk.data.get('sections', []) or chunk.data.get('Sections', [])
                            for s in secs:
                                y_val = s.get('Y')
                                if y_val is None: continue
                                y = y_val.value if hasattr(y_val, 'value') else int(y_val)
                                if y < 1 or y > 18: continue
                                y_base = y * 16
                                
                                blocks = decode_modern_section(s)
                                if blocks:
                                    for idx, bname in enumerate(blocks):
                                        if idx % 4 != 0: continue
                                        ly = idx // 256
                                        lz = (idx % 256) // 16
                                        lx = idx % 16
                                        
                                        if any(k in bname for k in ['concrete', 'asphalt', 'wool', 'smooth_stone', 'sandstone', 'dirt_path', 'stone_stairs', 'slab', 'cobblestone', 'path']):
                                            road_voxels.append({"x": lx, "y": (y_base + ly) - 64, "z": lz, "b": bname})
                                        elif any(k in bname for k in ['iron', 'chain', 'wall', 'fence']):
                                            bridge_voxels.append({"x": lx, "y": (y_base + ly) - 64, "z": lz, "b": bname})
                                        elif any(k in bname for k in ['glass', 'quartz', 'brick', 'wood', 'planks', 'terracotta', 'log', 'lantern', 'prismarine']):
                                            building_voxels.append({"x": lx, "y": (y_base + ly) - 64, "z": lz, "b": bname})
                        else:
                            # 1.12 legacy chunk
                            for x in range(0, 16, 2):
                                for z in range(0, 16, 2):
                                    for y in range(60, 130, 2):
                                        try:
                                            b = chunk.get_block(x, y, z)
                                            if b and b.id not in [0, 'air', 'water', 'dirt', 'grass', 'bedrock']:
                                                bname = str(b.id)
                                                if any(k in bname for k in ['concrete', 'wool', 'clay', 'step', 'slab', 'stone', 'sandstone']):
                                                    road_voxels.append({"x": x, "y": y - 62, "z": z, "b": bname})
                                                elif any(k in bname for k in ['iron', 'fence', 'bars', 'wall']):
                                                    bridge_voxels.append({"x": x, "y": y - 62, "z": z, "b": bname})
                                                elif any(k in bname for k in ['glass', 'quartz', 'brick', 'wood', 'planks', 'stained_clay', 'glowstone']):
                                                    building_voxels.append({"x": x, "y": y - 62, "z": z, "b": bname})
                                        except: pass
                        
                        # CLASSIFY AND EXPORT ROAD MODULES
                        if len(road_voxels) >= 10:
                            xs = [v['x'] for v in road_voxels]
                            zs = [v['z'] for v in road_voxels]
                            ys = [v['y'] for v in road_voxels]
                            
                            x_span = max(xs) - min(xs)
                            z_span = max(zs) - min(zs)
                            y_delta = max(ys) - min(ys)
                            
                            mod_id = f"{source_name}_c{cx}_{cz}"
                            
                            if y_delta >= 6:
                                if source_name == 'chiang_tung':
                                    subtype = "mountain_touge"
                                    subdir = "mountain_touge"
                                    stats["mountain_touge"] += 1
                                else:
                                    subtype = "elevated_ramp"
                                    subdir = "ramps"
                                    stats["ramps_elevated"] += 1
                            elif len(bridge_voxels) >= 6:
                                subtype = "bridge_overpass"
                                subdir = "bridges"
                                stats["bridges_overpasses"] += 1
                            elif x_span >= 8 and z_span >= 8:
                                if len(road_voxels) > 24:
                                    subtype = "crossroad_intersection"
                                    subdir = "intersections"
                                    stats["intersections"] += 1
                                else:
                                    subtype = "curved_road"
                                    subdir = "curves"
                                    stats["curves"] += 1
                            elif len(road_voxels) >= 28 and (source_name == 'greater_kc' or source_name == 'tazader'):
                                subtype = "highway_freeway"
                                subdir = "highways"
                                stats["highways"] += 1
                            else:
                                subtype = "straight_road"
                                subdir = "straight_roads"
                                stats["straight_roads"] += 1
                                
                            road_module = {
                                "id": f"{mod_id}_{subtype}",
                                "source": source_name,
                                "category": "road_module",
                                "subtype": subtype,
                                "roadType": "asphalt",
                                "laneCount": 4 if len(road_voxels) > 20 else 2,
                                "width": max(16, max(x_span, z_span) * 2),
                                "length": 32,
                                "elevationDelta": y_delta,
                                "curvature": 0.35 if "curve" in subtype else 0.0,
                                "entrySocket": {
                                    "position": [0, ys[0] if ys else 0, -16],
                                    "heading": 0.0,
                                    "width": 24,
                                    "elevation": min(ys) if ys else 0
                                },
                                "exitSocket": {
                                    "position": [0, ys[-1] if ys else 0, 16],
                                    "heading": 0.0 if "straight" in subtype else 45.0,
                                    "width": 24,
                                    "elevation": max(ys) if ys else 0
                                },
                                "voxels": [{"x": v['x'], "y": v['y'], "z": v['z']} for v in road_voxels],
                                "voxel_count": len(road_voxels)
                            }
                            
                            with open(os.path.join(source_out, subdir, f"{road_module['id']}.json"), 'w') as f:
                                json.dump(road_module, f)
                            stats["total_voxels"] += len(road_voxels)

                        # Export Building Shells
                        if len(building_voxels) >= 16:
                            b_id = f"{source_name}_bldg_c{cx}_{cz}"
                            with open(os.path.join(source_out, 'buildings', f"{b_id}.json"), 'w') as f:
                                json.dump({
                                    "id": b_id,
                                    "source": source_name,
                                    "category": "building_shell",
                                    "voxels": [{"x": v['x'], "y": v['y'], "z": v['z']} for v in building_voxels],
                                    "voxel_count": len(building_voxels)
                                }, f)
                            stats["building_shells"] += 1
                            stats["total_voxels"] += len(building_voxels)

                    except Exception as e:
                        pass
        except Exception as e:
            pass
            
    print(f"  [RESULT] {source_name}:")
    print(f"    - Straight Roads:      {stats['straight_roads']}")
    print(f"    - Curved Roads:        {stats['curves']}")
    print(f"    - Intersections (4W):  {stats['intersections']}")
    print(f"    - T-Junctions:         {stats['t_junctions']}")
    print(f"    - Highway Segments:    {stats['highways']}")
    print(f"    - Ramps & Elevated:    {stats['ramps_elevated']}")
    print(f"    - Bridges/Overpasses:  {stats['bridges_overpasses']}")
    print(f"    - Mountain Touge:      {stats['mountain_touge']}")
    print(f"    - Building Shells:     {stats['building_shells']}")
    print(f"    - Total Voxels:        {stats['total_voxels']:,}")
    
    manifest["sources"][source_name] = stats
    manifest["totals"]["straight_roads"] += stats["straight_roads"]
    manifest["totals"]["curves"] += stats["curves"]
    manifest["totals"]["intersections"] += stats["intersections"]
    manifest["totals"]["t_junctions"] += stats["t_junctions"]
    manifest["totals"]["highways"] += stats["highways"]
    manifest["totals"]["ramps_elevated"] += stats["ramps_elevated"]
    manifest["totals"]["bridges_overpasses"] += stats["bridges_overpasses"]
    manifest["totals"]["mountain_touge"] += stats["mountain_touge"]
    manifest["totals"]["building_shells"] += stats["building_shells"]
    manifest["totals"]["total_modules"] += sum(v for k, v in stats.items() if k != "total_voxels")
    manifest["totals"]["total_voxels"] += stats["total_voxels"]

# 1. Greater KC Metro (8 MCA files)
kc_region = os.path.join(maps_dir, "GreaterKCMetro_v1.1", "GreaterKCMetro", "region")
process_world("greater_kc", kc_region, ['r.0.0.mca', 'r.0.1.mca', 'r.1.0.mca', 'r.-1.0.mca', 'r.0.-1.mca', 'r.-1.-1.mca', 'r.1.1.mca', 'r.-1.1.mca'], is_modern=True)

# 2. Tazader City (4 MCA files)
taz_region = os.path.join(maps_dir, "Tazader_City_2015", "Tazader City 2015 (PC)", "region")
process_world("tazader", taz_region, ['r.0.1.mca', 'r.0.0.mca', 'r.1.0.mca', 'r.1.1.mca'], is_modern=False)

# 3. Kingdom of Chiang Tung (4 MCA files)
chi_region = os.path.join(maps_dir, "Kingdom_of_Chiang_Tung", "Kingdom of Chiang Tung", "region")
process_world("chiang_tung", chi_region, ['r.0.0.mca', 'r.-1.0.mca', 'r.0.1.mca', 'r.-1.1.mca'], is_modern=True)

# 4. Curitiba Transit (4 MCA files)
cur_region = os.path.join(maps_dir, "Curitiba_3-12", "Curitiba 3-12", "region")
process_world("curitiba", cur_region, ['r.0.0.mca', 'r.0.-1.mca', 'r.-1.0.mca', 'r.-1.-1.mca'], is_modern=True)

# Save Master Manifest V2.1
manifest_out = os.path.join(library_dir, "driving_topology_manifest.json")
with open(manifest_out, 'w') as f:
    json.dump(manifest, f, indent=2)

print("\n=======================================================")
print("  SOURCE COMPILER V2.1 COMPLETE!")
print(f"  Total Extracted Driving Modules: {manifest['totals']['total_modules']:,}")
print(f"  Total Extracted Voxels:          {manifest['totals']['total_voxels']:,}")
print(f"  Manifest written to:             {manifest_out}")
print("=======================================================")
