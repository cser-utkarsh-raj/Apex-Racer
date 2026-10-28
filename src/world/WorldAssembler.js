import * as THREE from 'three';
import { RoadExtruder } from './RoadExtruder.js';

/**
 * WorldAssembler.js — Dynamic Chunk Streaming & Real Asset Compiler
 * Features: Infinite procedural chunk generation, real voxel asset loading, exact footprint road exclusion.
 */
export class WorldAssembler {
    constructor(game) {
        this.game = game;
        this.worldGroup = new THREE.Group();
        this.worldGroup.name = "world_root";
        
        this.roadExtruder = new RoadExtruder();
        this.chunkSize = 250; // 250x250 meter chunks
        this.activeChunks = new Map(); // key: "x,z", value: THREE.Group
        this.moduleManifest = null;
        this.buildingCache = {}; // id -> THREE.Group template
        
        this.lastChunkX = -999;
        this.lastChunkZ = -999;
        
        // Procedural road generation state
        this.roadCursor = { x: 0, z: -100, heading: Math.PI, width: 28, lanes: 4 };
        this.globalRoads = []; // History of generated roads to prevent overlap
        this.roads = this.globalRoads; // Alias for main.js minimap compatibility
        this.events = []; // Empty events list for main.js compatibility
        
        this.materials = {
            ground: new THREE.MeshStandardMaterial({ color: 0x141e12, roughness: 0.95 }),
            fog: new THREE.FogExp2(0x111111, 0.0025)
        };
    }
    
    async loadMap(worldId) {
        console.log("WorldAssembler: Initializing Dynamic Streaming Engine...");
        
        // Load Asset Manifest
        try {
            const res = await fetch('assets/compiled_modules/module_manifest.json');
            this.moduleManifest = await res.json();
            console.log(`Loaded Manifest: ${this.moduleManifest.modules.length} real modules.`);
        } catch (e) {
            console.warn("Could not load module_manifest.json. Falling back to generic boxes.");
        }
        
        if (this.game.scene) {
            this.game.scene.add(this.worldGroup);
            this.game.scene.fog = this.materials.fog;
            this.game.scene.background = new THREE.Color(0x111111);
        }
        
        // Generate initial starting roads
        this.generateNextRoadSegment();
        this.generateNextRoadSegment();
        this.generateNextRoadSegment();
        
        this.updateChunks(0, 0);
    }
    
    // Alias for main.js compatibility
    loadWorld(worldId) {
        return this.loadMap(worldId);
    }
    
    // Terrain height for physics/traffic
    getHeight(x, z) {
        return 0.05;
    }
    
    // Terrain type classification for traffic AI
    getClassification(x, z) {
        return 2; // Asphalt
    }
    
    // HUD Zone name
    getCurrentZoneName(x, z) {
        return "APEX METROPOLIS";
    }
    
    // Generates a logical road segment and advances the cursor
    generateNextRoadSegment() {
        const len = 150 + Math.random() * 200;
        
        // 70% straight, 30% curve
        let newHeading = this.roadCursor.heading;
        if (Math.random() > 0.7) {
            newHeading += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 4 + Math.random() * Math.PI / 4);
        }
        
        const dx = Math.sin(newHeading) * len;
        const dz = Math.cos(newHeading) * len;
        
        const road = {
            id: `road_${this.globalRoads.length}`,
            startX: this.roadCursor.x,
            startZ: this.roadCursor.z,
            endX: this.roadCursor.x + dx,
            endZ: this.roadCursor.z + dz,
            lanes: this.roadCursor.lanes,
            width: this.roadCursor.width,
            surface: 'asphalt'
        };
        
        this.globalRoads.push(road);
        
        this.roadCursor.x = road.endX;
        this.roadCursor.z = road.endZ;
        this.roadCursor.heading = newHeading;
        
        return road;
    }
    
    // Core Streaming Update
    update(delta) {
        if (!this.game.carMesh) return;
        this.updateChunks(this.game.carMesh.position.x, this.game.carMesh.position.z);
    }
    
    updateChunks(playerX, playerZ) {
        const currentChunkX = Math.floor(playerX / this.chunkSize);
        const currentChunkZ = Math.floor(playerZ / this.chunkSize);
        
        if (currentChunkX === this.lastChunkX && currentChunkZ === this.lastChunkZ) return;
        
        this.lastChunkX = currentChunkX;
        this.lastChunkZ = currentChunkZ;
        
        const radius = 2; // 5x5 chunks = 1.25km x 1.25km active area
        const keepChunks = new Set();
        
        // Generate new chunks
        for (let cx = currentChunkX - radius; cx <= currentChunkX + radius; cx++) {
            for (let cz = currentChunkZ - radius; cz <= currentChunkZ + radius; cz++) {
                const key = `${cx},${cz}`;
                keepChunks.add(key);
                
                if (!this.activeChunks.has(key)) {
                    this.buildChunk(cx, cz);
                }
            }
        }
        
        // Unload distant chunks
        for (const [key, chunkGroup] of this.activeChunks.entries()) {
            if (!keepChunks.has(key)) {
                this.worldGroup.remove(chunkGroup);
                // Dispose geometry/materials to free memory
                chunkGroup.traverse(child => {
                    if (child.isMesh) {
                        if (child.geometry) child.geometry.dispose();
                        // Materials are shared, so don't dispose them blindly
                    }
                });
                this.activeChunks.delete(key);
            }
        }
        
        // Check if we need to generate more road ahead
        const distToCursor = Math.hypot(this.roadCursor.x - playerX, this.roadCursor.z - playerZ);
        if (distToCursor < this.chunkSize * 3) {
            this.generateNextRoadSegment();
        }
    }
    
    async buildChunk(cx, cz) {
        const chunkGroup = new THREE.Group();
        chunkGroup.name = `chunk_${cx}_${cz}`;
        
        const chunkWorldX = cx * this.chunkSize + this.chunkSize / 2;
        const chunkWorldZ = cz * this.chunkSize + this.chunkSize / 2;
        
        // 1. Ground Plane
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(this.chunkSize, this.chunkSize).rotateX(-Math.PI / 2),
            this.materials.ground
        );
        ground.position.set(chunkWorldX, -0.1, chunkWorldZ);
        ground.receiveShadow = true;
        chunkGroup.add(ground);
        
        // 2. Find roads that intersect this chunk
        const localRoads = this.globalRoads.filter(road => {
            const minX = Math.min(road.startX, road.endX);
            const maxX = Math.max(road.startX, road.endX);
            const minZ = Math.min(road.startZ, road.endZ);
            const maxZ = Math.max(road.startZ, road.endZ);
            
            // Fast bounding box intersection
            return !(maxX < cx * this.chunkSize || minX > (cx + 1) * this.chunkSize ||
                     maxZ < cz * this.chunkSize || minZ > (cz + 1) * this.chunkSize);
        });
        
        if (localRoads.length > 0) {
            const roadMesh = this.roadExtruder.buildRoadNetwork(localRoads);
            chunkGroup.add(roadMesh);
            
            // 3. Populate REAL Buildings
            for (const road of localRoads) {
                await this.populateRealBuildings(road, chunkGroup, cx, cz);
            }
        }
        
        this.worldGroup.add(chunkGroup);
        this.activeChunks.set(`${cx},${cz}`, chunkGroup);
    }
    
    async populateRealBuildings(road, chunkGroup, cx, cz) {
        const dx = road.endX - road.startX;
        const dz = road.endZ - road.startZ;
        const len = Math.hypot(dx, dz);
        if (len < 40) return;
        
        const dirX = dx / len;
        const dirZ = dz / len;
        const perpX = -dirZ;
        const perpZ = dirX;
        
        const spacing = 60;
        const count = Math.floor(len / spacing);
        
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const rx = road.startX + dx * t;
            const rz = road.startZ + dz * t;
            
            // Only place if the anchor is strictly inside THIS chunk (prevents double placement)
            if (rx < cx * this.chunkSize || rx >= (cx + 1) * this.chunkSize ||
                rz < cz * this.chunkSize || rz >= (cz + 1) * this.chunkSize) {
                continue;
            }
            
            for (const side of [-1, 1]) {
                if (Math.random() > 0.8) continue; // 20% empty lots
                
                // Pick a real module
                const bMesh = await this.getRandomRealBuilding();
                if (!bMesh) continue;
                
                // CRITICAL FOOTPRINT EXCLUSION
                // The building knows its exact width and depth from the JSON.
                const bWidth = bMesh.userData.width || 30;
                const bDepth = bMesh.userData.depth || 30;
                
                // Offset = Half road width + sidewalk clearance + half building depth
                const clearance = 10 + Math.random() * 5;
                const offset = (road.width / 2) + clearance + (bDepth / 2);
                
                const bx = rx + perpX * offset * side;
                const bz = rz + perpZ * offset * side;
                
                const clone = bMesh.clone();
                clone.position.set(bx, 0, bz);
                
                // Face the road
                clone.rotation.y = Math.atan2(dx, dz) + (side === 1 ? Math.PI / 2 : -Math.PI / 2);
                
                chunkGroup.add(clone);
            }
        }
    }
    
    async getRandomRealBuilding() {
        if (!this.moduleManifest || !this.moduleManifest.modules || this.moduleManifest.modules.length === 0) {
            return this.createFallbackBox();
        }
        
        const modDef = this.moduleManifest.modules[Math.floor(Math.random() * this.moduleManifest.modules.length)];
        
        if (this.buildingCache[modDef.id]) {
            return this.buildingCache[modDef.id];
        }
        
        try {
            const res = await fetch(modDef.file);
            const data = await res.json();
            
            const group = new THREE.Group();
            group.userData.width = data.width || 20;
            group.userData.depth = data.depth || 20;
            group.userData.height = data.height || 50;
            
            if (data.voxels && data.voxels.length > 0) {
                // InstancedMesh for extreme performance rendering voxels
                const geo = new THREE.BoxGeometry(1, 1, 1);
                
                // Group voxels by color to minimize draw calls
                const colorMap = {};
                for (const v of data.voxels) {
                    if (!colorMap[v.color]) colorMap[v.color] = [];
                    colorMap[v.color].push(v);
                }
                
                for (const [colorHex, voxels] of Object.entries(colorMap)) {
                    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
                    const instMesh = new THREE.InstancedMesh(geo, mat, voxels.length);
                    instMesh.castShadow = true;
                    instMesh.receiveShadow = true;
                    
                    const dummy = new THREE.Object3D();
                    voxels.forEach((v, idx) => {
                        // Center the building around 0,0
                        dummy.position.set(
                            v.rel_x - group.userData.width / 2,
                            v.rel_y + 0.5,
                            v.rel_z - group.userData.depth / 2
                        );
                        dummy.updateMatrix();
                        instMesh.setMatrixAt(idx, dummy.matrix);
                    });
                    group.add(instMesh);
                }
            }
            
            this.buildingCache[modDef.id] = group;
            return group;
            
        } catch (e) {
            console.warn("Failed to load real module", modDef.id, e);
            return this.createFallbackBox();
        }
    }
    
    createFallbackBox() {
        const w = 15 + Math.random() * 10;
        const h = 40 + Math.random() * 40;
        const d = 15 + Math.random() * 10;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({ color: 0x34495e })
        );
        mesh.position.y = h / 2;
        mesh.userData = { width: w, depth: d, height: h };
        return mesh;
    }
}
