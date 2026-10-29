/**
 * VehicleMerger — bakes a voxel vehicle's hundreds of cube meshes into one
 * mesh per material. VehicleLoader (frozen contract) still builds the model
 * exactly as before; this runs afterwards on the returned group.
 *
 * Wheels are passed in as `keepGroups` for the player car so the per-frame
 * wheel spin/steer animation keeps working. Traffic cars merge everything.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planVehicleMerge } from './VehicleMergePlan.js';

/**
 * @param {THREE.Group} root vehicle root returned by VehicleLoader
 * @param {{ keepGroups?: Iterable<THREE.Object3D>, name?: string }} options
 * @returns {{ merged: number, removed: number, kept: number }}
 */
export function mergeVehicleParts(root, { keepGroups = [], name = 'merged_parts' } = {}) {
    const plan = planVehicleMerge(root, { keepGroups });
    if (!root || !plan.removable.length) {
        return { merged: 0, removed: 0, kept: plan.kept };
    }

    root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const local = new THREE.Matrix4();
    let merged = 0;
    let removed = 0;

    for (const bucket of plan.byMaterial.values()) {
        const geometries = [];
        for (const mesh of bucket.meshes) {
            mesh.updateMatrixWorld(true);
            const geometry = mesh.geometry.clone();
            local.multiplyMatrices(rootInverse, mesh.matrixWorld);
            geometry.applyMatrix4(local);
            geometries.push(geometry);
        }

        const combined = mergeGeometries(geometries, false);
        for (const geometry of geometries) geometry.dispose?.();
        if (!combined) continue;

        const mesh = new THREE.Mesh(combined, bucket.material);
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);

        // Only drop the source cubes once their bucket merged successfully.
        for (const source of bucket.meshes) {
            if (source.parent) source.parent.remove(source);
            removed++;
        }
        merged++;
    }

    return { merged, removed, kept: plan.kept };
}
