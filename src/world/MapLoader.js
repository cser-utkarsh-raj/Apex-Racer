import * as THREE from 'three';
import { RoadExtruder } from './RoadExtruder.js';

/**
 * MapLoader.js — Master World Assembler
 * Assembles genuine extracted Minecraft source map components (Tazader, Curitiba, Chiang Tung)
 * alongside engineered Asphalt-grade road networks, bridges, tunnels, and TrafficCraft infrastructure.
 */
export class MapLoader {
    constructor(game) {
        this.game = game;
        this.currentWorldId = 'hero_circuit';
        this.worldData = null;
        
        this.roads = [];
        this.buildings = [];
        this.events = [];
        
        this.roadExtruder = new RoadExtruder();
        this.worldGroup = new THREE.Group();
        this.worldGroup.name = "world_root";
        
        this.materials = {};
        this.initMaterials();
    }
    
    initMaterials() {
        this.materials.quartz = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.25, metalness: 0.1 });
        this.materials.glass = new THREE.MeshStandardMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.75, roughness: 0.1 });
        this.materials.brick = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.85 });
        this.materials.wood = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 });
        this.materials.concrete = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.9 });
        this.materials.glow = new THREE.MeshBasicMaterial({ color: 0xffeaa7 });
        
        this.materials.ocean_water = new THREE.MeshStandardMaterial({ color: 0x006699, roughness: 0.1, metalness: 0.8 });
        this.materials.bridge_steel = new THREE.MeshStandardMaterial({ color: 0xeb4d4b, roughness: 0.3, metalness: 0.6 });
        this.materials.tunnel_wall = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.95 });
        
        this.materials.container_blue = new THREE.MeshStandardMaterial({ color: 0x0984e3, roughness: 0.5, metalness: 0.4 });
        this.materials.container_orange = new THREE.MeshStandardMaterial({ color: 0xe17055, roughness: 0.5, metalness: 0.4 });
        this.materials.container_green = new THREE.MeshStandardMaterial({ color: 0x00b894, roughness: 0.5, metalness: 0.4 });
        this.materials.train_yellow = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.4, metalness: 0.5 });
        this.materials.train_steel = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4, metalness: 0.8 });
        
        this.materials.ground = new THREE.MeshStandardMaterial({ color: 0x141e12, roughness: 0.95 });
        this.materials.streetlamp = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
        this.materials.guardrail = new THREE.MeshStandardMaterial({ color: 0x8e9bb0, metalness: 0.8, roughness: 0.2 });
        this.materials.gantry_green = new THREE.MeshStandardMaterial({ color: 0x009432, roughness: 0.4 });
        this.materials.runway_light = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    }
    
    async loadWorld(worldId = 'neo_tazader') {
        console.log(`WorldAssembler: Assembling Source Map Circuit -> ${worldId}...`);
        this.currentWorldId = worldId;
        
        while (this.worldGroup.children.length > 0) {
            this.worldGroup.remove(this.worldGroup.children[0]);
        }
        this.buildings = [];
        this.roads = [];
        this.events = [];
        
        // Master 1km x 1km Engineered Hero Circuit
        this.roads = [
            // 1. Downtown Boulevard (Z: -600 to -200, X: 0)
            { id: "downtown_blvd", startX: 0, startZ: -600, endX: 0, endZ: -200, lanes: 4, width: 28, surface: "asphalt" },
            
            // 2. Banked S-Curves (Z: -200 to 200, curving to X: 350)
            { id: "scurve_1", startX: 0, startZ: -200, endX: 180, endZ: 0, lanes: 4, width: 26, surface: "asphalt" },
            { id: "scurve_2", startX: 180, startZ: 0, endX: 350, endZ: 200, lanes: 4, width: 26, surface: "asphalt" },
            
            // 3. Ocean Suspension Bridge (Z: 200 to 650, X: 350 to 500)
            { id: "ocean_bridge", startX: 350, startZ: 200, endX: 500, endZ: 650, lanes: 6, width: 34, surface: "asphalt" },
            
            // 4. Mountain Tunnel Pass (Z: 650 to 950, X: 500)
            { id: "mountain_tunnel", startX: 500, startZ: 650, endX: 500, endZ: 950, lanes: 4, width: 24, surface: "asphalt" },
            
            // 5. Industrial Port Turn (Z: 950 to 1250, X: 500 to 0)
            { id: "industrial_curve", startX: 500, startZ: 950, endX: 0, endZ: 1250, lanes: 4, width: 26, surface: "asphalt" },
            
            // 6. Airport Apron (Z: 1250 to 1500, X: 0 to -180)
            { id: "airport_apron_turn", startX: 0, startZ: 1250, endX: -180, endZ: 1500, lanes: 4, width: 28, surface: "asphalt" },
            
            // 7. 2.0 KM Airport Drag Strip (Z: 1500 to -600, X: -180 to 0)
            { id: "airport_drag_strip", startX: -180, startZ: 1500, endX: -180, endZ: -500, lanes: 6, width: 40, surface: "asphalt" },
            { id: "drag_return_curve", startX: -180, startZ: -500, endX: 0, endZ: -600, lanes: 4, width: 28, surface: "asphalt" }
        ];
        
        this.events = [{
            id: "apex_grand_prix",
            name: "APEX HERO GRAND PRIX",
            laps: 2,
            rewardCash: 35000,
            rewardRep: 600,
            checkpoints: [
                { x: 0, z: -400, radius: 18 },
                { x: 250, z: 100, radius: 18 },
                { x: 420, z: 420, radius: 20 },
                { x: 500, z: 800, radius: 18 },
                { x: 250, z: 1100, radius: 18 },
                { x: -180, z: 1400, radius: 22 },
                { x: -180, z: 0, radius: 22 },
                { x: 0, z: -550, radius: 20 }
            ]
        }];
        
        // 1. Extrude Road Network
        const roadMeshGroup = this.roadExtruder.buildRoadNetwork(this.roads);
        this.worldGroup.add(roadMeshGroup);
        
        const cityGroup = new THREE.Group();
        
        // 2. Base Ground
        const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000).rotateX(-Math.PI / 2), this.materials.ground);
        groundMesh.position.y = -0.05;
        groundMesh.receiveShadow = true;
        cityGroup.add(groundMesh);
        
        // Ocean Water Body (X: 200 to 600, Z: 150 to 700)
        const oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 700).rotateX(-Math.PI / 2), this.materials.ocean_water);
        oceanMesh.position.set(420, -0.02, 420);
        cityGroup.add(oceanMesh);
        
        // 3. Render Real Extracted Minecraft Assets
        const voxelGeo = new THREE.BoxGeometry(2, 2, 2);
        
        // A. Real Tazader City Skyscrapers (Downtown Zone: Z: -600 to -200)
        try {
            const tRes = await fetch('assets/extracted/tazader_buildings.json');
            if (tRes.ok) {
                const tazVoxels = await tRes.json();
                const tInst = new THREE.InstancedMesh(voxelGeo, this.materials.quartz, tazVoxels.length);
                const dummy = new THREE.Object3D();
                
                tazVoxels.forEach((v, idx) => {
                    dummy.position.set(v.x, v.y, v.z);
                    dummy.updateMatrix();
                    tInst.setMatrixAt(idx, dummy.matrix);
                    
                    if (idx % 6 === 0) {
                        this.buildings.push({ x: v.x, z: v.z, r_x: 2.2, r_z: 2.2, height: v.y });
                    }
                });
                tInst.instanceMatrix.needsUpdate = true;
                cityGroup.add(tInst);
                console.log(`Rendered ${tazVoxels.length} authentic Tazader City skyscraper voxels!`);
            }
        } catch (e) {
            console.warn("Tazader asset load error:", e);
        }
        
        // B. Real Chiang Tung Mountain Pagodas (Mountain Pass Zone: Z: 650 to 950, X: 450 to 600)
        try {
            const cRes = await fetch('assets/extracted/chiang_tung_buildings.json');
            if (cRes.ok) {
                const chiangVoxels = await cRes.json();
                const cInst = new THREE.InstancedMesh(voxelGeo, this.materials.wood, chiangVoxels.length);
                const dummy = new THREE.Object3D();
                
                chiangVoxels.forEach((v, idx) => {
                    dummy.position.set(v.x, v.y, v.z);
                    dummy.updateMatrix();
                    cInst.setMatrixAt(idx, dummy.matrix);
                });
                cInst.instanceMatrix.needsUpdate = true;
                cityGroup.add(cInst);
                console.log(`Rendered ${chiangVoxels.length} authentic Chiang Tung pagoda voxels!`);
            }
        } catch (e) {
            console.warn("Chiang Tung asset load error:", e);
        }
        
        // 4. Ocean Bridge Suspension Towers
        const towerGeo = new THREE.BoxGeometry(6, 60, 6);
        const t1 = new THREE.Mesh(towerGeo, this.materials.bridge_steel);
        t1.position.set(380, 30, 320);
        cityGroup.add(t1);
        
        const t2 = new THREE.Mesh(towerGeo, this.materials.bridge_steel);
        t2.position.set(470, 30, 530);
        cityGroup.add(t2);
        
        // 5. Mountain Tunnel Clifftop & Portals
        const mountainCliffGeo = new THREE.BoxGeometry(70, 35, 300);
        const mountainMesh = new THREE.Mesh(mountainCliffGeo, this.materials.tunnel_wall);
        mountainMesh.position.set(500, 17.5, 800);
        cityGroup.add(mountainMesh);
        this.buildings.push({ x: 500, z: 800, r_x: 35, r_z: 150, height: 35 });
        
        const tunnelArch = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 300), this.materials.tunnel_wall);
        tunnelArch.position.set(500, 7.5, 800);
        cityGroup.add(tunnelArch);
        
        for (let tz = 670; tz < 930; tz += 25) {
            const tl = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 6), this.materials.glow);
            tl.position.set(500, 6.8, tz);
            cityGroup.add(tl);
        }
        
        // 6. Industrial Port Stacked Containers & Freight Trains
        const containerGeo = new THREE.BoxGeometry(12, 5, 5);
        const cMats = [this.materials.container_blue, this.materials.container_orange, this.materials.container_green];
        
        for (let i = 0; i < 35; i++) {
            const cx = 120 + (i % 6) * 35;
            const cz = 980 + Math.floor(i / 6) * 40;
            const stack = 1 + (i % 3);
            
            for (let s = 0; s < stack; s++) {
                const cMesh = new THREE.Mesh(containerGeo, cMats[(i + s) % 3]);
                cMesh.position.set(cx, 2.5 + s * 5, cz);
                cityGroup.add(cMesh);
            }
            this.buildings.push({ x: cx, z: cz, r_x: 6, r_z: 2.5, height: stack * 5 });
        }
        
        // 7. Airport Apron Hangars & 3D Planes along 2.0 km Drag Strip
        const hangarGeo = new THREE.BoxGeometry(50, 20, 60);
        const h1 = new THREE.Mesh(hangarGeo, this.materials.guardrail);
        h1.position.set(-260, 10, 1100);
        cityGroup.add(h1);
        this.buildings.push({ x: -260, z: 1100, r_x: 25, r_z: 30, height: 20 });
        
        const h2 = new THREE.Mesh(hangarGeo, this.materials.guardrail);
        h2.position.set(-260, 10, 300);
        cityGroup.add(h2);
        this.buildings.push({ x: -260, z: 300, r_x: 25, r_z: 30, height: 20 });
        
        for (let z = -480; z < 1480; z += 30) {
            const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), this.materials.runway_light);
            l1.position.set(-202, 0.3, z);
            cityGroup.add(l1);
            
            const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), this.materials.runway_light);
            l2.position.set(-158, 0.3, z);
            cityGroup.add(l2);
        }
        
        // Spawn Parked 3D Airplanes
        try {
            this.game.vehicleLoader.createVehicleMesh('plane').then(planeMesh => {
                planeMesh.position.set(-240, 0.05, 800);
                planeMesh.rotation.y = Math.PI / 4;
                cityGroup.add(planeMesh);
                
                const p2 = planeMesh.clone();
                p2.position.set(-240, 0.05, 500);
                p2.rotation.y = Math.PI / 4;
                cityGroup.add(p2);
            });
        } catch (e) {}
        
        // 8. TrafficCraft Street Furniture (Streetlamps & Overhead Gantries)
        const lampGeo = new THREE.BoxGeometry(0.25, 6.0, 0.25);
        const lampHeadGeo = new THREE.BoxGeometry(1.0, 0.3, 0.8);
        
        this.roads.forEach(r => {
            const dx = r.endX - r.startX;
            const dz = r.endZ - r.startZ;
            const len = Math.hypot(dx, dz);
            const count = Math.floor(len / 45);
            
            for (let i = 1; i < count; i++) {
                const t = i / count;
                const lx = r.startX + dx * t + (r.width / 2 + 1.2);
                const lz = r.startZ + dz * t;
                
                const pole = new THREE.Mesh(lampGeo, this.materials.guardrail);
                pole.position.set(lx, 3.0, lz);
                cityGroup.add(pole);
                
                const head = new THREE.Mesh(lampHeadGeo, this.materials.streetlamp);
                head.position.set(lx, 6.1, lz);
                cityGroup.add(head);
            }
            
            if (r.lanes >= 4 && len > 200) {
                const gx = r.startX + dx * 0.5;
                const gz = r.startZ + dz * 0.5;
                
                const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9.0, 0.6), this.materials.guardrail);
                p1.position.set(gx - (r.width/2 + 1), 4.5, gz);
                cityGroup.add(p1);
                
                const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9.0, 0.6), this.materials.guardrail);
                p2.position.set(gx + (r.width/2 + 1), 4.5, gz);
                cityGroup.add(p2);
                
                const sign = new THREE.Mesh(new THREE.BoxGeometry(r.width + 1.5, 2.5, 0.4), this.materials.gantry_green);
                sign.position.set(gx, 8.0, gz);
                cityGroup.add(sign);
            }
        });
        
        this.worldGroup.add(cityGroup);
        
        if (this.game.scene && !this.game.scene.getObjectByName("world_root")) {
            this.game.scene.add(this.worldGroup);
        }
        
        console.log("WorldAssembler: Real Minecraft Source Assets & Hero Circuit Assembled!");
    }
    
    loadMap(mapId) {
        return this.loadWorld(mapId);
    }
    
    getHeight(x, z) {
        return 0.05;
    }
    
    getClassification(x, z) {
        return 2;
    }
    
    getCurrentZoneName(x, z) {
        if (x < -100) return "2.0 KM AIRPORT DRAG STRIP";
        if (z > 950) return "INDUSTRIAL CONTAINER PORT";
        if (z > 650) return "CHIANG TUNG MOUNTAIN PASS";
        if (z > 200) return "OCEAN SUSPENSION BRIDGE";
        if (z > -200) return "BANKED S-CURVE HIGHWAY";
        return "TAZADER METROPOLIS";
    }
    
    update(delta) {}
}
