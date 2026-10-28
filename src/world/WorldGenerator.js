/**
 * WorldGenerator.js — APEX Deterministic Seeded World Engine
 * 
 * Pure mathematical world topology provider (ZERO Three.js dependencies):
 * - Curated Minecraft Archetypes: Tazader (Downtown), Nantwich (Suburbs/Farms), Chiang Tung (Mountains), Curitiba (Plazas)
 * - Exact 10 km x 10 km coordinate space (-5000 to +5000)
 * - 8 km x 8 km Outer Highway Circuit (32 km perimeter drive)
 * - Direct (startX, startZ) Chunk Data Provider API: getChunkData(seed, startX, startZ, chunkSize)
 */

export class WorldGenerator {
    constructor(seed = 847291) {
        this.seed = seed;
        this.worldSize = 10000;
        this.bounds = { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 };
        this.roadGraph = [];
        this.initMacroRoadGraph();
    }
    
    setSeed(seed) {
        this.seed = seed;
        this.initMacroRoadGraph();
    }
    
    prng(seedVal) {
        let s = (seedVal ^ 0x6D2B79F5) >>> 0;
        return function() {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    
    hash2D(x, z, seedOffset = 0) {
        const n = Math.sin(x * 12.9898 + z * 78.233 + (this.seed + seedOffset) * 0.1337) * 43758.5453;
        return n - Math.floor(n);
    }
    
    smoothNoise2D(x, z, scale, seedOffset = 0) {
        const nx = x * scale;
        const nz = z * scale;
        const ix = Math.floor(nx);
        const iz = Math.floor(nz);
        const fx = nx - ix;
        const fz = nz - iz;
        
        const ux = fx * fx * (3.0 - 2.0 * fx);
        const uz = fz * fz * (3.0 - 2.0 * fz);
        
        const n00 = this.hash2D(ix, iz, seedOffset);
        const n10 = this.hash2D(ix + 1, iz, seedOffset);
        const n01 = this.hash2D(ix, iz + 1, seedOffset);
        const n11 = this.hash2D(ix + 1, iz + 1, seedOffset);
        
        const nx0 = n00 * (1.0 - ux) + n10 * ux;
        const nx1 = n01 * (1.0 - ux) + n11 * ux;
        return nx0 * (1.0 - uz) + nx1 * uz;
    }
    
    octaveNoise2D(x, z, octaves = 3, persistence = 0.5, scale = 0.001, seedOffset = 0) {
        let total = 0;
        let frequency = scale;
        let amplitude = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            total += this.smoothNoise2D(x, z, frequency, seedOffset + i * 7919) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }
    
    initMacroRoadGraph() {
        this.roadGraph = [
            // 1. 8 km x 8 km Outer Highway Circuit (Total 32 km loop)
            { id: "hw_north", name: "Alpine Highway Loop North", type: "highway", startX: -4000, startZ: -4000, endX: 4000, endZ: -4000, width: 18.0, lanes: 4 },
            { id: "hw_east",  name: "Eastern Highway Loop",      type: "highway", startX: 4000,  startZ: -4000, endX: 4000, endZ: 4000,  width: 18.0, lanes: 4 },
            { id: "hw_south", name: "Ocean Highway Loop South",  type: "highway", startX: 4000,  startZ: 4000,  endX: -4000, endZ: 4000, width: 18.0, lanes: 4 },
            { id: "hw_west",  name: "Farmland Highway Loop West",type: "highway", startX: -4000, startZ: 4000,  endX: -4000, endZ: -4000, width: 18.0, lanes: 4 },
            
            // 2. Central Inter-City Arterials (Intersecting at Downtown 0, 0)
            { id: "art_ns_main", name: "Grand Continental Avenue",  type: "arterial", startX: 0, startZ: -4000, endX: 0, endZ: 4000, width: 16.0, lanes: 4 },
            { id: "art_ew_main", name: "Metropolitan Boulevard",   type: "arterial", startX: -4000, startZ: 0, endX: 4000, endZ: 0, width: 16.0, lanes: 4 },
            
            // 3. Suburb & District Interconnections
            { id: "art_sub_n", name: "Northern Suburbs Parkway",   type: "arterial", startX: -3000, startZ: -1800, endX: 3000, endZ: -1800, width: 12.0, lanes: 2 },
            { id: "art_sub_s", name: "Industrial Coastline Way",   type: "arterial", startX: -3000, startZ: 2200,  endX: 3000, endZ: 2200,  width: 12.0, lanes: 2 },
            { id: "art_sub_w", name: "Pine Valley Connector",      type: "arterial", startX: -2000, startZ: -3500, endX: -2000, endZ: 3500, width: 12.0, lanes: 2 },
            { id: "art_sub_e", name: "Eastern Marina Parkway",     type: "arterial", startX: 2000,  startZ: -3500, endX: 2000,  endZ: 3500, width: 12.0, lanes: 2 },
            
            // 4. Northern Mountain Touge Pass (Chiang Tung style alpine ridge)
            { id: "touge_1", name: "Chiang Tung Touge Pass (Stage 1)", type: "mountain_pass", startX: -2000, startZ: -3500, endX: -1000, endZ: -3000, width: 10.0, lanes: 2 },
            { id: "touge_2", name: "Chiang Tung Touge Pass (Stage 2)", type: "mountain_pass", startX: -1000, startZ: -3000, endX: 0,     endZ: -3500, width: 10.0, lanes: 2 },
            { id: "touge_3", name: "Chiang Tung Touge Pass (Stage 3)", type: "mountain_pass", startX: 0,     startZ: -3500, endX: 1200,  endZ: -3100, width: 10.0, lanes: 2 },
            { id: "touge_4", name: "Alpine Ridge Descent",             type: "mountain_pass", startX: 1200,  startZ: -3100, endX: 2000,  endZ: -3500, width: 10.0, lanes: 2 },
            
            // 5. Airport Drag Strip Runway (1.5 km long straight in Industrial East)
            { id: "drag_strip", name: "Airport Runway 1.5KM Drag Strip", type: "runway", startX: 2800, startZ: 500, endX: 2800, endZ: 2000, width: 38.0, lanes: 6 },
            
            // 6. Downtown Core Grid Streets (Around 0, 0)
            { id: "dt_grid_n1", name: "Tazader Financial North", type: "city_street", startX: -800, startZ: -400, endX: 800, endZ: -400, width: 12.0, lanes: 2 },
            { id: "dt_grid_s1", name: "Tazader Financial South", type: "city_street", startX: -800, startZ: 400,  endX: 800, endZ: 400,  width: 12.0, lanes: 2 },
            { id: "dt_grid_w1", name: "Curitiba Avenue West",    type: "city_street", startX: -400, startZ: -800, endX: -400, endZ: 800, width: 12.0, lanes: 2 },
            { id: "dt_grid_e1", name: "Curitiba Avenue East",    type: "city_street", startX: 400,  startZ: -800, endX: 400,  endZ: 800, width: 12.0, lanes: 2 }
        ];
    }
    
    smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3.0 - 2.0 * t);
    }
    
    getElevation(x, z) {
        let baseHeight = 0;
        
        // Northern Mountain Ridge (z < -1200)
        if (z < -1200) {
            const mWeight = this.smoothstep(-1200, -4200, z);
            const mountainPeaks = this.octaveNoise2D(x, z, 4, 0.55, 0.0012, 101);
            baseHeight += mWeight * (35.0 + mountainPeaks * 55.0);
        }
        
        // Southern Coast (z > 2200)
        if (z > 2200) {
            const cWeight = this.smoothstep(2200, 4000, z);
            baseHeight -= cWeight * 10.0;
        }
        
        // Rolling Plains & Midland Valleys
        const rollingHills = this.octaveNoise2D(x, z, 3, 0.5, 0.0008, 202) * 10.0 - 5.0;
        baseHeight += rollingHills;
        
        return baseHeight;
    }
    
    getBiome(x, z) {
        if (z < -2600) return "NORTHERN_MOUNTAINS";
        if (z < -1200) return "PINE_FOREST";
        if (z > 3000) return "COASTAL_BEACH";
        if (x > 1400 && z > 400) return "INDUSTRIAL_ZONE";
        if (x < -1400) return "COUNTRYSIDE_FARMS";
        if (x > 1200 && z < 400) return "SUBURBAN_DISTRICT";
        return "DOWNTOWN_METROPOLIS";
    }
    
    getDistrict(x, z) {
        const biome = this.getBiome(x, z);
        if (biome === "DOWNTOWN_METROPOLIS") {
            const distCenter = Math.hypot(x, z);
            if (distCenter < 500) return "TAZADER_FINANCIAL_CORE";
            if (distCenter < 900) return "CURITIBA_COMMERCIAL_PLAZAS";
            return "METROPOLITAN_AVENUES";
        }
        if (biome === "SUBURBAN_DISTRICT") return "NANTWICH_SUBURBAN_TOWN";
        if (biome === "INDUSTRIAL_ZONE") {
            if (x > 2300 && z > 400 && z < 2200) return "AIRPORT_DRAG_STRIP";
            return "INDUSTRIAL_WAREHOUSES";
        }
        if (biome === "COUNTRYSIDE_FARMS") return "NANTWICH_RURAL_FARMS";
        if (biome === "PINE_FOREST") return "ALPINE_PINE_FOREST";
        if (biome === "NORTHERN_MOUNTAINS") return "CHIANG_TUNG_MOUNTAIN_PASS";
        if (biome === "COASTAL_BEACH") return "PALM_BEACH_PROMENADE";
        return "COUNTRYSIDE";
    }
    
    // --- PURE JSON CHUNK DATA PROVIDER (Direct World Space startX, startZ) ---
    getChunkData(seed, startX, startZ, chunkSize = 256) {
        const hashSeed = Math.floor(startX * 73 + startZ * 97);
        const prng = this.prng(seed + hashSeed);
        
        const centerX = startX + chunkSize / 2;
        const centerZ = startZ + chunkSize / 2;
        
        const district = this.getDistrict(centerX, centerZ);
        const biome = this.getBiome(centerX, centerZ);
        
        // 1. Intersecting Roads
        const chunkRoads = [];
        this.roadGraph.forEach(road => {
            const minRx = Math.min(road.startX, road.endX) - road.width;
            const maxRx = Math.max(road.startX, road.endX) + road.width;
            const minRz = Math.min(road.startZ, road.endZ) - road.width;
            const maxRz = Math.max(road.startZ, road.endZ) + road.width;
            
            if (maxRx >= startX && minRx <= startX + chunkSize && maxRz >= startZ && minRz <= startZ + chunkSize) {
                chunkRoads.push(road);
            }
        });
        
        const isPointOnRoad = (px, pz, margin = 6.0) => {
            for (let r of chunkRoads) {
                const l2 = Math.hypot(r.endX - r.startX, r.endZ - r.startZ) ** 2;
                if (l2 === 0) continue;
                let t = ((px - r.startX) * (r.endX - r.startX) + (pz - r.startZ) * (r.endZ - r.startZ)) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = r.startX + t * (r.endX - r.startX);
                const projZ = r.startZ + t * (r.endZ - r.startZ);
                const dist = Math.hypot(px - projX, pz - projZ);
                if (dist <= (r.width / 2 + margin)) return true;
            }
            return false;
        };
        
        // 2. Curated Minecraft Archetypes
        const buildings = [];
        
        if (district === "TAZADER_FINANCIAL_CORE" || district === "METROPOLITAN_AVENUES") {
            // Tazader Skyscraper Towers along street grid
            const gridSpacing = 90;
            for (let bx = startX + 45; bx < startX + chunkSize; bx += gridSpacing) {
                for (let bz = startZ + 45; bz < startZ + chunkSize; bz += gridSpacing) {
                    if (!isPointOnRoad(bx, bz, 14.0)) {
                        const isSuperTower = prng() > 0.6;
                        buildings.push({
                            type: isSuperTower ? "tazader_skyscraper" : "tazader_office",
                            x: bx, z: bz,
                            width: 32 + prng() * 12,
                            depth: 32 + prng() * 12,
                            height: isSuperTower ? (90 + prng() * 100) : (40 + prng() * 40),
                            elevation: this.getElevation(bx, bz)
                        });
                    }
                }
            }
        } else if (district === "CURITIBA_COMMERCIAL_PLAZAS") {
            // Curitiba City Apartments & Commercial Plazas
            const gridSpacing = 85;
            for (let bx = startX + 40; bx < startX + chunkSize; bx += gridSpacing) {
                for (let bz = startZ + 40; bz < startZ + chunkSize; bz += gridSpacing) {
                    if (!isPointOnRoad(bx, bz, 12.0)) {
                        buildings.push({
                            type: (prng() > 0.4) ? "curitiba_apartment" : "curitiba_plaza",
                            x: bx, z: bz,
                            width: 26 + prng() * 8,
                            depth: 26 + prng() * 8,
                            height: 28 + prng() * 30,
                            elevation: this.getElevation(bx, bz)
                        });
                    }
                }
            }
        } else if (district === "NANTWICH_SUBURBAN_TOWN" || district === "NANTWICH_RURAL_FARMS") {
            // Nantwich Tudor Houses, Brick Cottages & Pubs
            const houseSpacing = 70;
            for (let bx = startX + 35; bx < startX + chunkSize; bx += houseSpacing) {
                for (let bz = startZ + 35; bz < startZ + chunkSize; bz += houseSpacing) {
                    if (!isPointOnRoad(bx, bz, 10.0)) {
                        const isTudor = prng() > 0.5;
                        buildings.push({
                            type: isTudor ? "nantwich_tudor" : "nantwich_brick_cottage",
                            x: bx, z: bz,
                            width: 16 + prng() * 6,
                            depth: 14 + prng() * 6,
                            height: 8 + prng() * 4,
                            elevation: this.getElevation(bx, bz)
                        });
                    }
                }
            }
        } else if (district === "CHIANG_TUNG_MOUNTAIN_PASS" || district === "ALPINE_PINE_FOREST") {
            // Chiang Tung Pagodas, Temples & Shrines
            if (prng() > 0.4) {
                const mx = startX + 60 + prng() * 120;
                const mz = startZ + 60 + prng() * 120;
                if (!isPointOnRoad(mx, mz, 12.0)) {
                    buildings.push({
                        type: (prng() > 0.5) ? "chiang_tung_pagoda" : "chiang_tung_shrine",
                        x: mx, z: mz,
                        width: 20 + prng() * 8,
                        depth: 20 + prng() * 8,
                        height: 22 + prng() * 15,
                        elevation: this.getElevation(mx, mz)
                    });
                }
            }
        } else if (district === "INDUSTRIAL_WAREHOUSES") {
            const indSpacing = 110;
            for (let bx = startX + 55; bx < startX + chunkSize; bx += indSpacing) {
                for (let bz = startZ + 55; bz < startZ + chunkSize; bz += indSpacing) {
                    if (!isPointOnRoad(bx, bz, 16.0)) {
                        buildings.push({
                            type: "warehouse",
                            x: bx, z: bz,
                            width: 44 + prng() * 12,
                            depth: 32 + prng() * 10,
                            height: 16,
                            elevation: this.getElevation(bx, bz)
                        });
                    }
                }
            }
        } else if (district === "PALM_BEACH_PROMENADE") {
            const bSpacing = 95;
            for (let bx = startX + 45; bx < startX + chunkSize; bx += bSpacing) {
                for (let bz = startZ + 45; bz < startZ + chunkSize; bz += bSpacing) {
                    if (!isPointOnRoad(bx, bz, 14.0) && bz < 3600) {
                        buildings.push({
                            type: "beach_resort",
                            x: bx, z: bz,
                            width: 28 + prng() * 10,
                            depth: 24 + prng() * 8,
                            height: 32 + prng() * 25,
                            elevation: this.getElevation(bx, bz)
                        });
                    }
                }
            }
        }
        
        // 3. Vegetation Props
        const trees = [];
        const treeCount = (biome === "PINE_FOREST" || biome === "NORTHERN_MOUNTAINS") ? 24 : 
                          (biome === "COUNTRYSIDE_FARMS") ? 14 : 
                          (biome === "COASTAL_BEACH") ? 10 : 8;
                          
        for (let i = 0; i < treeCount; i++) {
            const tx = startX + prng() * chunkSize;
            const tz = startZ + prng() * chunkSize;
            if (!isPointOnRoad(tx, tz, 4.0)) {
                let treeType = "pine";
                if (biome === "COASTAL_BEACH") treeType = "palm";
                else if (district.includes("CHIANG_TUNG")) treeType = (prng() > 0.3) ? "cherry" : "pine";
                else if (district.includes("NANTWICH") || district.includes("CURITIBA")) treeType = (prng() > 0.5) ? "deciduous" : "hedge";
                else treeType = (prng() > 0.5) ? "cherry" : "deciduous";
                
                trees.push({
                    type: treeType,
                    x: tx, z: tz,
                    elevation: this.getElevation(tx, tz),
                    scale: 0.85 + prng() * 0.4
                });
            }
        }
        
        // 4. Streetlights along Road Curbs (Offset to road shoulder)
        const streetlights = [];
        chunkRoads.forEach(r => {
            const len = Math.hypot(r.endX - r.startX, r.endZ - r.startZ);
            if (len === 0) return;
            const dx = (r.endX - r.startX) / len;
            const dz = (r.endZ - r.startZ) / len;
            const nx = -dz;
            const nz = dx;
            const sideDist = (r.width / 2) + 1.8;
            
            const steps = Math.floor(len / 75);
            for (let i = 1; i <= steps; i++) {
                const t = i / (steps + 1);
                const cx = r.startX + t * (r.endX - r.startX);
                const cz = r.startZ + t * (r.endZ - r.startZ);
                
                const lx = cx + nx * sideDist;
                const lz = cz + nz * sideDist;
                
                const distToSpawn = Math.hypot(lx, lz);
                if (distToSpawn > 45.0 && lx >= startX && lx <= startX + chunkSize && lz >= startZ && lz <= startZ + chunkSize) {
                    streetlights.push({
                        x: lx, z: lz,
                        elevation: this.getElevation(lx, lz)
                    });
                }
            }
        });
        
        return {
            startX, startZ,
            chunkSize,
            biome,
            district,
            roads: chunkRoads,
            buildings,
            trees,
            streetlights
        };
    }
}
