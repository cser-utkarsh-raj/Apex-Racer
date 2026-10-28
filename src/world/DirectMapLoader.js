import * as THREE from 'three';

export class DirectMapLoader {
    constructor(game) {
        this.game = game;
        this.worldGroup = new THREE.Group();
        this.worldGroup.name = "direct_map_root";

        // Voxel Engine configuration
        this.voxelScale = 2.0; // Minecraft block = 2 units
        this.chunkSizeBlocks = 64; // Compiler chunks are 64x64 blocks
        this.chunkSizeUnits = this.chunkSizeBlocks * this.voxelScale;

        this.loadedChunks = new Map();
        this.chunkRawData = new Map(); // Store raw voxels for collision
        this.loadingChunks = new Set();
        this.activeChunks = new Map();
        
        this.currentWorldId = 'tazader';

        // Rendering resources
        this.voxelGeo = new THREE.BoxGeometry(this.voxelScale, this.voxelScale, this.voxelScale);
        this.materialCache = new Map();
        this.dummy = new THREE.Object3D();

        this.stats = {
            currentChunkX: 0,
            currentChunkZ: 0,
            loadedChunks: 0,
            totalVoxels: 0,
            sourceMapsUsed: 'Tazader (Direct)'
        };
        
        // Ground plane
        const groundGeo = new THREE.PlaneGeometry(10000, 10000);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x2e422e, roughness: 1.0 });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.position.y = 120; // Minecraft sea level is usually ~63 blocks * 2 = 126. Adjust dynamically later.
        this.ground.receiveShadow = true;
        this.worldGroup.add(this.ground);
    }

    async loadWorld(worldId) {
        this.currentWorldId = worldId || 'tazader';
        
        // Clear previous
        for (const [key, meshGroup] of this.loadedChunks.entries()) {
            this.worldGroup.remove(meshGroup);
        }
        this.loadedChunks.clear();
        this.loadingChunks.clear();
        this.stats.totalVoxels = 0;

        if (this.game.scene) {
            this.game.scene.add(this.worldGroup);
        }
        
        // Force an immediate update
        this.update(0);
    }

    update(delta) {
        if (!this.game.physics) return;
        
        const carX = this.game.physics.x;
        const carZ = this.game.physics.z;
        
        // Calculate chunk coordinates
        // Compiler exports chunk_X_Z where X and Z are in units of 64 blocks
        const chunkX = Math.floor(carX / this.chunkSizeUnits);
        const chunkZ = Math.floor(carZ / this.chunkSizeUnits);
        
        this.stats.currentChunkX = chunkX;
        this.stats.currentChunkZ = chunkZ;

        // Streaming logic: Load a 3x3 grid around player
        const loadRadius = 1;
        const neededChunks = new Set();
        
        for (let dx = -loadRadius; dx <= loadRadius; dx++) {
            for (let dz = -loadRadius; dz <= loadRadius; dz++) {
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
                const chunkKey = `${cx}_${cz}`;
                neededChunks.add(chunkKey);
                
                if (!this.loadedChunks.has(chunkKey) && !this.loadingChunks.has(chunkKey)) {
                    this.loadChunk(cx, cz);
                }
            }
        }
        
        // Unload chunks outside a slightly larger radius to prevent thrashing
        const unloadRadius = 2;
        for (const chunkKey of this.loadedChunks.keys()) {
            const [cx, cz] = chunkKey.split('_').map(Number);
            if (Math.abs(cx - chunkX) > unloadRadius || Math.abs(cz - chunkZ) > unloadRadius) {
                this.unloadChunk(chunkKey);
            }
        }
        
        this.stats.loadedChunks = this.loadedChunks.size;
    }

    async loadChunk(cx, cz) {
        const chunkKey = `${cx}_${cz}`;
        this.loadingChunks.add(chunkKey);
        
        try {
            const res = await fetch(`assets/direct_map/${this.currentWorldId}/chunk_${cx}_${cz}.json`);
            if (!res.ok) {
                this.loadingChunks.delete(chunkKey);
                return; // Chunk might just be empty/air
            }
            
            const data = await res.json();
            const voxels = data.voxels;
            if (!voxels || voxels.length === 0) {
                this.loadingChunks.delete(chunkKey);
                return;
            }

            const chunkGroup = this.renderChunk(voxels);
            chunkGroup.name = chunkKey;
            
            // It's possible the player drove away while we were loading
            if (this.loadingChunks.has(chunkKey)) {
                this.worldGroup.add(chunkGroup);
                this.loadedChunks.set(chunkKey, chunkGroup);
                this.chunkRawData.set(chunkKey, voxels);
                this.loadingChunks.delete(chunkKey);
                this.stats.totalVoxels += voxels.length;
            }
            
        } catch (e) {
            console.warn(`[DirectMapLoader] Failed chunk ${chunkKey}:`, e);
            this.loadingChunks.delete(chunkKey);
        }
    }

    unloadChunk(chunkKey) {
        const chunkGroup = this.loadedChunks.get(chunkKey);
        if (chunkGroup) {
            this.worldGroup.remove(chunkGroup);
            this.loadedChunks.delete(chunkKey);
            this.chunkRawData.delete(chunkKey);
            
            // We shouldn't decrement totalVoxels blindly because we don't store count per group,
            // but for stats it's fine if it's slightly inaccurate or we can store it.
        }
    }

    renderChunk(voxels) {
        const chunkGroup = new THREE.Group();
        const colorGroups = new Map();

        for (const v of voxels) {
            const color = v.c || '#f5f6fa';
            if (!colorGroups.has(color)) {
                colorGroups.set(color, []);
            }
            colorGroups.get(color).push(v);
        }

        for (const [color, voxelList] of colorGroups.entries()) {
            let mat = this.materialCache.get(color);
            if (!mat) {
                mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
                this.materialCache.set(color, mat);
            }

            const instMesh = new THREE.InstancedMesh(this.voxelGeo, mat, voxelList.length);
            instMesh.castShadow = true;
            instMesh.receiveShadow = true;

            for (let i = 0; i < voxelList.length; i++) {
                const v = voxelList[i];
                
                // Original Minecraft coordinates are directly mapped
                const px = v.x * this.voxelScale;
                const py = v.y * this.voxelScale;
                const pz = v.z * this.voxelScale;

                this.dummy.position.set(px, py, pz);
                this.dummy.updateMatrix();
                instMesh.setMatrixAt(i, this.dummy.matrix);
            }

            instMesh.instanceMatrix.needsUpdate = true;
            chunkGroup.add(instMesh);
        }
        
        return chunkGroup;
    }

    getHeight(x, z) {
        // Convert Three.js coordinates to Minecraft block coordinates
        const mx = Math.round(x / this.voxelScale);
        const mz = Math.round(z / this.voxelScale);
        
        // Find which chunk this belongs to
        const cx = Math.floor(mx / this.chunkSizeBlocks);
        const cz = Math.floor(mz / this.chunkSizeBlocks);
        
        const chunkKey = `${cx}_${cz}`;
        const voxels = this.chunkRawData.get(chunkKey);
        
        if (voxels) {
            let maxY = -999;
            for (let i = 0; i < voxels.length; i++) {
                if (voxels[i].x === mx && voxels[i].z === mz) {
                    if (voxels[i].y > maxY) maxY = voxels[i].y;
                }
            }
            if (maxY !== -999) {
                return (maxY * this.voxelScale) + this.voxelScale; // Put wheels on top of the block
            }
        }
        
        // Fallback if chunk not loaded or no blocks at this exact x,z
        return 100;
    }
}
