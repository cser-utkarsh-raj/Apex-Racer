import * as THREE from 'three';

/**
 * Vegetation — instanced 3D trees placed on the baked terrain.
 *
 * The Minecraft maps already contain blocky tree columns, but from a car they
 * read as flat green walls. Adding real silhouettes (trunks + layered canopy)
 * at the same spots gives the verges depth, scale and a believable horizon.
 * One InstancedMesh per streamed tile, two draw calls for the whole forest.
 */

let coniferGeometry = null;
let broadleafGeometry = null;
let shadowGeometry = null;
let shadowMaterial = null;
let hedgeGeometry = null;
let hedgeMaterial = null;

function mergeParts(parts) {
    const positions = [];
    const normals = [];
    const colors = [];
    for (const { geometry, color } of parts) {
        const geo = geometry.index ? geometry.toNonIndexed() : geometry;
        const pos = geo.attributes.position.array;
        const nrm = geo.attributes.normal.array;
        for (let i = 0; i < pos.length; i += 3) {
            positions.push(pos[i], pos[i + 1], pos[i + 2]);
            normals.push(nrm[i], nrm[i + 1], nrm[i + 2]);
            colors.push(color.r, color.g, color.b);
        }
        if (geo !== geometry) geo.dispose();
        geometry.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    out.computeBoundingSphere();
    return out;
}

function shift(geometry, x, y, z) {
    geometry.translate(x, y, z);
    return geometry;
}

/** Spruce / pine: narrow trunk and three staggered cone skirts. */
export function getConiferGeometry() {
    if (coniferGeometry) return coniferGeometry;
    const trunk = new THREE.Color(0x4a3524);
    const dark = new THREE.Color(0x24452a);
    const mid = new THREE.Color(0x2f5a33);
    const light = new THREE.Color(0x3d7040);
    const parts = [
        { geometry: shift(new THREE.CylinderGeometry(0.20, 0.28, 2.6, 6, 1), 0, 1.3, 0), color: trunk },
        { geometry: shift(new THREE.ConeGeometry(2.5, 3.6, 7, 1), 0, 3.6, 0), color: dark },
        { geometry: shift(new THREE.ConeGeometry(1.95, 3.2, 7, 1), 0, 5.2, 0), color: mid },
        { geometry: shift(new THREE.ConeGeometry(1.3, 2.6, 7, 1), 0, 6.8, 0), color: light },
        { geometry: shift(new THREE.ConeGeometry(0.65, 1.6, 6, 1), 0, 8.2, 0), color: light }
    ];
    coniferGeometry = mergeParts(parts);
    return coniferGeometry;
}

/** Broadleaf: trunk with three overlapping icosahedron crowns. */
export function getBroadleafGeometry() {
    if (broadleafGeometry) return broadleafGeometry;
    const trunk = new THREE.Color(0x4e3a26);
    const dark = new THREE.Color(0x2e4f26);
    const mid = new THREE.Color(0x3d682e);
    const light = new THREE.Color(0x4f7c36);
    const parts = [
        { geometry: shift(new THREE.CylinderGeometry(0.24, 0.36, 3.2, 6, 1), 0, 1.6, 0), color: trunk },
        { geometry: shift(new THREE.IcosahedronGeometry(2.3, 1), 0, 4.5, 0), color: dark },
        { geometry: shift(new THREE.IcosahedronGeometry(1.8, 1), 1.2, 5.3, 0.4), color: mid },
        { geometry: shift(new THREE.IcosahedronGeometry(1.7, 1), -1.0, 5.5, -0.5), color: light },
        { geometry: shift(new THREE.IcosahedronGeometry(1.35, 1), 0.1, 6.4, 0.2), color: light }
    ];
    broadleafGeometry = mergeParts(parts);
    return broadleafGeometry;
}

export function disposeVegetationGeometry() {
    if (coniferGeometry) coniferGeometry.dispose();
    if (broadleafGeometry) broadleafGeometry.dispose();
    if (shadowGeometry) shadowGeometry.dispose();
    if (hedgeGeometry) hedgeGeometry.dispose();
    coniferGeometry = null;
    broadleafGeometry = null;
    shadowGeometry = null;
    hedgeGeometry = null;
}

/**
 * Low, irregular hedge/bush row hugging the verge. This is the layer that
 * makes a road feel cut through a place rather than dropped on a plain.
 */
export function buildRoadsideHedges(route, style) {
    const veg = style.vegetation;
    if (!veg || veg.hedges === false) return null;

    const spacing = veg.hedgeSpacing ?? 4.2;
    const offset = style.road.width / 2 + style.road.shoulder + (style.road.sidewalk || 0) + 1.8;

    if (!hedgeGeometry) {
        const parts = [
            { geometry: shift(new THREE.IcosahedronGeometry(1.15, 1), 0, 0.85, 0), color: new THREE.Color(0x2c4f24) },
            { geometry: shift(new THREE.IcosahedronGeometry(0.95, 1), 0.9, 0.95, 0.2), color: new THREE.Color(0x365f2b) },
            { geometry: shift(new THREE.IcosahedronGeometry(0.9, 1), -0.85, 0.8, -0.1), color: new THREE.Color(0x27461f) }
        ];
        hedgeGeometry = mergeParts(parts);
        hedgeMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.94,
            metalness: 0
        });
        hedgeMaterial.envMapIntensity = 0.3;
    }

    const mats = [];
    let side = 1;
    for (let z = route.zMin + 4; z < route.zMax; z += spacing) {
        const s = route.atZ(z);
        const jitter = (hashCell(Math.floor(z / spacing), side, 23) - 0.5) * 1.4;
        if (hashCell(Math.floor(z / spacing), side, 29) < 0.16) { side *= -1; continue; }
        const scale = 0.8 + hashCell(Math.floor(z / spacing), side, 31) * 0.9;
        mats.push({
            x: s.x + side * (offset + jitter),
            y: s.y + 0.02,
            z: z + (hashCell(Math.floor(z / spacing), side, 37) - 0.5) * 1.6,
            sx: scale * (0.9 + hashCell(0, z, 43) * 0.5),
            sy: scale * (0.42 + hashCell(0, z, 47) * 0.28),
            rot: hashCell(0, z, 53) * Math.PI * 2
        });
        side *= -1;
    }
    if (!mats.length) return null;

    const mesh = new THREE.InstancedMesh(hedgeGeometry, hedgeMaterial, mats.length);
    mesh.name = 'roadside_hedges';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sharedGeometry = true;

    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        p.set(m.x, m.y, m.z);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, m.rot);
        scl.set(m.sx, m.sy, m.sx);
        matrix.compose(p, q, scl);
        mesh.setMatrixAt(i, matrix);
        const t = 0.86 + hashCell(i, 7, 59) * 0.3;
        col.setRGB(t * 0.92, t, t * 0.84);
        mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
}

function hashCell(x, z, salt = 0) {
    let h = (x * 374761393 + z * 668265263 + salt * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Build one tile's trees. Returns null when the style disables vegetation or
 * the tile has no suitable ground.
 */
export function buildTileVegetation(tile, ctx) {
    const { manifest, route, tx, tz, palette, style, material } = ctx;
    const veg = style.vegetation;
    if (!veg || !(veg.density > 0) || !material) return null;

    const cols = manifest.tiles.cols;
    const step = manifest.step;
    const ox = manifest.origin.x + tx * cols * step;
    const oz = manifest.origin.z + tz * cols * step;
    const half = style.road.width / 2 + style.road.shelf + 2.5;
    const heights = tile.heights;
    // The manifest water level is only meaningful when it sits below the baked
    // route; some maps carry a decorative sea level above the road.
    const routeMinY = route.points.reduce((min, p) => Math.min(min, p.y), Infinity);
    const waterLevel = (manifest.waterLevel !== null && manifest.waterLevel !== undefined &&
        manifest.waterLevel < routeMinY - 1.0) ? manifest.waterLevel : null;
    const colors = tile.colors;

    const placements = [];
    const max = veg.maxInstances ?? 420;

    for (let cz = 1; cz < cols - 1; cz++) {
        const wz = oz + (cz + 0.5) * step;
        const centre = route.empty ? null : route.atZ(wz);
        for (let cx = 1; cx < cols - 1; cx++) {
            if (placements.length >= max) break;
            const i = cz * cols + cx;
            const h = heights[i];
            if (h === -32768) continue;
            if (waterLevel !== null && h <= waterLevel + 0.8) continue;

            const wx = ox + (cx + 0.5) * step;
            if (centre && Math.abs(wx - centre.x) < half) continue;

            const p = palette[colors[i]];
            if (!p) continue;
            const [r, g, b] = p;
            if (!(g > r * 1.04 && g > b * 1.08)) continue;

            // Skip cliffs and roofs: a tree needs a reasonably flat footing.
            const slope = Math.max(
                Math.abs(h - heights[i - 1]),
                Math.abs(h - heights[i + 1]),
                Math.abs(h - heights[i - cols]),
                Math.abs(h - heights[i + cols])
            );
            if (slope > 1.6) continue;

            const rnd = hashCell(cx + tx * cols, cz + tz * cols, 17);
            if (rnd > veg.density) continue;

            // Natural woods grow in clumps with clearings, not a plantation grid.
            const cluster = hashCell(Math.floor((cx + tx * cols) / 7), Math.floor((cz + tz * cols) / 7), 5);
            if (cluster < 0.26) continue;

            const scale = (veg.min ?? 0.75) + hashCell(cx, cz, 91) * ((veg.max ?? 1.35) - (veg.min ?? 0.75));
            placements.push({
                x: wx - ox,
                y: h,
                z: wz - oz,
                scale,
                rot: hashCell(cx, cz, 41) * Math.PI * 2,
                tint: 0.86 + hashCell(cx, cz, 53) * 0.28,
                broadleaf: veg.type === 'mixed'
                    ? hashCell(cx, cz, 71) < 0.52
                    : veg.type !== 'conifer'
            });
        }
    }

    if (!placements.length) return null;

    const buildMesh = (type, list) => {
        if (!list.length) return null;
        const geometry = type === 'conifer' ? getConiferGeometry() : getBroadleafGeometry();
        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        mesh.name = `vegetation_${type}_${tx}_${tz}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.sharedGeometry = true;

        const matrix = new THREE.Matrix4();
        const quat = new THREE.Quaternion();
        const pos = new THREE.Vector3();
        const scl = new THREE.Vector3();
        const col = new THREE.Color();
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            pos.set(t.x, t.y, t.z);
            quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot);
            scl.set(t.scale, t.scale * (type === 'conifer' ? 1.0 : 0.94), t.scale);
            matrix.compose(pos, quat, scl);
            mesh.setMatrixAt(i, matrix);
            if (type === 'conifer') {
                col.setRGB(t.tint * 0.84, t.tint * 0.98, t.tint * 0.90);
            } else {
                col.setRGB(t.tint * 0.98, t.tint * 1.02, t.tint * 0.78);
            }
            mesh.setColorAt(i, col);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        return mesh;
    };

    const conifers = placements.filter(p => !p.broadleaf);
    const broadleaves = placements.filter(p => p.broadleaf);

    const addShadowDiscs = (group) => {
        if (!shadowGeometry) {
            shadowGeometry = new THREE.CircleGeometry(1, 14);
            shadowGeometry.rotateX(-Math.PI / 2);
            shadowMaterial = new THREE.MeshBasicMaterial({
                color: 0x05070a,
                transparent: true,
                opacity: 0.32,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2
            });
        }
        const discs = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, placements.length);
        discs.name = `vegetation_shadow_${tx}_${tz}`;
        discs.renderOrder = 1;
        discs.userData.sharedGeometry = true;
        const matrix = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        for (let i = 0; i < placements.length; i++) {
            const t = placements[i];
            p.set(t.x, t.y + 0.04, t.z);
            q.identity();
            s.set(1.5 * t.scale, 1, 1.5 * t.scale);
            matrix.compose(p, q, s);
            discs.setMatrixAt(i, matrix);
        }
        discs.instanceMatrix.needsUpdate = true;
        discs.computeBoundingSphere();
        group.add(discs);
    };

    if (!conifers.length || !broadleaves.length) {
        const mesh = buildMesh(conifers.length ? 'conifer' : 'broadleaf', placements);
        if (mesh) {
            const group = new THREE.Group();
            group.name = `vegetation_${tx}_${tz}`;
            group.add(mesh);
            addShadowDiscs(group);
            group.count = placements.length;
            return group;
        }
        return null;
    }

    const group = new THREE.Group();
    group.name = `vegetation_${tx}_${tz}`;
    const a = buildMesh('conifer', conifers);
    const b = buildMesh('broadleaf', broadleaves);
    if (a) group.add(a);
    if (b) group.add(b);
    addShadowDiscs(group);
    group.count = placements.length;
    return group;
}
