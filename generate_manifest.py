import os
import json

cities = ['tazader', 'chiang_tung', 'curitiba']
output = {}
for city in cities:
    path = f'assets/source_library/{city}/buildings'
    if os.path.exists(path):
        files = [f for f in os.listdir(path) if f.endswith('.json')]
        output[city] = files

js_content = "export const BUILDING_MANIFEST = " + json.dumps(output, indent=4) + ";"

with open('src/world/source/BuildingManifest.js', 'w') as f:
    f.write(js_content)
