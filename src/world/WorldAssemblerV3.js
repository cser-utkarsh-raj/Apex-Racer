import * as THREE from 'three';
import { RealMap } from './RealMap.js';
import { buildTileGeometry } from './RealMapGeometry.js';
import {
    buildGuardrailGeometry,
    buildRoadGeometry,
    buildStreetlights
} from './TrackBuilder.js';
import { buildSkyDome } from './SkyDome.js';
import { resolveWorldStyle } from './WorldStyles.js';

/**
 * WorldAssemblerV3 — APEX real-map world engine.
 *
 * The four worlds are baked offline from the actual Minecraft Java saves in
 * `tools/mc-bake` (real block heights + real top-block colours -> binary
 * tiles). At runtime this class streams those tiles around the player, carves
 * a race corridor through them and adds the road furniture.
 *
 * Public contract used by the frozen vehicle pipeline:
 *   loadWorld(id)              -> Promise
 *   update(delta, playerZ)     -> stream tiles, clamp guardrails
 *   getHeight(x, z)            -> float (alias of getTrackHeight)
 *   getTrackHeight(x, z)       -> float
 *   getRoadBounds(z)           -> { centerX, leftX, rightX, width, y, heading }
 *   buildings                  -> [{ x, z, r_x, r_z }] consumed by VehiclePhysics
 *   roads                      -> [{ startX, startZ, endX, endZ, width }] for minimap
 *   events                     -> race checkpoint definitions
 */
export class WorldAssemblerV3 {
    constructor(game) {
        this.game = game;

        this.worldGroup = new THREE.Group();
        this.worldGroup.name = 'world_v3_root';

        this.roads = [];
        this.buildings = [];
        this.events = [];
        this.activeChunks = new Map();   // legacy name: one entry per streamed tile
        this.activeTiles = this.activeChunks;

        this.chunkLength = 256;
        this.chunkSize = 256;
        this.viewAhead = 560;
        this.keepBehind = 240;

        this.currentWorldId = 'neo_tazader';
        this.style = resolveWorldStyle('neo_tazader');
        this.biome = this.style;         // legacy alias
        this.map = null;
        this.route = null;
        this.manifest = null;

        this._loadToken = 0;
        this._lastRange = null;
        this._range = null;
        this._spawnZ = 0;
        this._impactCooldown = 0;
        this._time = 0;
        this._water = null;
        this._sky = null;
        this._tileQueue = [];
        this._tileRequests = new Set();
        this.streetlightCount = 0;
        this.bloomStrength = 1.0;

        this.stats = {
            currentChunk: 0,
            loadedChunks: 0,
            roadModules: 0,
            buildings: 0,
            trafficProps: 0,
            vegetation: 0,
            sourceMapsUsed: '-',
            drawCalls: 0,
            propInstances: 0,
            tileBytes: 0
        };

        this.solidMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.82,
            metalness: 0.05
        });
        this.terrainMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.97,
            metalness: 0.02,
            side: THREE.FrontSide,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
        this.roadMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.86,
            metalness: 0.08,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2
        });
        this.railMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.58,
            metalness: 0.12,
            side: THREE.DoubleSide
        });
        this.glowMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            fog: true
        });
        this.lampMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            toneMapped: false,
            side: THREE.DoubleSide
        });
        this.poolMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            toneMapped: false,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: true,
            side: THREE.DoubleSide
        });
        this.waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x1d6f86,
            roughness: 0.18,
            metalness: 0.35,
            transparent: true,
            opacity: 0.88
        });
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    async loadWorld(worldId = 'neo_tazader') {
        const token = ++this._loadToken;
        const style = resolveWorldStyle(worldId);

        // Load the manifest before tearing down the current world so a missing
        // bake never leaves the player in an empty void.
        let map = null;
        try {
            map = await RealMap.load(style.id, { baseUrl: `assets/worlds/${style.id}` });
        } catch (error) {
            console.warn(`[WorldAssemblerV3] Could not load baked world "${style.id}":`, error.message);
            return false;
        }
        if (token !== this._loadToken) return false;
        if (map.route.empty) {
            console.warn(`[WorldAssemblerV3] World "${style.id}" has no baked route.`);
            return false;
        }

        this.style = style;
        this.biome = style;
        this.map = map;
        this.manifest = map.manifest;
        this.route = map.route;
        this.currentWorldId = style.id;
        if (this.game) this.game.currentWorldId = style.id;

        this._clearWorld();
        if (this.game && this.game.scene) {
            this.game.scene.add(this.worldGroup);
        }

        this._applyEnvironment();
        this._buildSky();
        this._buildRoadFurniture();
        this._buildWater();
        this._buildEvents();
        this._buildCollision();

        this._spawnZ = this.route.zMax - Math.min(60, (this.route.zMax - this.route.zMin) * 0.04);
        const spawn = this.getSpawnPoint();

        this.stats.sourceMapsUsed = `${this.manifest.label} · ${this.manifest.source}`;
        this.stats.roadModules = this.roads.length;
        this.stats.buildings = this.buildings.length;
        this.stats.trafficProps = this.streetlightCount;
        this.stats.propInstances = this.streetlightCount;

        // First ring is awaited while the loading screen is still visible.
        await this._preloadTiles(spawn.z, token);
        if (token !== this._loadToken) return false;

        const player = this.game ? this.game.physics : null;
        if (player && Number.isFinite(player.z) && Math.abs(player.z) < 2000) {
            player.x = spawn.x;
            player.y = spawn.y;
            player.z = spawn.z;
            player.angle = spawn.angle;
        }

        console.log(
            `[WorldAssemblerV3] ${style.label}: ${this.stats.loadedChunks} tiles, ` +
            `route ${this.route.length.toFixed(0)} m, ${this.buildings.length} collision volumes.`
        );
        return true;
    }

    _applyEnvironment() {
        const g = this.game;
        const s = this.style;
        if (!g) return;

        if (g.scene) {
            g.scene.background = new THREE.Color(s.sky.horizon);
            g.scene.fog = new THREE.FogExp2(s.fog.color, s.fog.density);
        }

        if (g.hemiLight) {
            g.hemiLight.color.setHex(s.hemi.sky);
            g.hemiLight.groundColor.setHex(s.hemi.ground);
            g.hemiLight.intensity = s.hemi.intensity;
        }

        if (g.sunLight) {
            g.sunLight.color.setHex(s.sun.color);
            g.sunLight.intensity = s.sun.intensity;
            g.sunLight.position.set(...s.sun.position);
        }

        if (g.renderer) {
            g.renderer.toneMappingExposure = s.exposure;
        }

        if (g.bloomPass) {
            g.bloomPass.threshold = s.bloom.threshold;
            g.bloomPass.strength = s.bloom.strength;
            g.bloomPass.radius = s.bloom.radius;
        }
        this.bloomStrength = s.bloom.strength;

        this.waterMaterial.color.setHex(s.water.color);
        this.waterMaterial.opacity = s.water.opacity;
    }

    _buildSky() {
        this._sky = buildSkyDome(this.style);
        this.worldGroup.add(this._sky.group);
    }

    _buildRoadFurniture() {
        const road = new THREE.Mesh(buildRoadGeometry(this.route, this.style), this.roadMaterial);
        road.name = 'race_ribbon';
        road.receiveShadow = true;
        road.frustumCulled = false;
        this.worldGroup.add(road);

        const rails = new THREE.Mesh(buildGuardrailGeometry(this.route, this.style), this.railMaterial);
        rails.name = 'guardrails';
        rails.frustumCulled = false;
        this.worldGroup.add(rails);

        const lights = buildStreetlights(this.route, this.style);
        this.streetlightCount = Math.max(0, Math.floor((this.route.length / this.style.road.streetlightSpacing)));

        const poles = new THREE.Mesh(lights.poles, this.solidMaterial);
        poles.name = 'streetlight_poles';
        poles.frustumCulled = false;
        this.worldGroup.add(poles);

        const lamps = new THREE.Mesh(lights.lamps, this.lampMaterial);
        lamps.name = 'streetlight_lamps';
        lamps.frustumCulled = false;
        this.worldGroup.add(lamps);

        if (lights.pools) {
            const pools = new THREE.Mesh(lights.pools, this.poolMaterial);
            pools.name = 'streetlight_pools';
            pools.frustumCulled = false;
            pools.renderOrder = 2;
            this.worldGroup.add(pools);
        }
    }

    _buildWater() {
        this._water = null;
        const level = this.manifest.waterLevel;
        if (level === null || level === undefined) return;

        // Only draw a global plane when the water table is genuinely below the
        // race surface (lakes / sea). Pools inside the city are already baked.
        const routeMinY = this.route.points.reduce((m, p) => Math.min(m, p.y), Infinity);
        if (!(level < routeMinY - 1.5)) return;

        const geometry = new THREE.PlaneGeometry(6000, 6000, 1, 1);
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, this.waterMaterial);
        mesh.position.set(this.route.xAt(this._spawnZ), level, this._spawnZ);
        mesh.receiveShadow = true;
        mesh.name = 'water_plane';
        this.worldGroup.add(mesh);
        this._water = mesh;
    }

    _buildEvents() {
        const style = this.style;
        const span = this.route.zMax - this.route.zMin;
        const checkpoints = [];
        const count = 8;

        for (let i = 1; i <= count; i++) {
            const z = this.route.zMax - span * (i / (count + 1));
            const bounds = this.getRoadBounds(z);
            checkpoints.push({
                x: bounds.centerX,
                z,
                radius: Math.max(16, bounds.width / 2 + 6)
            });
        }

        this.events = [{
            id: `${style.id}_circuit`,
            name: style.raceName,
            laps: 2,
            rewardCash: 22000 + checkpoints.length * 2500,
            rewardRep: 350 + checkpoints.length * 40,
            checkpoints
        }];
    }

    _buildCollision() {
        this.roads = this.route.segments(this.style.road.width, this.route.zMin, this.route.zMax, 96);

        const half = this.style.road.width / 2;
        const buildings = [];
        for (const o of this.manifest.obstacles || []) {
            const c = this.route.atZ(o.z);
            const side = Math.sign(o.x - c.x) || 1;
            // Real buildings may be baked right up to the asphalt. Push the
            // collision box out to the kerb so the player never hits an
            // invisible wall in the middle of the lane.
            const nearest = Math.abs(o.x - c.x) - o.rx;
            let x = o.x;
            if (nearest < half + 1.4) {
                x += side * ((half + 1.4) - nearest);
            }
            buildings.push({
                x,
                z: o.z,
                r_x: Math.max(1, o.rx),
                r_z: Math.max(1, o.rz)
            });
        }
        this.buildings = buildings;
    }

    /* ------------------------------------------------------------------ */
    /* Tile streaming                                                     */
    /* ------------------------------------------------------------------ */

    _rangeFor(playerZ) {
        const t = this.map.tileMeters;
        const m = this.manifest;
        const tzMin = Math.max(0, Math.floor((playerZ - this.viewAhead - m.origin.z) / t));
        const tzMax = Math.min(m.tiles.z - 1, Math.floor((playerZ + this.keepBehind - m.origin.z) / t));
        return { tzMin, tzMax };
    }

    _inRange(tz) {
        return !!this._range && tz >= this._range.tzMin && tz <= this._range.tzMax;
    }

    async _preloadTiles(playerZ, token) {
        this._range = this._rangeFor(playerZ);
        const { tzMin, tzMax } = this._range;
        const m = this.manifest;
        const jobs = [];

        for (let tz = tzMin; tz <= tzMax; tz++) {
            for (let tx = 0; tx < m.tiles.x; tx++) {
                const key = `${tx},${tz}`;
                if (this.activeTiles.has(key)) continue;
                jobs.push(
                    this.map.ensureTile(tx, tz)
                        .then(tile => {
                            if (token !== this._loadToken) return;
                            this._buildTileMesh(tx, tz, tile);
                        })
                        .catch(() => {})
                );
            }
        }

        await Promise.all(jobs);
        this._refreshStats();
    }

    syncChunks(playerZ, force = false) {
        if (!Number.isFinite(playerZ) || !this.map) return false;

        const next = this._rangeFor(playerZ);
        const key = `${next.tzMin}:${next.tzMax}`;
        this._range = next;

        if (force || key !== this._lastRange) {
            this._lastRange = key;
            const m = this.manifest;
            for (let tz = next.tzMin; tz <= next.tzMax; tz++) {
                for (let tx = 0; tx < m.tiles.x; tx++) {
                    this._requestTile(tx, tz);
                }
            }
            for (const [tileKey, entry] of this.activeTiles) {
                if (entry.tz < next.tzMin || entry.tz > next.tzMax) {
                    this._releaseTile(tileKey, entry);
                }
            }
            // Drop queued jobs that are no longer in range.
            this._tileQueue = this._tileQueue.filter(job => this._inRange(job.tz));
        }

        this._flushTileQueue();
        this._refreshStats();
        return true;
    }

    _requestTile(tx, tz) {
        const key = `${tx},${tz}`;
        if (this.activeTiles.has(key) || this._tileRequests.has(key)) return;
        this._tileRequests.add(key);

        this.map.ensureTile(tx, tz)
            .then(tile => {
                if (!this.map) return;
                this._tileQueue.push({ tx, tz, tile, key });
                this._flushTileQueue();
            })
            .catch(() => {})
            .finally(() => this._tileRequests.delete(key));
    }

    _flushTileQueue(limit = 2) {
        let built = 0;
        while (this._tileQueue.length > 0 && built < limit) {
            const job = this._tileQueue.shift();
            if (this.activeTiles.has(job.key) || !this._inRange(job.tz)) continue;
            this._buildTileMesh(job.tx, job.tz, job.tile);
            built++;
        }
    }

    _buildTileMesh(tx, tz, tile) {
        const key = `${tx},${tz}`;
        if (this.activeTiles.has(key)) return;

        const { litGeometry, glowGeometry, ox, oz } = buildTileGeometry(tile, {
            manifest: this.manifest,
            route: this.route,
            tx,
            tz,
            palette: this.map.palette,
            road: this.style.road,
            windows: this.style.windows.enabled,
            windowColors: this.style.windows.colors,
            night: !!this.style.night
        });

        const group = new THREE.Group();
        group.name = `tile_${tx}_${tz}`;
        // Tile geometry is authored in tile-local space.
        group.position.set(ox, 0, oz);

        if (litGeometry.attributes.position.count > 0) {
            const lit = new THREE.Mesh(litGeometry, this.terrainMaterial);
            lit.name = 'terrain';
            lit.receiveShadow = true;
            group.add(lit);
        } else {
            litGeometry.dispose();
        }

        if (glowGeometry && glowGeometry.attributes.position.count > 0) {
            const glow = new THREE.Mesh(glowGeometry, this.glowMaterial);
            glow.name = 'windows';
            group.add(glow);
        } else if (glowGeometry) {
            glowGeometry.dispose();
        }

        group.userData = { tx, tz, buildings: 0 };
        this.worldGroup.add(group);
        this.activeTiles.set(key, { tx, tz, group });
    }

    _releaseTile(key, entry) {
        if (entry.group) {
            this.worldGroup.remove(entry.group);
            this._disposeObject(entry.group);
        }
        this.activeTiles.delete(key);
    }

    _disposeObject(object) {
        object.traverse(child => {
            if (child.isInstancedMesh && typeof child.dispose === 'function') {
                child.dispose();
            }
            if (child.geometry) child.geometry.dispose();
        });
    }

    _clearWorld() {
        for (const [key, entry] of this.activeTiles) {
            if (entry.group) {
                this.worldGroup.remove(entry.group);
                this._disposeObject(entry.group);
            }
            this.activeTiles.delete(key);
        }

        while (this.worldGroup.children.length > 0) {
            const child = this.worldGroup.children[0];
            this.worldGroup.remove(child);
            this._disposeObject(child);
        }

        if (this._sky) {
            this._sky.dispose();
            this._sky = null;
        }

        this._water = null;
        this._tileQueue.length = 0;
        this._tileRequests.clear();
        this.roads = [];
        this.buildings = [];
        this.events = [];
        this._lastRange = null;
        this._range = null;
        this._impactCooldown = 0;
        this.streetlightCount = 0;
    }

    _refreshStats() {
        this.stats.loadedChunks = this.activeTiles.size;
        this.stats.roadModules = this.roads.length;
        this.stats.buildings = this.buildings.length;
        this.stats.trafficProps = this.streetlightCount;
        this.stats.propInstances = this.streetlightCount;
        this.stats.tileBytes = this.map ? this.map.loadedBytes : 0;
    }

    /* ------------------------------------------------------------------ */
    /* Frame update + collisions                                          */
    /* ------------------------------------------------------------------ */

    update(delta = 0, carZ = null) {
        let playerZ = Number.isFinite(carZ) ? carZ : null;
        let dt = (Number.isFinite(delta) && delta > 0 && delta < 0.2) ? delta : 0.016;

        // Supports both world.update(delta, z) and world.update(car.position.z).
        if (playerZ === null) {
            if (Number.isFinite(delta) && Math.abs(delta) > 1.5) {
                playerZ = delta;
                dt = 0.016;
            } else {
                playerZ = this.game && this.game.physics
                    ? this.game.physics.z
                    : (this.game && this.game.carMesh ? this.game.carMesh.position.z : this._spawnZ);
            }
        }

        this._time += dt;
        this._impactCooldown = Math.max(0, this._impactCooldown - dt);

        if (Number.isFinite(playerZ)) {
            this.syncChunks(playerZ);
            this.stats.currentChunk = Math.floor(playerZ / this.chunkLength);
        } else {
            this._flushTileQueue();
        }

        this._resolveGuardrails();
        this._resolveTrackEnds();

        if (this._sky && this.game && this.game.camera) {
            this._sky.update(this.game.camera);
        }

        if (this._water) {
            const z = Number.isFinite(playerZ) ? playerZ : this._spawnZ;
            this._water.position.x = this.route.xAt(z);
            this._water.position.z = z;
        }

        if (this.game && this.game.renderer && this.game.renderer.info) {
            // The game loop overwrites this with the post-composer total; this
            // keeps the value meaningful if the world is updated on its own.
            this.stats.drawCalls = this.game.renderer.info.render.calls;
        }
    }

    _resolveGuardrails() {
        const physics = this.game ? this.game.physics : null;
        if (!physics || !this.route) return;

        const bounds = this.getRoadBounds(physics.z);
        const limit = bounds.width / 2 + this.style.road.shoulder - 1.05;
        const lateral = physics.x - bounds.centerX;

        if (Math.abs(lateral) <= limit) return;

        const side = Math.sign(lateral) || 1;
        physics.x = bounds.centerX + side * limit;
        physics.y = this.getTrackHeight(physics.x, physics.z);

        const s = this.route.atZ(physics.z);
        const len = Math.hypot(s.dx, 1);
        const nx = 1 / len;
        const nz = -s.dx / len;
        const vn = physics.vx * nx + physics.vz * nz;

        // Elastic response along the rail normal.
        if (vn * side > 0) {
            physics.vx -= 1.7 * vn * nx;
            physics.vz -= 1.7 * vn * nz;
            physics.speed *= 0.55;
        }

        if (this._impactCooldown <= 0 && Math.abs(physics.speed) > 4) {
            this._impactCooldown = 0.35;
            if (this.game.audioEngine && typeof this.game.audioEngine.playImpact === 'function') {
                this.game.audioEngine.playImpact(12);
            }
        }
    }

    _resolveTrackEnds() {
        const physics = this.game ? this.game.physics : null;
        if (!physics || !this.route) return;

        const zMax = this.route.zMax - 4;
        const zMin = this.route.zMin + 4;

        if (physics.z > zMax) {
            physics.z = zMax;
            physics.vz = Math.min(0, physics.vz);
            if (physics.speed < 0) physics.speed = 0;
            physics.y = this.getTrackHeight(physics.x, physics.z);
        } else if (physics.z < zMin) {
            // Seamless Highway Loop: Wrap continuously back to track start!
            const lateralOffset = physics.x - this.getRoadBounds(physics.z).centerX;
            const newZ = this.route.zMax - 18;
            const newBounds = this.getRoadBounds(newZ);

            physics.z = newZ;
            physics.x = newBounds.centerX + lateralOffset;
            physics.y = this.getTrackHeight(physics.x, physics.z);
            physics.angle = this.route.headingAt(newZ);

            if (this.game) {
                if (this.game.carMesh) {
                    this.game.carMesh.position.set(physics.x, physics.y, physics.z);
                    this.game.carMesh.rotation.y = physics.angle;
                }
                if (typeof this.game.snapCamera === 'function') {
                    this.game.snapCamera();
                }
                if (typeof this.game.showLapBanner === 'function') {
                    this.game.showLapBanner();
                }
            }
        }

        const lat = physics.x - this.getRoadBounds(physics.z).centerX;
        const hard = this.style.road.width / 2 + this.style.road.shoulder + 5;
        if (Math.abs(lat) > hard) {
            physics.x = this.getRoadBounds(physics.z).centerX + Math.sign(lat) * hard;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Synchronous world queries                                          */
    /* ------------------------------------------------------------------ */

    getRoadBounds(z) {
        if (!this.route) {
            return {
                centerX: 0, leftX: -13, rightX: 13, width: 26, halfWidth: 13,
                y: 0, heading: 0, nx: 1, nz: 0, minX: -13, maxX: 13
            };
        }
        const b = this.route.bounds(z, this.style.road.width);
        b.leftX = b.minX;
        b.rightX = b.maxX;
        b.x = b.centerX;
        return b;
    }

    getTrackHeight(x, z) {
        if (!this.route) return 0.05;
        const bounds = this.getRoadBounds(z);
        const road = this.style.road;
        const lateral = Math.abs(x - bounds.centerX);
        const half = road.width / 2;

        if (lateral <= half) return bounds.y + 0.02;
        if (lateral <= half + road.shoulder) return bounds.y + 0.04;
        if (lateral <= half + road.shoulder + road.sidewalk) return bounds.y + 0.18;

        if (this.map) {
            const h = this.map.heightAt(x, z);
            if (h !== null && h > -32768) {
                // Keep off-road sampling sane: never launch the car off a roof
                // or drop it through a canal while guardrails are being crossed.
                return Math.min(bounds.y + 6, Math.max(bounds.y - 4, h + 0.05));
            }
        }
        return bounds.y + 0.02;
    }

    /** Frozen VehiclePhysics calls this every frame. */
    getHeight(x, z) {
        return this.getTrackHeight(x, z);
    }

    getClassification(x, z) {
        const bounds = this.getRoadBounds(z);
        return Math.abs(x - bounds.centerX) <= bounds.width / 2 ? 2 : 1;
    }

    getCurrentZoneName() {
        return this.style.label;
    }

    getRoadHeight(z) {
        return this.route ? this.route.yAt(z) : 0;
    }

    getSpawnPoint() {
        if (!this.route) return { x: 0, y: 0.05, z: 0, angle: 0 };
        const z = this.route.zMax - Math.min(60, (this.route.zMax - this.route.zMin) * 0.04);
        const bounds = this.getRoadBounds(z);
        return {
            x: bounds.centerX,
            y: this.getTrackHeight(bounds.centerX, z),
            z,
            angle: this.route.headingAt(z)
        };
    }
}
