import * as THREE from 'three';
import { mergeVehicleParts } from '../vehicles/VehicleMerger.js';
import { TemplateCache } from './TemplateCache.js';

/**
 * TrafficSystem.js — Canonical Multi-Vehicle Traffic Engine
 * 
 * CONTRACT:
 * - All AI vehicles share the exact same canonical -Z forward orientation.
 * - Heading is strictly `angle = Math.atan2(-dx, -dz)` so the visual front faces down the lane.
 */
export class TrafficSystem {
    constructor(game) {
        this.game = game;
        this.vehicles = [];
        this.density = 'normal'; // low, normal, high
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
        else if (density === 'low') this.maxVehicles = 4;
        else if (density === 'normal') this.maxVehicles = 8;
        else if (density === 'high') this.maxVehicles = 14;
        
        while (this.vehicles.length > this.maxVehicles) {
            const v = this.vehicles.pop();
            if (v.mesh && this.game.scene) {
                this.game.scene.remove(v.mesh);
            }
        }
    }
    
    async spawnVehicle() {
        if (!this.game.mapLoader || !this.game.mapLoader.roads || this.game.mapLoader.roads.length === 0) return;
        
        const allRoads = this.game.mapLoader.roads;
        // Prefer segments around the player: spawning on a random 3 km-away
        // piece of road means the player never actually sees traffic.
        const playerZ = this.game.physics ? this.game.physics.z : allRoads[0].startZ;
        const nearby = allRoads.filter(r => {
            const cz = (r.startZ + r.endZ) / 2;
            const d = Math.abs(cz - playerZ);
            return d > 30 && d < 480;
        });
        const roads = nearby.length ? nearby : allRoads;
        const road = roads[Math.floor(Math.random() * roads.length)];
        const modelId = this.modelPool[Math.floor(Math.random() * this.modelPool.length)];
        
        const dx = road.endX - road.startX;
        const dz = road.endZ - road.startZ;
        const len = Math.hypot(dx, dz);
        if (len < 10) return;
        
        // Canonical heading so -Z points along (dx, dz)
        const angle = Math.atan2(-dx, -dz);
        const laneOffset = (Math.random() > 0.5 ? 1 : -1) * (road.width / 4);
        const nx = -dz / len;
        const nz = dx / len;
        
        const t = Math.random();
        const startX = road.startX + dx * t + nx * laneOffset;
        const startZ = road.startZ + dz * t + nz * laneOffset;
        
        try {
            // Build + bake each model once; later spawns only clone it. This
            // also skips the loader's per-call material/texture allocation.
            const template = await this.templates.load(modelId, (id) => this._buildTemplate(id));
            if (!template) return;

            // Geometry + material are shared between clones.
            const mesh = template.clone(true);
            const spawnY = this.game.mapLoader && this.game.mapLoader.getHeight
                ? this.game.mapLoader.getHeight(startX, startZ)
                : 0.05;
            mesh.position.set(startX, spawnY + 0.05, startZ);
            mesh.rotation.y = angle;
            
            this.game.scene.add(mesh);
            
            this.vehicles.push({
                mesh: mesh,
                road: road,
                t: t,
                speed: 15 + Math.random() * 12, // 50 to 90 km/h
                laneOffset: laneOffset,
                nx: nx,
                nz: nz,
                dx: dx,
                dz: dz,
                len: len,
                angle: angle
            });
        } catch (e) {
            console.warn("Traffic spawn error:", e);
        }
    }
    
    update(delta) {
        if (this.maxVehicles === 0) return;
        
        // Maintain target count
        if (this.vehicles.length < this.maxVehicles && Math.random() < 0.08) {
            this.spawnVehicle();
        }
        
        for (let i = this.vehicles.length - 1; i >= 0; i--) {
            const v = this.vehicles[i];
            
            // Recycle cars that are far away so the pool stays local.
            if (this.game.physics) {
                const far = Math.abs(v.mesh.position.z - this.game.physics.z);
                if (far > 800) {
                    if (this.game.scene) this.game.scene.remove(v.mesh);
                    this.vehicles.splice(i, 1);
                    continue;
                }
            }
            
            v.t += (v.speed / v.len) * delta;
            
            if (v.t >= 1.0) {
                // Loop back to road start
                v.t = 0.0;
            }
            
            const curX = v.road.startX + v.dx * v.t + v.nx * v.laneOffset;
            const curZ = v.road.startZ + v.dz * v.t + v.nz * v.laneOffset;
            
            const curY = this.game.mapLoader && this.game.mapLoader.getHeight
                ? this.game.mapLoader.getHeight(curX, curZ)
                : 0.05;
            v.mesh.position.set(curX, curY + 0.05, curZ);
            v.mesh.rotation.y = v.angle;
            
            // Check player collision
            if (this.game.physics) {
                const pdx = this.game.physics.x - curX;
                const pdz = this.game.physics.z - curZ;
                const dist = Math.hypot(pdx, pdz);
                
                if (dist < 3.2) {
                    this.game.physics.speed *= 0.6;
                    if (this.game.audioEngine) {
                        this.game.audioEngine.playImpact(20);
                    }
                }
            }
        }
    }
}
