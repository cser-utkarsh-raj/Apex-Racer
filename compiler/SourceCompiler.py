import os
import json
import anvil
import math

root = "c:/Users/u_raj/OneDrive/Desktop/Apex"
maps_dir = os.path.join(root, "Downloaded Assests", "Maps")
compiled_dir = os.path.join(root, "assets", "compiled_modules")
os.makedirs(compiled_dir, exist_ok=True)

# Master Module Library
module_manifest = {
    "modules": [],
    "statistics": {
        "tazader_modules": 0,
        "curitiba_modules": 0,
        "chiang_tung_modules": 0,
        "total_structures": 0,
        "total_voxels": 0
    }
}

def extract_building_shell(chunk, min_x, max_x, min_z, max_z, min_y, max_y):
    """
    Extract exterior shell voxels, skipping interior air and hidden blocks
    """
    shell_voxels = []
    for x in range(min_x, max_x, 2):
        for z in range(min_z, max_z, 2):
            for y in range(min_y, max_y, 2):
                try:
                    b = chunk.get_block(x, y, z)
                    if b and b.id not in [0, 'air', 'water', 'dirt', 'grass', 'stone', 'bedrock']:
                        bname = str(b.id)
                        color = '#f5f6fa'
                        category = 'facade'
                        if 'glass' in bname: 
                            color = '#74b9ff'
                            category = 'window'
                        elif 'brick' in bname or 'terracotta' in bname or 'clay' in bname: 
                            color = '#c0392b'
                            category = 'brick_wall'
                        elif 'wood' in bname or 'planks' in bname or 'log' in bname: 
                            color = '#8d6e63'
                            category = 'wood_frame'
                        elif 'lantern' in bname or 'glowstone' in bname or 'sea_lantern' in bname: 
                            color = '#ffeaa7'
                            category = 'illumination'
                        elif 'concrete' in bname or 'wool' in bname: 
                            color = '#2d3436'
                            category = 'concrete_pillar'
                        elif 'iron' in bname or 'quartz' in bname: 
                            color = '#dfe6e9'
                            category = 'quartz_trim'
                            
                        shell_voxels.append({
                            "rel_x": x - min_x,
                            "rel_y": y - min_y,
                            "rel_z": z - min_z,
                            "color": color,
                            "category": category
                        })
                except:
                    pass
    return shell_voxels

# =========================================================================
# 1. COMPILE TAZADER MODULES (Downtown Skyscraper, Highway Interchanges)
# =========================================================================
print("=== 1. COMPILING TAZADER DOWNTOWN & HIGHWAY MODULES ===")
taz_mca_path = os.path.join(maps_dir, "Tazader_City_2015", "Tazader City 2015 (PC)", "region", "r.0.1.mca")
if os.path.exists(taz_mca_path):
    taz_reg = anvil.Region.from_file(taz_mca_path)
    
    taz_targets = [
        {"id": "tazader_skyscraper_alpha", "cx": 12, "cz": 52, "type": "skyscraper", "height": 72, "w": 28, "d": 28},
        {"id": "tazader_skyscraper_beta", "cx": 8, "cz": 52, "type": "skyscraper", "height": 65, "w": 24, "d": 24},
        {"id": "tazader_office_tower", "cx": 4, "cz": 48, "type": "office_tower", "height": 55, "w": 26, "d": 26},
        {"id": "tazader_plaza_complex", "cx": 12, "cz": 60, "type": "plaza", "height": 48, "w": 32, "d": 32},
        {"id": "tazader_hotel_highrise", "cx": 16, "cz": 56, "type": "skyscraper", "height": 80, "w": 28, "d": 28},
        {"id": "tazader_commercial_hub", "cx": 8, "cz": 60, "type": "commercial", "height": 50, "w": 30, "d": 30}
    ]
    
    for t in taz_targets:
        try:
            chunk = taz_reg.get_chunk(t["cx"] % 32, t["cz"] % 32)
            voxels = extract_building_shell(chunk, 0, 16, 0, 16, 62, 62 + t["height"])
            
            mod_data = {
                "id": t["id"],
                "source": "tazader",
                "category": "building",
                "type": t["type"],
                "width": t["w"],
                "depth": t["d"],
                "height": t["height"],
                "voxels": voxels,
                "voxel_count": len(voxels),
                "tags": ["downtown", "metropolis", "highrise"]
            }
            
            out_file = os.path.join(compiled_dir, f"{t['id']}.json")
            with open(out_file, 'w') as f:
                json.dump(mod_data, f)
                
            module_manifest["modules"].append({
                "id": t["id"],
                "source": "tazader",
                "category": "building",
                "voxels": len(voxels),
                "file": f"assets/compiled_modules/{t['id']}.json"
            })
            module_manifest["statistics"]["tazader_modules"] += 1
            module_manifest["statistics"]["total_structures"] += 1
            module_manifest["statistics"]["total_voxels"] += len(voxels)
            print(f"  [+] Compiled {t['id']}: {len(voxels)} exterior voxels")
        except Exception as e:
            print(f"  [-] Error compiling {t['id']}: {e}")

# =========================================================================
# 2. COMPILE CHIANG TUNG MODULES (Mountain Pagodas, Touge Temples, Bridges)
# =========================================================================
print("\n=== 2. COMPILING CHIANG TUNG MOUNTAIN & TEMPLE MODULES ===")
chi_mca_path = os.path.join(maps_dir, "Kingdom_of_Chiang_Tung", "Kingdom of Chiang Tung", "region", "r.0.0.mca")
if os.path.exists(chi_mca_path):
    chi_reg = anvil.Region.from_file(chi_mca_path)
    
    chi_targets = [
        {"id": "chiang_grand_pagoda", "cx": 0, "cz": 4, "type": "pagoda", "height": 38, "w": 22, "d": 22},
        {"id": "chiang_mountain_shrine", "cx": 1, "cz": 4, "type": "shrine", "height": 26, "w": 18, "d": 18},
        {"id": "chiang_cliff_temple", "cx": 0, "cz": 5, "type": "temple", "height": 32, "w": 20, "d": 20},
        {"id": "chiang_stone_arch_bridge", "cx": 2, "cz": 4, "type": "bridge", "height": 20, "w": 16, "d": 28},
        {"id": "chiang_bamboo_gate", "cx": 1, "cz": 5, "type": "torii_gate", "height": 18, "w": 14, "d": 8}
    ]
    
    for t in chi_targets:
        try:
            chunk = chi_reg.get_chunk(t["cx"] % 32, t["cz"] % 32)
            voxels = []
            
            # Read modern 1.18+ sections
            secs = chunk.data.get('Sections', [])
            for s in secs:
                y_sec = s.get('Y')
                if y_sec is None: continue
                y_base = y_sec.value * 16 if hasattr(y_sec, 'value') else int(y_sec) * 16
                if y_base < 60: continue
                
                palette = s.get('Palette', [])
                names = [p['Name'].value if hasattr(p['Name'], 'value') else str(p['Name']) for p in palette]
                if not any(any(k in n for k in ['wood', 'planks', 'stairs', 'lantern', 'stone_brick', 'slab']) for n in names):
                    continue
                    
                for lx in range(0, 16, 2):
                    for lz in range(0, 16, 2):
                        for ly in range(0, 16, 2):
                            try:
                                b = chunk.get_block(lx, y_base + ly, lz)
                                if b and b.id not in [0, 'air', 'water', 'dirt', 'grass_block', 'stone']:
                                    bname = str(b.id)
                                    color = '#8d6e63'
                                    category = 'wood'
                                    if 'lantern' in bname: 
                                        color = '#ffeaa7'; category = 'illumination'
                                    elif 'stone' in bname: 
                                        color = '#7f8c8d'; category = 'stone'
                                    elif 'red' in bname or 'acacia' in bname: 
                                        color = '#b71540'; category = 'pagoda_roof'
                                        
                                    voxels.append({
                                        "rel_x": lx,
                                        "rel_y": (y_base + ly) - 64,
                                        "rel_z": lz,
                                        "color": color,
                                        "category": category
                                    })
                            except: pass
            
            mod_data = {
                "id": t["id"],
                "source": "chiang_tung",
                "category": t["type"],
                "width": t["w"],
                "depth": t["d"],
                "height": t["height"],
                "voxels": voxels,
                "voxel_count": len(voxels),
                "tags": ["mountain", "touge", "traditional", "pagoda"]
            }
            
            out_file = os.path.join(compiled_dir, f"{t['id']}.json")
            with open(out_file, 'w') as f:
                json.dump(mod_data, f)
                
            module_manifest["modules"].append({
                "id": t["id"],
                "source": "chiang_tung",
                "category": t["type"],
                "voxels": len(voxels),
                "file": f"assets/compiled_modules/{t['id']}.json"
            })
            module_manifest["statistics"]["chiang_tung_modules"] += 1
            module_manifest["statistics"]["total_structures"] += 1
            module_manifest["statistics"]["total_voxels"] += len(voxels)
            print(f"  [+] Compiled {t['id']}: {len(voxels)} temple voxels")
        except Exception as e:
            print(f"  [-] Error compiling {t['id']}: {e}")

# =========================================================================
# 3. COMPILE CURITIBA TRANSIT & RESIDENTIAL MODULES
# =========================================================================
print("\n=== 3. COMPILING CURITIBA TRANSIT & RESIDENTIAL MODULES ===")
cur_mca_path = os.path.join(maps_dir, "Curitiba_3-12", "Curitiba 3-12", "region", "r.0.0.mca")
if os.path.exists(cur_mca_path):
    cur_reg = anvil.Region.from_file(cur_mca_path)
    
    cur_targets = [
        {"id": "curitiba_brt_tube_station", "cx": 20, "cz": 4, "type": "transit_station", "height": 14, "w": 18, "d": 32},
        {"id": "curitiba_quartz_apartment", "cx": 21, "cz": 4, "type": "apartment", "height": 45, "w": 24, "d": 24},
        {"id": "curitiba_boulevard_block", "cx": 22, "cz": 5, "type": "commercial_block", "height": 35, "w": 28, "d": 28}
    ]
    
    for t in cur_targets:
        try:
            chunk = cur_reg.get_chunk(t["cx"] % 32, t["cz"] % 32)
            voxels = []
            secs = chunk.data.get('Sections', [])
            for s in secs:
                y_sec = s.get('Y')
                if y_sec is None: continue
                y_base = y_sec.value * 16 if hasattr(y_sec, 'value') else int(y_sec) * 16
                if y_base < 60: continue
                
                for lx in range(0, 16, 2):
                    for lz in range(0, 16, 2):
                        for ly in range(0, 16, 2):
                            try:
                                b = chunk.get_block(lx, y_base + ly, lz)
                                if b and b.id not in [0, 'air', 'water', 'dirt', 'grass_block', 'stone']:
                                    voxels.append({
                                        "rel_x": lx,
                                        "rel_y": (y_base + ly) - 62,
                                        "rel_z": lz,
                                        "color": '#f5f6fa' if 'quartz' in str(b.id) else '#d63031',
                                        "category": 'transit'
                                    })
                            except: pass
                            
            mod_data = {
                "id": t["id"],
                "source": "curitiba",
                "category": t["type"],
                "width": t["w"],
                "depth": t["d"],
                "height": t["height"],
                "voxels": voxels,
                "voxel_count": len(voxels),
                "tags": ["urban", "transit", "brt", "boulevard"]
            }
            
            out_file = os.path.join(compiled_dir, f"{t['id']}.json")
            with open(out_file, 'w') as f:
                json.dump(mod_data, f)
                
            module_manifest["modules"].append({
                "id": t["id"],
                "source": "curitiba",
                "category": t["type"],
                "voxels": len(voxels),
                "file": f"assets/compiled_modules/{t['id']}.json"
            })
            module_manifest["statistics"]["curitiba_modules"] += 1
            module_manifest["statistics"]["total_structures"] += 1
            module_manifest["statistics"]["total_voxels"] += len(voxels)
            print(f"  [+] Compiled {t['id']}: {len(voxels)} transit voxels")
        except Exception as e:
            print(f"  [-] Error compiling {t['id']}: {e}")

# Save Master Module Library Manifest
manifest_out = os.path.join(compiled_dir, "module_manifest.json")
with open(manifest_out, 'w') as f:
    json.dump(module_manifest, f, indent=2)

print("\n=======================================================")
print(f"  SUCCESSFULLY COMPILED {module_manifest['statistics']['total_structures']} SOURCE MODULES!")
print(f"  TOTAL SHELL VOXELS: {module_manifest['statistics']['total_voxels']:,}")
print(f"  MANIFEST SAVED TO: {manifest_out}")
print("=======================================================")
