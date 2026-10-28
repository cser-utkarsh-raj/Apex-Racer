import os
import json
import math

root = "c:/Users/u_raj/OneDrive/Desktop/Apex"
maps_dir = os.path.join(root, "maps")

# 1. CURITIBA TRANSIT CITY
os.makedirs(os.path.join(maps_dir, "curitiba"), exist_ok=True)
curitiba_roads = [
    {"id": "curitiba_central_blvd", "startX": -400, "startZ": 0, "endX": 400, "endZ": 0, "lanes": 4, "width": 28, "surface": "asphalt"},
    {"id": "curitiba_north_express", "startX": 0, "startZ": -500, "endX": 0, "endZ": 500, "lanes": 4, "width": 28, "surface": "asphalt"},
    {"id": "curitiba_ring_1", "startX": -400, "startZ": -400, "endX": 400, "endZ": -400, "lanes": 2, "width": 18, "surface": "asphalt"},
    {"id": "curitiba_ring_2", "startX": 400, "startZ": -400, "endX": 400, "endZ": 400, "lanes": 2, "width": 18, "surface": "asphalt"},
    {"id": "curitiba_ring_3", "startX": 400, "startZ": 400, "endX": -400, "endZ": 400, "lanes": 2, "width": 18, "surface": "asphalt"},
    {"id": "curitiba_ring_4", "startX": -400, "startZ": 400, "endX": -400, "endZ": -400, "lanes": 2, "width": 18, "surface": "asphalt"}
]
curitiba_buildings = []
for gx in range(-8, 9):
    for gz in range(-8, 9):
        bx = gx * 55 + (15 if gx >= 0 else -15)
        bz = gz * 55 + (15 if gz >= 0 else -15)
        if abs(bx) < 22 and abs(bz) < 22: continue
        h = 30 + (abs(gx * 11 + gz * 7) % 55)
        b_type = "tazader_office" if h > 50 else "tazader_commercial"
        curitiba_buildings.append({"x": bx, "z": bz, "width": 24, "depth": 24, "height": h, "type": b_type, "hasAntenna": (h > 65)})

curitiba_data = {
    "name": "Curitiba Transit City",
    "theme": "urban_transit",
    "roads": curitiba_roads,
    "buildings": curitiba_buildings,
    "events": [{
        "id": "curitiba_sprint",
        "name": "Curitiba City Sprint",
        "laps": 3,
        "rewardCash": 18000,
        "rewardRep": 300,
        "checkpoints": [
            {"x": 0, "z": -250, "radius": 15},
            {"x": 250, "z": -250, "radius": 15},
            {"x": 250, "z": 250, "radius": 15},
            {"x": -250, "z": 250, "radius": 15},
            {"x": -250, "z": -250, "radius": 15}
        ]
    }]
}
with open(os.path.join(maps_dir, "curitiba", "world.json"), 'w') as f:
    json.dump(curitiba_data, f, indent=2)

# 2. NANTWICH COUNTRYSIDE TOUGE
os.makedirs(os.path.join(maps_dir, "nantwich"), exist_ok=True)
nantwich_roads = []
for i in range(16):
    a1 = (i / 16) * math.pi * 2
    a2 = ((i + 1) / 16) * math.pi * 2
    r1 = 350 + math.sin(i * 1.5) * 80
    r2 = 350 + math.sin((i + 1) * 1.5) * 80
    nantwich_roads.append({
        "id": f"nantwich_curve_{i}",
        "startX": math.cos(a1) * r1, "startZ": math.sin(a1) * r1,
        "endX": math.cos(a2) * r2, "endZ": math.sin(a2) * r2,
        "lanes": 2, "width": 16, "surface": "asphalt"
    })
nantwich_buildings = []
for i in range(40):
    a = (i / 40) * math.pi * 2
    bx = math.cos(a) * 440 + (i % 3) * 10
    bz = math.sin(a) * 440 + (i % 2) * 10
    nantwich_buildings.append({"x": bx, "z": bz, "width": 14, "depth": 14, "height": 12 + (i % 6) * 2, "type": "brick_facade", "hasAntenna": False})

nantwich_data = {
    "name": "Nantwich Countryside Touge",
    "theme": "countryside",
    "roads": nantwich_roads,
    "buildings": nantwich_buildings,
    "events": [{
        "id": "cheshire_touge",
        "name": "Cheshire Touge Sprint",
        "laps": 2,
        "rewardCash": 20000,
        "rewardRep": 350,
        "checkpoints": [
            {"x": 0, "z": -350, "radius": 14},
            {"x": 350, "z": 0, "radius": 14},
            {"x": 0, "z": 350, "radius": 14},
            {"x": -350, "z": 0, "radius": 14}
        ]
    }]
}
with open(os.path.join(maps_dir, "nantwich", "world.json"), 'w') as f:
    json.dump(nantwich_data, f, indent=2)

# 3. CHIANG TUNG MOUNTAIN PASS
os.makedirs(os.path.join(maps_dir, "chiang_tung"), exist_ok=True)
chiang_roads = []
for i in range(12):
    sz = -600 + i * 100
    ez = -600 + (i + 1) * 100
    sx = math.sin(i * 1.2) * 160
    ex = math.sin((i + 1) * 1.2) * 160
    chiang_roads.append({
        "id": f"mountain_hairpin_{i}",
        "startX": sx, "startZ": sz,
        "endX": ex, "endZ": ez,
        "lanes": 2, "width": 18, "surface": "asphalt"
    })
# Loop back
chiang_roads.append({"id": "mountain_return", "startX": ex, "startZ": ez, "endX": chiang_roads[0]["startX"], "endZ": chiang_roads[0]["startZ"], "lanes": 2, "width": 18, "surface": "asphalt"})

chiang_data = {
    "name": "Chiang Tung Mountain Pass",
    "theme": "mountain_pass",
    "roads": chiang_roads,
    "buildings": nantwich_buildings[:25],
    "events": [{
        "id": "dragon_pass",
        "name": "Dragon Pass Mountain Drift",
        "laps": 3,
        "rewardCash": 25000,
        "rewardRep": 500,
        "checkpoints": [
            {"x": 0, "z": -500, "radius": 16},
            {"x": 140, "z": -200, "radius": 16},
            {"x": -140, "z": 100, "radius": 16},
            {"x": 100, "z": 450, "radius": 16}
        ]
    }]
}
with open(os.path.join(maps_dir, "chiang_tung", "world.json"), 'w') as f:
    json.dump(chiang_data, f, indent=2)

print("Generated all 3 additional world definitions successfully!")
