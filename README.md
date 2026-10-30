# APEX: Open Road

APEX: Open Road is a high-performance voxel-styled arcade racing game built with Three.js. It blends a cinematic city drive, stylized worlds, traffic simulation, vehicle selection, and a polished arcade UI into a compact browser-based racing experience.

The project is designed to run in the browser and supports a lightweight static hosting setup, while also exposing an Electron wrapper for desktop use.

## Highlights

- High-speed 3D arcade driving
- Voxel-inspired city and highway visuals
- Multiple worlds and route transitions
- Car garage and vehicle selection
- Traffic system and dynamic world loading
- HUD, minimap, race flow, and cinematic camera modes
- Touch controls support for mobile screens
- PWA support and service worker caching
- Desktop packaging via Electron

## Game Overview

The player starts in a showroom menu and can enter the open-road experience from a garage or the main menu. The game presents stylized routes that move through different world states and track sections. Driving involves acceleration, braking, steering, nitro boosts, drifting, and race checkpoints depending on the current activity.

The world is built around a renderer pipeline that uses:

- Three.js core scene and camera setup
- Post-processing passes for bloom, output transform, FXAA, and grading
- Shadow mapping and fog-based atmospheric styling
- Streaming world generation and chunked world updates

## Project Structure

```text
Apex-Racer/
├── assets/                 # Game assets, textures, UI visuals, and shared resources
├── compiler/               # Build or processing helpers for game content/data
├── src/                    # Main game logic and systems
│   ├── audio/              # Audio engine and sound management
│   ├── race/               # Race logic and checkpoints
│   ├── traffic/            # AI traffic system
│   ├── ui/                 # Menus, HUD, garage, and touch controls
│   ├── vehicles/           # Vehicle meshes, loaders, and merger utilities
│   ├── world/              # World assembly, chunks, world generation and post-processing
│   ├── main.js             # Main game entry point
│   └── ...
├── .gitignore
├── building_manifest.json
├── convert_chiang_tung.py
├── electron_main.js
├── generate_manifest.py
├── index.html
├── manifest.webmanifest
├── package.json
├── preload.js
├── scripts/
├── style.css
├── sw.js
├── test.html
├── test_physics.html
├── vercel.json
├── README.md
└── ...
```

## Features

### 1. Driving and physics

The core gameplay is handled through a custom vehicle physics layer. This manages movement, speed, steering, drift behavior, gear state, and vehicle control. The game continuously updates the car transform in response to player input and environment constraints.

### 2. World system

The world loader and assembler manage route data and world objects. The game is built around a route-based system with maps, checkpoints, and procedural or prebuilt world segments. The world system supports switching between different regions and updating the active route.

### 3. Traffic AI

Traffic vehicles are generated and managed in a dedicated system. These cars move along the road network and help create a fuller open-road environment.

### 4. Garage and car selection

The garage UI presents vehicle specs and styling data, allowing the player to choose a car before driving. Vehicle models are assembled and loaded dynamically from the game’s vehicle data pipeline.

### 5. Camera system

There are multiple camera modes, including:

- chase camera
- hood/POV camera
- far cinematic view

This is managed through per-frame smoothing and dynamic camera adjustments based on speed and steering input.

### 6. Post-processing visual style

The game uses a post-processing stack with:

- Render pass
- Bloom pass
- FXAA pass
- Output pass
- Grade pass
- SSAO when enabled

This helps achieve a stylized neon and atmospheric look with stronger contrast and cinematic color grading.

## Controls

### Keyboard

- W / Up Arrow: accelerate
- S / Down Arrow: brake/reverse
- A / Left Arrow: steer left
- D / Right Arrow: steer right
- Space: handbrake
- Shift: nitro
- M: toggle sound
- Escape: return to menu
- F8: toggle debug overlay

### Touch

On touch devices, an on-screen control set is used to provide throttle, brake, steering, and nitro inputs.

## Run the Game

### Browser / static server

From the project root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

This is the recommended way to run the game locally in a browser.

### Electron desktop app

```bash
npm install
npm run electron
```

This runs the Electron wrapper defined in `electron_main.js`.

### Build desktop package

```bash
npm install
npm run package
```

The packaging configuration is defined in `package.json` and outputs to the `dist` directory.

## Development Notes

This repository mixes a static web app structure with game runtime logic. Most of the core gameplay is implemented in JavaScript modules loaded by the browser.

The main entry point is:

- `src/main.js`

The HTML shell is defined in:

- `index.html`

The main UI styling is in:

- `style.css`

The browser runtime service worker is configured in:

- `sw.js`

## Known Runtime Considerations

- The project expects a browser environment with WebGL support.
- Some assets and world modules may load asynchronously.
- For best results, run through a local HTTP server rather than directly opening the HTML file.
- Mobile performance may vary depending on device capabilities and browser settings.

## Tech Stack

- JavaScript
- HTML5
- CSS
- Three.js
- WebGL
- Electron
- Python tooling for asset conversion and manifest generation

## License

This project is licensed under the MIT license as configured in `package.json`.

## Credits

The game is a stylized arcade prototype inspired by speed-focused, open-road racing games with a clean HUD and cinematic presentation. The codebase includes custom world logic, traffic simulation, and a modular 3D scene pipeline built for experimentation and browser play.

## Troubleshooting

If the game appears stuck on the loading screen:

- confirm the project is being served via HTTP rather than a raw file URL
- verify there are no JavaScript syntax errors in the browser console
- ensure the modules in `src/` are loading correctly
- check whether the browser blocks WebGL, modules, or service workers

## Future Possibilities

Possible direction for expansion includes:

- more cities and unique world themes
- additional race modes and AI difficulty tuning
- more car classes and tuning systems
- deeper track generation and world streaming
- sound and music expansion
- multi-player or online leaderboards

## Quick Start Summary

```bash
python -m http.server 8000
# open http://localhost:8000
```

or:

```bash
npm install
npm run electron
```

## Final Note

APEX: Open Road is structured as a browser-first arcade racing prototype with enough game systems to feel complete while still being easy to expand. It is ideal for experimentation in 3D world design, driving feel, UI workflows, and browser-based game development.
