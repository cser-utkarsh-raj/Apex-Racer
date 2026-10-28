import os
import json
import anvil
import math

def decode_modern_section(section):
    # 1.18+ uses nested 'block_states'
    bs = section.get('block_states', section)
    
    # 1.13-1.17 uses 'Palette' directly in section
    raw_palette = bs.get('palette', []) or bs.get('Palette', [])
    palette = [x['Name'].value if hasattr(x['Name'], 'value') else str(x['Name']) for x in raw_palette]
    if not palette or len(palette) <= 1: return []
    
    data_longs = bs.get('data', None) or bs.get('BlockStates', None)
    if data_longs is None: return []
    data = data_longs.value if hasattr(data_longs, 'value') else list(data_longs)
    bits_per_block = max(4, math.ceil(math.log2(len(palette))))
    blocks_per_long = 64 // bits_per_block
    mask = (1 << bits_per_block) - 1
    blocks = []
    for long_val in data:
        u_val = long_val if long_val >= 0 else long_val + (1 << 64)
        for i in range(blocks_per_long):
            idx = (u_val >> (i * bits_per_block)) & mask
            if idx < len(palette): blocks.append(palette[idx])
            if len(blocks) >= 4096: break
        if len(blocks) >= 4096: break
    return blocks

def extract_modern_region(mca_path, out_dir, region_x, region_z):
    reg = anvil.Region.from_file(mca_path)
    print(f"Processing region {region_x},{region_z} from {mca_path}", flush=True)
    
    # 8x8 direct map chunks per region
    for out_cx in range(8):
        for out_cz in range(8):
            voxels = []
            for mc_x in range(4):
                for mc_z in range(4):
                    chunk_x = out_cx * 4 + mc_x
                    chunk_z = out_cz * 4 + mc_z
                    
                    try:
                        chunk = reg.get_chunk(chunk_x, chunk_z)
                        secs = chunk.data.get('sections', []) or chunk.data.get('Sections', [])
                        
                        # Process sections from top to bottom to find surface
                        for s in reversed(secs):
                            y_val = s.get('Y')
                            if y_val is None: continue
                            y_sec = y_val.value if hasattr(y_val, 'value') else int(y_val)
                            
                            # Skip high sky and deep underground
                            if y_sec < -4 or y_sec > 18: continue
                            
                            y_base = y_sec * 16
                            blocks = decode_modern_section(s)
                            if not blocks: continue
                            
                            for idx, bname in enumerate(blocks):
                                if 'air' in bname or 'cave' in bname: continue
                                
                                ly = idx // 256
                                lz = (idx % 256) // 16
                                lx = idx % 16
                                
                                # Global coords
                                global_x = region_x * 512 + chunk_x * 16 + lx
                                global_z = region_z * 512 + chunk_z * 16 + lz
                                global_y = y_base + ly
                                
                                # Basic surface culling: only take top blocks
                                # (In a robust setup we'd check neighbors, but for speed we just sample)
                                # Actually, just taking every 2nd or 4th block speeds up and looks okay, but user wants actual map.
                                # Let's just take all solid blocks in the section! Wait, that's too heavy.
                                # Let's just grab surface blocks by storing the highest Y per (x,z) column.
                                
                                voxels.append({
                                    'x': global_x, 'y': global_y, 'z': global_z, 'b': bname
                                })
                    except Exception as e:
                        pass
            
            if voxels:
                # Extract the 3D surface shell by culling completely surrounded blocks
                voxel_set = {(v['x'], v['y'], v['z']) for v in voxels}
                
                final_voxels = []
                for v in voxels:
                    x, y, z = v['x'], v['y'], v['z']
                    
                    # If it lacks any of its 6 neighbors within this chunk, it's on the surface (or chunk boundary)
                    if ((x+1, y, z) not in voxel_set or
                        (x-1, y, z) not in voxel_set or
                        (x, y+1, z) not in voxel_set or
                        (x, y-1, z) not in voxel_set or
                        (x, y, z+1) not in voxel_set or
                        (x, y, z-1) not in voxel_set):
                        
                        b_str = v['b']
                        color = '#808080'
                        if any(k in b_str for k in ['grass', 'leaves', 'plant', 'vine']): color = '#2d5a27'
                        elif any(k in b_str for k in ['dirt', 'path']): color = '#5c3a21'
                        elif any(k in b_str for k in ['sand', 'sandstone']): color = '#d2b48c'
                        elif any(k in b_str for k in ['water']): color = '#3b5998'
                        elif any(k in b_str for k in ['concrete', 'asphalt', 'wool', 'gray']): color = '#2d3436'
                        elif any(k in b_str for k in ['quartz', 'iron', 'white']): color = '#f5f6fa'
                        elif any(k in b_str for k in ['brick', 'terracotta', 'red']): color = '#c0392b'
                        elif any(k in b_str for k in ['wood', 'planks', 'log', 'fence', 'brown']): color = '#8b5a2b'
                        elif any(k in b_str for k in ['glass']): color = '#a8d2ec'
                        elif any(k in b_str for k in ['stone', 'cobblestone', 'slab']): color = '#7f8c8d'
                        elif any(k in b_str for k in ['yellow', 'gold']): color = '#f1c40f'
                        elif any(k in b_str for k in ['cyan', 'blue']): color = '#2980b9'
                        
                        final_voxels.append({'x': x, 'y': y, 'z': z, 'c': color})
                
                global_out_x = region_x * 8 + out_cx
                global_out_z = region_z * 8 + out_cz
                out_path = os.path.join(out_dir, f"chunk_{global_out_x}_{global_out_z}.json")
                with open(out_path, 'w') as f:
                    json.dump({'voxels': final_voxels}, f)
                print(f"Exported {out_path} ({len(final_voxels)} voxels)", flush=True)

if __name__ == "__main__":
    root = "c:/Users/u_raj/OneDrive/Desktop/Apex"
    
    # Chiang Tung uses: r.0.0.mca, r.-1.0.mca, r.0.1.mca, r.-1.1.mca
    map_dir = os.path.join(root, "Downloaded Assests", "Maps", "Kingdom_of_Chiang_Tung", "Kingdom of Chiang Tung", "region")
    out_dir = os.path.join(root, "assets", "direct_map", "chiang_tung")
    os.makedirs(out_dir, exist_ok=True)
    
    regions = [
        ('r.0.0.mca', 0, 0),
        ('r.-1.0.mca', -1, 0),
        ('r.0.1.mca', 0, 1),
        ('r.-1.1.mca', -1, 1)
    ]
    
    for fname, rx, rz in regions:
        mca_path = os.path.join(map_dir, fname)
        if os.path.exists(mca_path):
            extract_modern_region(mca_path, out_dir, rx, rz)
