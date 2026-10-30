/**
 * Bake Bedrock vehicle geometry into APEX's merged runtime format.
 *
 *   node tools/bake-vehicles.mjs
 *
 * For each vehicle this uses the same VehicleLoader the game uses, so the
 * baked meshes are pixel-identical to the preview build. The loader's cube
 * hierarchy is merged into:
 *   - one body BufferGeometry (all non-wheel cubes)
 *   - four wheel BufferGeometries named wheel_fl / wheel_fr / wheel_rl / wheel_rr
 *
 * Output: assets/processed/vehicles/models/<id>.json
 *         assets/processed/vehicles/textures/<id>.png
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { VehicleLoader } from '../src/vehicles/VehicleLoader.js';
import { mergeVehicleParts } from '../src/vehicles/VehicleMerger.js';

const ROOT = path.resolve('.');
const MODEL_OUT = path.join(ROOT, 'assets/processed/vehicles/models');
const TEX_OUT = path.join(ROOT, 'assets/processed/vehicles/textures');

const VEHICLES = [
    {
        id: 'gtv_ford_gt',
        source: 'assets/models/gtv_ford_gt.json',
        texture: 'assets/textures/gtv_ford_gt.png'
    },
    {
        id: 'gtv_ford_mustang_shelby_gt500',
        source: 'assets/models/gtv_ford_mustang_shelby_gt500.json',
        texture: 'assets/textures/gtv_shelby.png'
    },
    {
        id: 'gtv_ford_bronco_sport',
        source: 'assets/models/gtv_ford_bronco_sport.json',
        texture: 'assets/textures/gtv_bronco.png'
    },
    {
        id: 'gtv_ford_f150',
        source: 'assets/models/gtv_ford_f150.json',
        texture: 'assets/textures/gtv_f150.png'
    },
    {
        // The AE86 already has a 4-wheel split in the processed library.
        id: 'ae86',
        source: 'assets/processed/vehicles/models/ae86.json',
        texture: 'assets/processed/vehicles/textures/ae86_new_toyota_ae86.png'
    }
];

const WHEEL_NAME = /^(pneu\d+|tire\d+|wheel_(fl|fr|rl|rr))$/i;

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function round(value, places = 5) {
    const f = 10 ** places;
    return Math.round(value * f) / f;
}

function geometryData(geometry) {
    const pos = geometry.attributes.position.array;
    const nrm = geometry.attributes.normal.array;
    const uv = geometry.attributes.uv ? geometry.attributes.uv.array : new Float32Array((pos.length / 3) * 2);
    const index = geometry.index
        ? Array.from(geometry.index.array)
        : Array.from({ length: pos.length / 3 }, (_, i) => i);

    const positions = new Array(pos.length);
    const normals = new Array(nrm.length);
    const uvs = new Array(uv.length);
    for (let i = 0; i < pos.length; i++) positions[i] = round(pos[i]);
    for (let i = 0; i < nrm.length; i++) normals[i] = round(nrm[i], 4);
    for (let i = 0; i < uv.length; i++) uvs[i] = round(uv[i], 5);

    return { position: positions, normal: normals, uv: uvs, index };
}

function findWheelGroups(root, invRoot) {
    const found = [];

    root.traverse((obj) => {
        if (!obj.isGroup || !WHEEL_NAME.test(obj.name)) return;

        let meshCount = 0;
        const box = new THREE.Box3();
        const childBox = new THREE.Box3();
        let first = true;
        obj.traverse((child) => {
            if (!child.isMesh) return;
            meshCount++;
            childBox.setFromObject(child);
            if (first) { box.copy(childBox); first = false; }
            else box.union(childBox);
        });
        if (meshCount < 4) return;

        const size = box.getSize(new THREE.Vector3());
        // A wheel is tall and long but narrow. This rejects axles, steering
        // wheels and body bones that happen to match the name pattern.
        if (size.y < 0.2 || size.z < 0.2) return;
        if (size.x > 0.9 || size.y > 1.4 || size.z > 1.4) return;

        const local = new THREE.Matrix4().multiplyMatrices(invRoot, obj.matrixWorld);
        const pivot = new THREE.Vector3().setFromMatrixPosition(local);
        if (pivot.y < -0.05 || pivot.y > 1.4) return;

        found.push({ group: obj, pivot, size });
    });

    // One group can contain a nested matching group; keep the outermost.
    return found.filter((entry, i) =>
        !found.some((other, j) => j !== i && other.group !== entry.group &&
            isAncestor(other.group, entry.group))
    );
}

function isAncestor(parent, child) {
    let node = child.parent;
    while (node) {
        if (node === parent) return true;
        node = node.parent;
    }
    return false;
}

function nameWheels(entries) {
    if (entries.length !== 4) {
        throw new Error(`expected 4 wheels, found ${entries.length}: ` +
            entries.map(e => `${e.group.name}@${e.pivot.toArray().map(v => v.toFixed(2))}`).join(', '));
    }
    const byZ = [...entries].sort((a, b) => a.pivot.z - b.pivot.z);
    const front = byZ.slice(0, 2).sort((a, b) => a.pivot.x - b.pivot.x);
    const rear = byZ.slice(2).sort((a, b) => a.pivot.x - b.pivot.x);

    // Canonical right is +X, so the lower X wheel on each axle is the left one.
    return [
        { entry: front[0], name: 'wheel_fl' },
        { entry: front[1], name: 'wheel_fr' },
        { entry: rear[0], name: 'wheel_rl' },
        { entry: rear[1], name: 'wheel_rr' }
    ];
}

async function bake(cfg) {
    const model = readJson(cfg.source);
    const loader = new VehicleLoader({});
    loader.loadModelData = async () => model;
    loader.loadTexture = () => new THREE.Texture();

    const contract = await loader.createVehicleMesh(cfg.id);
    const root = contract.root;
    root.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const candidates = findWheelGroups(root, invRoot);
    const wheels = nameWheels(candidates);
    for (const wheel of wheels) wheel.entry.group.name = wheel.name;

    const body = mergeVehicleParts(root, {
        keepGroups: wheels.map(w => w.entry.group),
        name: 'baked_body'
    });
    if (!body.merged) throw new Error('body merge produced no geometry');

    const bodyMesh = root.children.find(child => child.isMesh && child.name === 'baked_body');
    if (!bodyMesh) throw new Error('missing baked body mesh');

    const wheelData = [];
    for (const wheel of wheels) {
        mergeVehicleParts(wheel.entry.group, { name: 'baked_wheel' });
        const mesh = wheel.entry.group.children.find(child => child.isMesh && child.name === 'baked_wheel');
        if (!mesh) throw new Error(`missing baked mesh for ${wheel.name}`);
        wheelData.push({
            name: wheel.name,
            pivot: wheel.entry.pivot,
            geometry: mesh.geometry
        });
    }

    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());

    const out = {
        format: 'apex-vehicle-v1',
        version: 1,
        id: cfg.id,
        texture: `${cfg.id}.png`,
        bounds: {
            width: round(size.x, 4),
            height: round(size.y, 4),
            length: round(size.z, 4)
        },
        body: geometryData(bodyMesh.geometry),
        wheels: wheelData.map(w => ({
            name: w.name,
            pivot: w.pivot.toArray().map(v => round(v, 5)),
            geometry: geometryData(w.geometry)
        }))
    };

    fs.mkdirSync(MODEL_OUT, { recursive: true });
    fs.mkdirSync(TEX_OUT, { recursive: true });
    fs.writeFileSync(path.join(MODEL_OUT, `${cfg.id}.json`), JSON.stringify(out));
    fs.copyFileSync(path.join(ROOT, cfg.texture), path.join(TEX_OUT, `${cfg.id}.png`));

    const bodyVerts = out.body.position.length / 3;
    const wheelVerts = out.wheels.reduce((sum, w) => sum + w.geometry.position.length / 3, 0);
    return {
        id: cfg.id,
        bodyVerts,
        wheelVerts,
        wheels: out.wheels.map(w => `${w.name}@${w.pivot.join(',')}`),
        size: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`
    };
}

for (const cfg of VEHICLES) {
    const result = await bake(cfg);
    console.log(`[bake] ${result.id}: body ${result.bodyVerts} verts, ` +
        `wheels ${result.wheelVerts} verts (${result.wheels.join(' | ')}), size ${result.size}`);
}
