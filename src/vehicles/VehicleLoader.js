import * as THREE from 'three';

/**
 * VehicleLoader.js — Canonical Absolute-Pivot World-Space Bedrock Assembler
 * 
 * Flawless geometry reconstruction:
 * 1. Computes all bone and cube pivots in single unified canonical coordinate space.
 * 2. Applies Euler rotations with Blockbench standard 'ZYX' order.
 * 3. Enforces canonical forward = -Z, UP = +Y, lowest tire contact at Y = 0.0.
 * 4. Correct per-face UV mapping with proper uv_size defaults per face orientation.
 */
export class VehicleLoader {
    constructor(game) {
        this.game = game;
        this.modelCache = {};
        this.textureCache = {};
        this.textureLoader = new THREE.TextureLoader();
    }
    
    getModelUrl(id) {
        const baked = new Set([
            'ae86', 'ferrari_f40', 'plane', 'van', 'police_car', 'taxi',
            'gtv_ford_gt', 'gtv_ford_mustang_shelby_gt500',
            'gtv_ford_bronco_sport', 'gtv_ford_f150'
        ]);
        if (baked.has(id)) {
            return `assets/processed/vehicles/models/${id}.json`;
        }
        if (id === 'school_bus') {
            return `assets/processed/vehicles/models/school_bus.geo.json`;
        }
        return `assets/models/${id}.json`;
    }
    
    getTextureUrl(id) {
        if (id === 'gtv_amg_gt63s') return 'assets/textures/gtv_amg_gt63s.png';
        if (id === 'gtv_amg_g63') return 'assets/textures/gtv_amg_g63.png';
        if (id === 'gtv_amg_gt') return 'assets/textures/gtv_amg_gt.png';
        if (id === 'gtv_amg_one') return 'assets/textures/gtv_amg_one.png';
        
        if (id === 'gtv_ford_gt') return 'assets/processed/vehicles/textures/gtv_ford_gt.png';
        if (id === 'gtv_ford_mustang_shelby_gt500') return 'assets/processed/vehicles/textures/gtv_ford_mustang_shelby_gt500.png';
        if (id === 'gtv_ford_bronco_sport') return 'assets/processed/vehicles/textures/gtv_ford_bronco_sport.png';
        if (id === 'gtv_ford_f150') return 'assets/processed/vehicles/textures/gtv_ford_f150.png';
        if (id === 'gtv_ford_mustang_dark_horse') return 'assets/textures/gtv_mustang.png';
        if (id.startsWith('gtv_ford_')) return 'assets/textures/gtv_mustang.png';
        
        if (id === 'gtv_lamborghini_urus') return 'assets/textures/gtv_lamborghini_urus.png';
        if (id.startsWith('gtv_lambo_')) return 'assets/textures/gtv_lamborghini.png';
        if (id.startsWith('gtv_ferrari_')) return 'assets/textures/gtv_ferrari.png';
        
        if (id === 'ae86') return 'assets/processed/vehicles/textures/ae86.png';
        if (id === 'ferrari_f40') return 'assets/processed/vehicles/textures/ferrari_f40.png';
        if (id === 'plane') return 'assets/processed/vehicles/textures/plane.png';
        if (id === 'school_bus') return 'assets/processed/vehicles/textures/school_bus.png';
        if (id === 'van') return 'assets/processed/vehicles/textures/van.png';
        if (id === 'police_car') return 'assets/processed/vehicles/textures/police_car.png';
        if (id === 'taxi') return 'assets/processed/vehicles/textures/taxi.png';
        
        return `assets/textures/${id}.png`;
    }
    
    async loadModelData(id) {
        if (this.modelCache[id]) return this.modelCache[id];
        
        const url = this.getModelUrl(id);
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Failed to load vehicle model: ${url}`);
            const fallback = await fetch('assets/models/gtv_ferrari_laferrari.json');
            return await fallback.json();
        }
        const json = await res.json();
        this.modelCache[id] = json;
        return json;
    }
    
    loadTexture(id) {
        if (this.textureCache[id]) return this.textureCache[id];
        
        const url = this.getTextureUrl(id);
        const tex = this.textureLoader.load(url);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        
        this.textureCache[id] = tex;
        return tex;
    }

    /** Build a BufferGeometry from the compact arrays in a baked vehicle. */
    geometryFromBaked(data) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
        if (data.normal) {
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
        }
        if (data.uv) {
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
        }
        if (data.index) geo.setIndex(data.index);
        if (!data.normal) geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        return geo;
    }

    /**
     * Build a pre-baked vehicle: a single body mesh plus four wheel groups at
     * their true pivots. This is the fast path used by the five reworked
     * vehicles; the frozen Bedrock path above remains for the legacy lineup.
     */
    createBakedVehicle(id, model, texture) {
        const paint = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.28,
            metalness: 0.62,
            side: THREE.DoubleSide,
            envMapIntensity: 1.1
        });
        const rubber = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.9,
            metalness: 0.04,
            side: THREE.DoubleSide,
            envMapIntensity: 0.55
        });

        const root = new THREE.Group();
        root.name = `vehicle_${id}`;

        if (model.body) {
            const body = new THREE.Mesh(this.geometryFromBaked(model.body), paint);
            body.name = 'baked_body';
            body.castShadow = true;
            body.receiveShadow = true;
            root.add(body);
        }

        for (const wheel of model.wheels || []) {
            const group = new THREE.Group();
            group.name = wheel.name;
            group.position.fromArray(wheel.pivot || [0, 0, 0]);

            const mesh = new THREE.Mesh(this.geometryFromBaked(wheel.geometry), rubber);
            mesh.name = 'baked_wheel';
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            root.add(group);
        }

        const b = model.bounds || {};
        return {
            root,
            dimensions: new THREE.Vector3(b.width || 2, b.height || 1.4, b.length || 4.5),
            groundOffset: 0,
            forward: new THREE.Vector3(0, 0, -1),
            up: new THREE.Vector3(0, 1, 0),
            right: new THREE.Vector3(1, 0, 0)
        };
    }
    
    async createVehicleMesh(id) {
        const modelData = await this.loadModelData(id);
        const texture = this.loadTexture(id);

        // Pre-baked APEX format: one merged body + four wheel geometries.
        if (modelData && modelData.format === 'apex-vehicle-v1') {
            return this.createBakedVehicle(id, modelData, texture);
        }

        const rootGroup = new THREE.Group();
        rootGroup.name = `vehicle_${id}`;
        
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.35,
            metalness: 0.25,
            side: THREE.DoubleSide
        });
        
        const geoKey = Object.keys(modelData).find(k => k.startsWith('geometry.') || k === 'minecraft:geometry');
        let geometryDef = modelData[geoKey];
        if (Array.isArray(geometryDef)) geometryDef = geometryDef[0];
        if (!geometryDef && modelData['minecraft:geometry']) geometryDef = modelData['minecraft:geometry'][0];
        
        const bones = geometryDef.bones || [];
        const texWidth = geometryDef.description ? (geometryDef.description.texture_width || 32) : 32;
        const texHeight = geometryDef.description ? (geometryDef.description.texture_height || 32) : 32;
        
        // Build all bones with exact parent-child hierarchy
        const boneMap = {};
        const worldPivots = {};
        
        bones.forEach(b => {
            worldPivots[b.name] = b.pivot || [0, 0, 0];
        });
        
        bones.forEach(bone => {
            const boneGroup = new THREE.Group();
            boneGroup.name = bone.name;
            
            const bp = worldPivots[bone.name];
            const pp = bone.parent && worldPivots[bone.parent] ? worldPivots[bone.parent] : [0, 0, 0];
            
            // Relative translation from parent bone pivot
            boneGroup.position.set(-(bp[0] - pp[0]) / 16, (bp[1] - pp[1]) / 16, (bp[2] - pp[2]) / 16);
            
            if (bone.rotation) {
                const euler = new THREE.Euler(
                    -THREE.MathUtils.degToRad(bone.rotation[0]),
                    -THREE.MathUtils.degToRad(bone.rotation[1]),
                    THREE.MathUtils.degToRad(bone.rotation[2]),
                    'ZYX'
                );
                boneGroup.setRotationFromEuler(euler);
            }
            
            if (bone.cubes) {
                bone.cubes.forEach(cube => {
                    const origin = cube.origin || [0, 0, 0];
                    const size = cube.size || [1, 1, 1];
                    
                    const w = Math.max(0.01, size[0] / 16);
                    const h = Math.max(0.01, size[1] / 16);
                    const d = Math.max(0.01, size[2] / 16);
                    
                    const boxGeo = new THREE.BoxGeometry(w, h, d);
                    
                    if (cube.uv) {
                        this.applyCubeUV(boxGeo, cube.uv, size, texWidth, texHeight);
                    }
                    
                    const mesh = new THREE.Mesh(boxGeo, material);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    
                    if (cube.rotation && cube.pivot) {
                        const cubeRotGroup = new THREE.Group();
                        // Pivot relative to this bone
                        const cpx = -(cube.pivot[0] - bp[0]) / 16;
                        const cpy = (cube.pivot[1] - bp[1]) / 16;
                        const cpz = (cube.pivot[2] - bp[2]) / 16;
                        
                        cubeRotGroup.position.set(cpx, cpy, cpz);
                        
                        const euler = new THREE.Euler(
                            -THREE.MathUtils.degToRad(cube.rotation[0]),
                            -THREE.MathUtils.degToRad(cube.rotation[1]),
                            THREE.MathUtils.degToRad(cube.rotation[2]),
                            'ZYX'
                        );
                        cubeRotGroup.setRotationFromEuler(euler);
                        
                        // Box center relative to cube pivot
                        const ox = -((origin[0] + size[0]/2) - cube.pivot[0]) / 16;
                        const oy = ((origin[1] + size[1]/2) - cube.pivot[1]) / 16;
                        const oz = ((origin[2] + size[2]/2) - cube.pivot[2]) / 16;
                        
                        mesh.position.set(ox, oy, oz);
                        cubeRotGroup.add(mesh);
                        boneGroup.add(cubeRotGroup);
                    } else {
                        // Box center relative to bone pivot
                        const cx = -((origin[0] + size[0]/2) - bp[0]) / 16;
                        const cy = ((origin[1] + size[1]/2) - bp[1]) / 16;
                        const cz = ((origin[2] + size[2]/2) - bp[2]) / 16;
                        
                        mesh.position.set(cx, cy, cz);
                        boneGroup.add(mesh);
                    }
                });
            }
            
            boneMap[bone.name] = boneGroup;
        });
        
        // Assemble hierarchy
        bones.forEach(bone => {
            const boneGroup = boneMap[bone.name];
            if (bone.parent && boneMap[bone.parent]) {
                boneMap[bone.parent].add(boneGroup);
            } else {
                rootGroup.add(boneGroup);
            }
        });
        
        // Grounding: Lowest point flush at Y = 0.0, ideally based on wheels
        rootGroup.updateMatrixWorld(true);
        const overallBbox = new THREE.Box3().setFromObject(rootGroup);
        
        const WHEEL_NAMES = [
            'pneu1', 'tire0', 'wheel_fl', 'front_left_wheel', 'frontleftwheel',
            'pneu2', 'tire1', 'wheel_fr', 'front_right_wheel', 'frontrightwheel',
            'pneu3', 'tire2', 'wheel_rl', 'rear_left_wheel', 'rearleftwheel',
            'pneu4', 'tire3', 'tire4', 'tire5', 'wheel_rr', 'rear_right_wheel', 'rearrightwheel'
        ];
        
        let lowestY = Infinity;
        let wheelFound = false;
        
        rootGroup.traverse(child => {
            if (child.isGroup && WHEEL_NAMES.includes(child.name.toLowerCase())) {
                const wBbox = new THREE.Box3().setFromObject(child);
                if (!isNaN(wBbox.min.y)) {
                    lowestY = Math.min(lowestY, wBbox.min.y);
                    wheelFound = true;
                }
            }
        });
        
        const groundY = wheelFound && lowestY !== Infinity ? lowestY : overallBbox.min.y;
        
        if (!isNaN(groundY)) {
            rootGroup.position.y = -groundY;
        }
        
        const finalGroup = new THREE.Group();
        finalGroup.add(rootGroup);
        
        // Return Normalized Vehicle Contract
        return {
            root: finalGroup,
            dimensions: new THREE.Vector3(
                overallBbox.max.x - overallBbox.min.x,
                overallBbox.max.y - overallBbox.min.y,
                overallBbox.max.z - overallBbox.min.z
            ),
            groundOffset: groundY,
            forward: new THREE.Vector3(0, 0, -1),
            up: new THREE.Vector3(0, 1, 0),
            right: new THREE.Vector3(1, 0, 0)
        };
    }
    
    applyCubeUV(geometry, uvDef, size, tw, th) {
        const uvs = geometry.attributes.uv.array;
        const sx = size[0];
        const sy = size[1];
        const sz = size[2];
        
        const setFaceUV = (faceIdx, u0, v0, u1, v1) => {
            const base = faceIdx * 8;
            const uMin = u0 / tw;
            const uMax = u1 / tw;
            const vMin = 1.0 - (v1 / th);
            const vMax = 1.0 - (v0 / th);
            
            uvs[base + 0] = uMin; uvs[base + 1] = vMax;
            uvs[base + 2] = uMax; uvs[base + 3] = vMax;
            uvs[base + 4] = uMin; uvs[base + 5] = vMin;
            uvs[base + 6] = uMax; uvs[base + 7] = vMin;
        };
        
        if (typeof uvDef === 'object' && !Array.isArray(uvDef)) {
            // Per-face UV mapping with CORRECT default uv_size per face orientation
            const mapFace = (faceIdx, faceKey) => {
                const f = uvDef[faceKey];
                if (f && f.uv) {
                    const u = f.uv[0];
                    const v = f.uv[1];
                    let faceSize;
                    if (f.uv_size) {
                        faceSize = f.uv_size;
                    } else {
                        // Correct defaults based on face orientation:
                        // east/west (+X/-X) faces show Z width x Y height
                        // up/down (+Y/-Y) faces show X width x Z depth
                        // south/north (+Z/-Z) faces show X width x Y height
                        switch (faceKey) {
                            case 'east':
                            case 'west':
                                faceSize = [sz, sy];
                                break;
                            case 'up':
                            case 'down':
                                faceSize = [sx, sz];
                                break;
                            case 'north':
                            case 'south':
                            default:
                                faceSize = [sx, sy];
                                break;
                        }
                    }
                    setFaceUV(faceIdx, u, v, u + faceSize[0], v + faceSize[1]);
                }
            };
            mapFace(0, 'east');   // +X
            mapFace(1, 'west');   // -X
            mapFace(2, 'up');     // +Y
            mapFace(3, 'down');   // -Y
            mapFace(4, 'south');  // +Z
            mapFace(5, 'north');  // -Z
            geometry.attributes.uv.needsUpdate = true;
            return;
        }
        
        if (Array.isArray(uvDef)) {
            const u0 = uvDef[0];
            const v0 = uvDef[1];
            
            // Standard Bedrock box UV unwrap layout
            setFaceUV(0, u0, v0 + sz, u0 + sz, v0 + sz + sy);               // east (+X)
            setFaceUV(1, u0 + sz + sx, v0 + sz, u0 + sz + sx + sz, v0 + sz + sy); // west (-X)
            setFaceUV(2, u0 + sz, v0, u0 + sz + sx, v0 + sz);               // up (+Y)
            setFaceUV(3, u0 + sz + sx, v0, u0 + sz + sx + sx, v0 + sz);     // down (-Y)
            setFaceUV(4, u0 + sz + sx + sz, v0 + sz, u0 + sz + sx + sz + sx, v0 + sz + sy); // south (+Z)
            setFaceUV(5, u0 + sz, v0 + sz, u0 + sz + sx, v0 + sz + sy);     // north (-Z)
            
            geometry.attributes.uv.needsUpdate = true;
        }
    }
}
