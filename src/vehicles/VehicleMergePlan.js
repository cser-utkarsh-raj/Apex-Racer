/**
 * Pure merge planning for voxel vehicle models.
 *
 * VehicleLoader (frozen) builds one Mesh per cube — a hypercar is ~600 draw
 * calls. This module only decides which meshes can be baked together; the
 * three.js side lives in VehicleMerger.js so the planning logic is unit
 * testable without a renderer.
 */

/**
 * @param {object} root vehicle root (THREE.Group-like)
 * @param {{ keepGroups?: Iterable<object> }} options groups to leave intact
 *        (wheels, because the game rotates them every frame)
 * @returns {{ byMaterial: Map<string, { material: object, meshes: object[] }>,
 *             removable: object[], kept: number }}
 */
export function planVehicleMerge(root, { keepGroups = [] } = {}) {
    const keep = keepGroups instanceof Set ? keepGroups : new Set(keepGroups);
    const byMaterial = new Map();
    const removable = [];
    let kept = 0;

    if (!root || typeof root.traverse !== 'function') {
        return { byMaterial, removable, kept };
    }

    root.traverse((obj) => {
        if (!obj || !obj.isMesh || !obj.geometry) return;

        // Walk up to the root: anything inside a preserved group (a wheel)
        // must keep its own transform hierarchy.
        let node = obj;
        while (node && node !== root) {
            if (keep.has(node)) {
                kept++;
                return;
            }
            node = node.parent;
        }

        const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (!material) return;

        const key = material.uuid || material;
        let bucket = byMaterial.get(key);
        if (!bucket) {
            bucket = { material, meshes: [] };
            byMaterial.set(key, bucket);
        }
        bucket.meshes.push(obj);
        removable.push(obj);
    });

    return { byMaterial, removable, kept };
}
