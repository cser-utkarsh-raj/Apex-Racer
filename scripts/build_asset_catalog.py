import os
import json
import zipfile
import shutil

root = "c:/Users/u_raj/OneDrive/Desktop/Apex"
runtime_dir = os.path.join(root, "assets", "runtime")
os.makedirs(os.path.join(runtime_dir, "cars"), exist_ok=True)
os.makedirs(os.path.join(runtime_dir, "props"), exist_ok=True)
os.makedirs(os.path.join(runtime_dir, "audio"), exist_ok=True)

catalog = {
    "version": "1.0",
    "vehicles": {
        "player": [],
        "traffic": []
    },
    "street_furniture": [],
    "buildings": [
        {"id": "skyscraper_glass", "style": "neo_city", "width": 28, "height": 110, "depth": 28},
        {"id": "office_corporate", "style": "neo_city", "width": 24, "height": 75, "depth": 24},
        {"id": "commercial_plaza", "style": "mixed", "width": 20, "height": 35, "depth": 20},
        {"id": "brick_residence", "style": "countryside", "width": 14, "height": 16, "depth": 14},
        {"id": "industrial_warehouse", "style": "industrial", "width": 32, "height": 18, "depth": 40}
    ],
    "audio": {
        "engine_v8": "assets/audio/sfx/unuparts_part_unu_engine_v8_running.ogg",
        "tire_skid": "assets/audio/sfx/wheel_skidding.ogg",
        "collision": "assets/audio/sfx/wheel_striking.ogg",
        "air_brake": "assets/audio/sfx/air_brake_activating.ogg"
    },
    "style_presets": ["NEO_CITY", "COUNTRYSIDE", "MOUNTAIN_PASS", "INDUSTRIAL", "MIXED"]
}

# 1. CATALOG PLAYER VEHICLES
player_cars = [
    {
        "id": "gtv_ford_mustang_shelby_gt500",
        "name": "Ford Mustang Shelby GT500",
        "class": "Muscle",
        "price": 75000,
        "engine": "5.2L Supercharged V8",
        "drivetrain": "RWD",
        "power": "760 HP • 625 lb-ft",
        "trans": "7-Speed Dual-Clutch",
        "topSpeed": 290,
        "accel": 9.4,
        "handling": 8.2,
        "drift": 9.6,
        "model": "assets/models/gtv_ford_mustang_shelby_gt500.json",
        "texture": "assets/textures/gtv_shelby.png"
    },
    {
        "id": "gtv_amg_g63",
        "name": "Mercedes-Benz G63 AMG 6x6",
        "class": "Heavy Off-Road",
        "price": 180000,
        "engine": "4.0L Twin-Turbo V8",
        "drivetrain": "6x6 All-Wheel Drive",
        "power": "577 HP • 627 lb-ft",
        "trans": "9-Speed AMG Speedshift",
        "topSpeed": 240,
        "accel": 8.5,
        "handling": 7.4,
        "drift": 7.0,
        "model": "assets/models/gtv_amg_g63.json",
        "texture": "assets/textures/gtv_amg_g63.png"
    },
    {
        "id": "gtv_lamborghini_urus",
        "name": "Lamborghini Urus Super SUV",
        "class": "Super SUV",
        "price": 220000,
        "engine": "4.0L Twin-Turbo V8",
        "drivetrain": "AWD",
        "power": "650 HP • 627 lb-ft",
        "trans": "8-Speed ZF Automatic",
        "topSpeed": 305,
        "accel": 9.6,
        "handling": 8.8,
        "drift": 8.5,
        "model": "assets/models/gtv_lamborghini_urus.json",
        "texture": "assets/textures/gtv_lamborghini_urus.png"
    },
    {
        "id": "ae86",
        "name": "Toyota AE86 Trueno",
        "class": "Drift Weapon",
        "price": 32000,
        "engine": "1.6L 4A-GE DOHC I4",
        "drivetrain": "RWD",
        "power": "130 HP • 110 lb-ft",
        "trans": "5-Speed Manual T50",
        "topSpeed": 225,
        "accel": 7.0,
        "handling": 9.8,
        "drift": 10.0,
        "model": "assets/processed/vehicles/models/ae86.json",
        "texture": "assets/processed/vehicles/textures/ae86_new_toyota_ae86.png"
    },
    {
        "id": "gtv_ford_gt",
        "name": "Ford GT Le Mans Hypercar",
        "class": "Hypercar",
        "price": 450000,
        "engine": "3.5L Twin-Turbo EcoBoost V6",
        "drivetrain": "Mid-Engine RWD",
        "power": "660 HP • 550 lb-ft",
        "trans": "7-Speed Dual-Clutch",
        "topSpeed": 345,
        "accel": 9.9,
        "handling": 9.6,
        "drift": 8.0,
        "model": "assets/models/gtv_ford_gt.json",
        "texture": "assets/textures/gtv_ford_gt.png"
    },
    {
        "id": "gtv_ford_bronco_sport",
        "name": "Ford Bronco Sport 4x4",
        "class": "Off-Road Trail",
        "price": 42000,
        "engine": "2.0L EcoBoost Turbo I4",
        "drivetrain": "Terrain 4x4",
        "power": "250 HP • 277 lb-ft",
        "trans": "8-Speed SelectShift",
        "topSpeed": 210,
        "accel": 7.8,
        "handling": 8.0,
        "drift": 7.2,
        "model": "assets/models/gtv_ford_bronco_sport.json",
        "texture": "assets/textures/gtv_bronco.png"
    },
    {
        "id": "ferrari_f40",
        "name": "Ferrari F40 Twin-Turbo",
        "class": "Iconic Supercar",
        "price": 600000,
        "engine": "2.9L Twin-Turbo Tipo F120 V8",
        "drivetrain": "Mid-Engine RWD",
        "power": "471 HP • 426 lb-ft",
        "trans": "5-Speed Gated Manual",
        "topSpeed": 324,
        "accel": 9.7,
        "handling": 9.4,
        "drift": 9.2,
        "model": "assets/processed/vehicles/models/ferrari_f40.json",
        "texture": "assets/processed/vehicles/textures/ferrari_f40.png"
    },
    {
        "id": "gtv_ford_f150_raptor",
        "name": "Ford F-150 Raptor",
        "class": "Trophy Truck",
        "price": 82000,
        "engine": "3.5L High-Output EcoBoost V6",
        "drivetrain": "Torque-On-Demand 4WD",
        "power": "450 HP • 510 lb-ft",
        "trans": "10-Speed Electronic Auto",
        "topSpeed": 200,
        "accel": 8.1,
        "handling": 7.8,
        "drift": 7.5,
        "model": "assets/models/gtv_ford_f150_raptor.json",
        "texture": "assets/textures/gtv_f150.png"
    },
    {
        "id": "gtv_ford_focus_rs",
        "name": "Ford Focus RS AWD",
        "class": "Rally Hatch",
        "price": 39000,
        "engine": "2.3L Turbocharged I4",
        "drivetrain": "Ford Performance AWD",
        "power": "350 HP • 350 lb-ft",
        "trans": "6-Speed Close-Ratio Manual",
        "topSpeed": 266,
        "accel": 9.1,
        "handling": 9.2,
        "drift": 9.4,
        "model": "assets/models/gtv_ford_focus_rs.json",
        "texture": "assets/textures/gtv_mustang.png"
    },
    {
        "id": "gtv_ford_crown_victoria",
        "name": "Crown Victoria Highway Police",
        "class": "Pursuit Sedan",
        "price": 28000,
        "engine": "4.6L Modular V8",
        "drivetrain": "RWD",
        "power": "250 HP • 297 lb-ft",
        "trans": "4-Speed Automatic",
        "topSpeed": 230,
        "accel": 7.4,
        "handling": 8.0,
        "drift": 8.6,
        "model": "assets/models/gtv_ford_crown_victoria.json",
        "texture": "assets/processed/vehicles/textures/police_car.png"
    }
]

catalog["vehicles"]["player"] = player_cars

# 2. CATALOG TRAFFICCRAFT PROPS
tc_dir = os.path.join(root, "assets", "trafficcraft")
if os.path.exists(tc_dir):
    props = [
        {"id": "guardrail_steel", "category": "barrier", "texture": "assets/trafficcraft/guardrail.png"},
        {"id": "concrete_barrier", "category": "barrier", "texture": "assets/trafficcraft/concrete_barrier.png"},
        {"id": "street_lamp", "category": "lighting", "texture": "assets/trafficcraft/lamp_light.png"},
        {"id": "asphalt_deck", "category": "surface", "texture": "assets/trafficcraft/asphalt.png"},
        {"id": "manhole", "category": "detail", "texture": "assets/trafficcraft/manhole_cover.png"}
    ]
    catalog["street_furniture"] = props

cat_path = os.path.join(runtime_dir, "catalog.json")
with open(cat_path, 'w', encoding='utf-8') as f:
    json.dump(catalog, f, indent=2)

print(f"Generated {cat_path} successfully with {len(player_cars)} player cars and {len(catalog['street_furniture'])} TrafficCraft props!")
