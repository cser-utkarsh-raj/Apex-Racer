import * as THREE from 'three';

export class SourceWorldTest {
    constructor(game) {
        this.game = game;
        this.worldGroup = new THREE.Group();
        this.worldGroup.name = "source_world_root";
        
        this.roads = [];
        this.buildings = [];
        this.events = [];
        
        this.lastChunkX = 0;
        this.lastChunkZ = 0;
        this.activeChunks = new Map();
    }
    
    async loadWorld(worldId) {
        console.log(`[SourceWorldTest] Loading isolated test environment...`);
        
        while (this.worldGroup.children.length > 0) {
            this.worldGroup.remove(this.worldGroup.children[0]);
        }
        
        const groundGeo = new THREE.PlaneGeometry(10000, 10000).rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2f1c, roughness: 1.0 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.1;
        this.worldGroup.add(ground);
        
        const voxelGeo = new THREE.BoxGeometry(2, 2, 2);
        const matLib = {
            asphalt: new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.9 }),
            line: new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.8 }),
            grass: new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 1.0 }),
            concrete: new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.7 }),
            glass: new THREE.MeshStandardMaterial({ color: 0x3498db, transparent: true, opacity: 0.6, metalness: 0.5 }),
            steel: new THREE.MeshStandardMaterial({ color: 0x7f8c8d, metalness: 0.8, roughness: 0.2 }),
            lamp: new THREE.MeshBasicMaterial({ color: 0xfff3cc })
        };
        
        // Render One Real Road (Step 4) - GreaterKCMetro Interchange
        try {
            const rRes = await fetch('assets/compiled_modules/greater_kc_expressway_interchange.json');
            if (rRes.ok) {
                const roadData = await rRes.json();
                const rInst = new THREE.InstancedMesh(voxelGeo, matLib.asphalt, roadData.voxels.length);
                const dummy = new THREE.Object3D();
                
                roadData.voxels.forEach((v, idx) => {
                    dummy.position.set(v.rel_x, v.rel_y, v.rel_z - 150); // offset so we can see it
                    dummy.updateMatrix();
                    rInst.setMatrixAt(idx, dummy.matrix);
                });
                rInst.instanceMatrix.needsUpdate = true;
                this.worldGroup.add(rInst);
                console.log(`[SourceWorldTest] Loaded Road: ${roadData.id}`);
            }
        } catch (e) {
            console.error("Failed to load test road", e);
        }
        
        // Render One Real Building (Step 5) - Tazader Skyscraper
        try {
            const bRes = await fetch('assets/compiled_modules/tazader_skyscraper_alpha.json');
            if (bRes.ok) {
                const bldgData = await bRes.json();
                const bInst = new THREE.InstancedMesh(voxelGeo, matLib.glass, bldgData.voxels.length);
                const dummy = new THREE.Object3D();
                
                bldgData.voxels.forEach((v, idx) => {
                    // Place building next to the road
                    dummy.position.set(v.rel_x - 40, v.rel_y, v.rel_z);
                    dummy.updateMatrix();
                    bInst.setMatrixAt(idx, dummy.matrix);
                });
                bInst.instanceMatrix.needsUpdate = true;
                this.worldGroup.add(bInst);
                console.log(`[SourceWorldTest] Loaded Building: ${bldgData.id}`);
            }
        } catch (e) {
            console.error("Failed to load test building", e);
        }
        
        // Render One TrafficCraft Prop (Step 6) - Streetlight
        try {
            const tcRes = await fetch('assets/source_library/test_streetlight.json');
            if (tcRes.ok) {
                const tcData = await tcRes.json();
                const tcGroup = new THREE.Group();
                
                // Parse Blockbench format: 1 block = 16 units, scaled to match our 2-unit voxels
                const scale = 2.0 / 16.0; 
                
                tcData.elements.forEach(el => {
                    const w = (el.to[0] - el.from[0]) * scale;
                    const h = (el.to[1] - el.from[1]) * scale;
                    const d = (el.to[2] - el.from[2]) * scale;
                    
                    const cx = (el.from[0] + el.to[0]) / 2.0 * scale;
                    const cy = (el.from[1] + el.to[1]) / 2.0 * scale;
                    const cz = (el.from[2] + el.to[2]) / 2.0 * scale;
                    
                    // Simple heuristic: if it has "#3" (lamp_light_off), make it glow
                    let isLamp = false;
                    for (let face in el.faces) {
                        if (el.faces[face].texture === "#3") isLamp = true;
                    }
                    
                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isLamp ? matLib.lamp : matLib.steel);
                    mesh.position.set(cx, cy, cz);
                    
                    if (el.rotation) {
                        const ox = el.rotation.origin[0] * scale;
                        const oy = el.rotation.origin[1] * scale;
                        const oz = el.rotation.origin[2] * scale;
                        
                        // Move to origin, rotate, move back
                        mesh.position.sub(new THREE.Vector3(ox, oy, oz));
                        
                        if (el.rotation.axis === 'x') mesh.rotation.x = el.rotation.angle * Math.PI / 180;
                        if (el.rotation.axis === 'y') mesh.rotation.y = el.rotation.angle * Math.PI / 180;
                        if (el.rotation.axis === 'z') mesh.rotation.z = el.rotation.angle * Math.PI / 180;
                        
                        const euler = new THREE.Euler(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
                        mesh.position.applyEuler(euler);
                        mesh.position.add(new THREE.Vector3(ox, oy, oz));
                    }
                    
                    tcGroup.add(mesh);
                });
                
                tcGroup.position.set(-10, 0, 0); // Place near the car
                this.worldGroup.add(tcGroup);
                console.log(`[SourceWorldTest] Loaded TrafficCraft Streetlight`);
            }
        } catch (e) {
            console.error("Failed to load test TrafficCraft prop", e);
        }
        
        if (this.game.scene) {
            this.game.scene.add(this.worldGroup);
            this.game.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        }
    }
    
    update(delta) {
        // Dynamic streaming logic will go here
    }
    
    getHeight(x, z) { return 0.05; }
    getClassification(x, z) { return 2; }
    getCurrentZoneName(x, z) { return "SOURCE ASSET TEST AREA"; }
}
