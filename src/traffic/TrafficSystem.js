import * as THREE from 'three';
import { mergeVehicleParts } from '../vehicles/VehicleMerger.js';
import { TemplateCache } from './TemplateCache.js';

/**
 * TrafficSystem.js — Continuous Spline-Following Traffic Simulation with AABB Collision
 * 
 * - Streams traffic along the canonical -Z road ribbon.
 * - Spawns vehicles strictly 140m–360m ahead of the player.
 * - Recycles vehicles that fall behind or reach route limits.
 * - Applies elastic AABB impulse separation and collision audio on impact.
 */
export class TrafficSystem {
    constructor(game) {
        this.game = game;
        this.vehicles = [];
        this.density = 'normal'; // off, low, normal, high
        this.maxVehicles = 8;
        
        this.modelPool = ['taxi', 'police_car', 'van', 'school_bus'];
        // One merged copy per model type: traffic cars are static bodies, so a
        // clone can share the baked geometry and cost a single draw call.
        this.templates = new TemplateCache();
    }
    
    init() {
        this.setDensity(this.density);
    }

    /**
     * Build and bake one traffic model. VehicleLoader (frozen contract) still
     * creates every cube; merging happens afterwards, outside the loader.
     */
    async _buildTemplate(id) {
        const contract = await this.game.vehicleLoader.createVehicleMesh(id);
        const raw = contract.root || contract;
        mergeVehicleParts(raw, { name: 'traffic_body' });
        return raw;
    }

    /**
     * Bake every traffic model up front (during the loading screen) so the
     * first car of each type does not stall a frame mid-drive.
     * @returns {Promise<number>} number of ready templates
     */
    async prewarm(models = this.modelPool) {
        const ids = [...new Set(models)];
        await Promise.all(ids.map((id) =>
            this.templates.load(id, (key) => this._buildTemplate(key)).catch(() => null)
        ));
        return this.templates.size;
    }
    
    setDensity(density) {
        this.density = density;
        if (density === 'off') this.maxVehicles = 0;
        else if (density === 'low') this.maxVehicles = 5;
        else if (density === 'normal') this.maxVehicles = 9;
        else if (density === 'high') this.maxVehicles = 16;
        
        while (this.vehicles.length > this.maxVehicles) {
            const v = this.vehicles.pop();
            if (v.mesh && this.game.scene) {
                this.game.scene.remove(v.mesh);
            }
        }
    }
    
    async spawnVehicle() {
        const ml = this.game.mapLoader;
        if (!ml || !ml.route || ml.route.empty) return;
        
        const player = this.game.physics;
        const playerZ = player ? player.z : ml.route.zMax - 60;
        
        // Spawn strictly ahead in travel direction (-Z)
        const spawnDist = 140 + Math.random() * 220;
        const spawnZ = playerZ - spawnDist;
        
        // Ensure within track bounds
        if (spawnZ < ml.route.zMin + 20 || spawnZ > ml.route.zMax - 10) return;
        
        // Prevent overlapping spawns
        for (let i = 0; i < this.vehicles.length; i++) {
            if (Math.abs(this.vehicles[i].z - spawnZ) < 25) return;
        }
        
        const bounds = ml.getRoadBounds(spawnZ);
        const halfWidth = (bounds.width || 26) / 2;
        // Two standard lanes: left lane (-halfWidth * 0.45), right lane (+halfWidth * 0.45)
        const laneOffset = (Math.random() > 0.5 ? 1 : -1) * (halfWidth * 0.46);
        const spawnX = bounds.centerX + laneOffset;
        const spawnY = ml.getTrackHeight(spawnX, spawnZ);
        const heading = bounds.heading || ml.route.headingAt(spawnZ) || 0;
        
        const modelId = this.modelPool[Math.floor(Math.random() * this.modelPool.length)];
        
        try {
            let mesh;
            if (this.templates && this._buildTemplate) {
                const template = await this.templates.load(modelId, (id) => this._buildTemplate(id));
                if (!template) return;
                mesh = template.clone(true);
            } else {
                const contract = await this.game.vehicleLoader.createVehicleMesh(modelId);
                mesh = contract.root || contract;
            }
            mesh.position.set(spawnX, spawnY + 0.05, spawnZ);
            mesh.rotation.y = heading;
            
            this.game.scene.add(mesh);
            
            this.vehicles.push({
                mesh: mesh,
                x: spawnX,
                y: spawnY,
                z: spawnZ,
                laneOffset: laneOffset,
                speed: 16 + Math.random() * 10, // ~58 to 94 km/h cruising speed
                heading: heading
            });
        } catch (e) {
            console.warn("Traffic spawn error:", e);
        }
    }
    
    update(delta) {
        if (this.maxVehicles === 0) return;
        const ml = this.game.mapLoader;
        if (!ml || !ml.route) return;
        
        const player = this.game.physics;
        const playerZ = player ? player.z : 0;
        
        // Replenish traffic pool
        if (this.vehicles.length < this.maxVehicles && Math.random() < 0.12) {
            this.spawnVehicle();
        }
        
        for (let i = this.vehicles.length - 1; i >= 0; i--) {
            const v = this.vehicles[i];
            
            // Advance vehicle along canonical travel direction (-Z)
            v.z -= v.speed * delta;
            
            // Recycle vehicles that fall 65m behind player or reach end of route
            if ((player && v.z > playerZ + 65) || v.z < ml.route.zMin + 5) {
                if (this.game.scene) this.game.scene.remove(v.mesh);
                this.vehicles.splice(i, 1);
                continue;
            }
            
            // Continuously conform to road geometry and elevation
            const bounds = ml.getRoadBounds(v.z);
            v.x = bounds.centerX + v.laneOffset;
            v.y = ml.getTrackHeight(v.x, v.z);
            v.heading = bounds.heading || ml.route.headingAt(v.z) || 0;
            
            v.mesh.position.set(v.x, v.y + 0.05, v.z);
            v.mesh.rotation.y = v.heading;
            
            // Physical AABB / Impulse Collision with Player
            if (player) {
                const pdx = player.x - v.x;
                const pdz = player.z - v.z;
                const dist = Math.hypot(pdx, pdz);
                
                if (dist < 3.4) {
                    const overlap = 3.4 - dist;
                    const nx = pdx / (dist || 1);
                    const nz = pdz / (dist || 1);
                    
                    // Physical impulse separation
                    player.x += nx * overlap * 0.75;
                    player.z += nz * overlap * 0.75;
                    
                    player.vx += nx * 14.0;
                    player.vz += nz * 8.0;
                    player.speed = Math.max(0, player.speed * 0.5);
                    
                    // Deflect AI traffic vehicle
                    v.laneOffset = THREE.MathUtils.clamp(v.laneOffset - nx * 0.6, -8, 8);
                    v.speed = Math.max(8, v.speed * 0.65);
                    
                    // Sound & camera impact jolt
                    if (this.game.audioEngine) {
                        this.game.audioEngine.playImpact(Math.min(28, 14 + Math.abs(player.speed) * 0.5));
                    }
                    if (this.game.camera) {
                        this.game.camera.position.x += (Math.random() - 0.5) * 0.35;
                        this.game.camera.position.y += (Math.random() - 0.5) * 0.25;
                    }
                }
            }
        }
    }
}
