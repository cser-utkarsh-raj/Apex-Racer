import * as THREE from 'three';

export class RouteGraph {
    constructor(worldId) {
        this.worldId = worldId;
        this.nodes = [];
        this.currentChunkIndex = 0;
        
        // Define sockets (x, z, angle, width, elevation)
        this.currentSocket = {
            x: 0,
            z: 0,
            angle: 0, // 0 = straight ahead (-Z direction)
            width: 28,
            elevation: 0
        };

        this.generateTopology(worldId);
    }

    generateTopology(worldId) {
        // Deterministic seeded topology based on world identity
        // As requested by the user for Milestone 1 Neo-Tazader:
        // START -> multi-lane road -> intersection -> interchange -> sweeping curve -> bridge -> urban continuation

        if (worldId === 'neo_tazader') {
            this.addProceduralStraight(400); // 1. Start multi-lane road
            this.addProceduralStraight(300); // 2. Urban section with buildings
            this.addProceduralIntersection(); // 3. Intersection
            this.addRealModule('greater_kc_expressway_interchange', 400); // 4. Real highway interchange asset
            this.addProceduralCurve(-Math.PI / 4, 300); // 5. Sweeping curve left
            this.addProceduralStraight(200); 
            this.addRealModule('chiang_stone_arch_bridge', 150); // 6. Bridge/overpass (using existing bridge module)
            this.addProceduralStraight(600); // 7. Urban continuation
        } else if (worldId === 'chiang_tung') {
            this.addProceduralStraight(300);
            this.addProceduralCurve(Math.PI / 2, 400); // Hairpin right
            this.addProceduralStraight(200);
            this.addProceduralCurve(-Math.PI / 2, 400); // Hairpin left
            this.addRealModule('chiang_stone_arch_bridge', 150);
            this.addProceduralStraight(500);
        } else {
            // Default fallback
            this.addProceduralStraight(1000);
        }
    }

    addProceduralStraight(length) {
        const entry = { ...this.currentSocket };
        
        // Calculate exit based on entry angle and length
        // In Three.js, angle 0 means facing -Z
        const dx = Math.sin(entry.angle) * length;
        const dz = -Math.cos(entry.angle) * length;
        
        const exit = {
            x: entry.x + dx,
            z: entry.z + dz,
            angle: entry.angle,
            width: entry.width,
            elevation: entry.elevation
        };

        const node = {
            id: `straight_${this.nodes.length}`,
            type: 'PROCEDURAL_STRAIGHT',
            entry,
            exit,
            length,
            bounds: this.calculateOBB(entry, exit, entry.width + 16) // road + 8m shoulders
        };

        this.nodes.push(node);
        this.currentSocket = exit;
    }

    addProceduralIntersection() {
        const length = 100;
        const entry = { ...this.currentSocket };
        
        const dx = Math.sin(entry.angle) * length;
        const dz = -Math.cos(entry.angle) * length;
        
        const exit = {
            x: entry.x + dx,
            z: entry.z + dz,
            angle: entry.angle,
            width: entry.width,
            elevation: entry.elevation
        };

        const node = {
            id: `intersection_${this.nodes.length}`,
            type: 'PROCEDURAL_INTERSECTION',
            entry,
            exit,
            length,
            bounds: this.calculateOBB(entry, exit, entry.width + 40) // wide intersection bounds
        };

        this.nodes.push(node);
        this.currentSocket = exit;
    }

    addProceduralCurve(angleChange, arcLength) {
        const entry = { ...this.currentSocket };
        
        // Very basic curve calculation for node endpoints
        const exitAngle = entry.angle + angleChange;
        
        // Assuming a circular arc, the chord distance:
        const radius = arcLength / Math.abs(angleChange);
        const chordLength = 2 * radius * Math.sin(Math.abs(angleChange) / 2);
        
        const chordAngle = entry.angle + (angleChange / 2);
        const dx = Math.sin(chordAngle) * chordLength;
        const dz = -Math.cos(chordAngle) * chordLength;

        const exit = {
            x: entry.x + dx,
            z: entry.z + dz,
            angle: exitAngle,
            width: entry.width,
            elevation: entry.elevation
        };

        const node = {
            id: `curve_${this.nodes.length}`,
            type: 'PROCEDURAL_CURVE',
            entry,
            exit,
            angleChange,
            arcLength,
            radius,
            bounds: this.calculateOBB(entry, exit, entry.width + 16) // Approx bounds
        };

        this.nodes.push(node);
        this.currentSocket = exit;
    }

    addRealModule(moduleId, length) {
        const entry = { ...this.currentSocket };
        
        const dx = Math.sin(entry.angle) * length;
        const dz = -Math.cos(entry.angle) * length;
        
        const exit = {
            x: entry.x + dx,
            z: entry.z + dz,
            angle: entry.angle,
            width: entry.width,
            elevation: entry.elevation
        };

        const node = {
            id: `module_${this.nodes.length}_${moduleId}`,
            type: 'REAL_MODULE',
            moduleId: moduleId,
            entry,
            exit,
            length,
            bounds: this.calculateOBB(entry, exit, entry.width + 60) // Extra wide for large modules
        };

        this.nodes.push(node);
        this.currentSocket = exit;
    }

    calculateOBB(entry, exit, width) {
        // Simplified bounding box calculation (AABB for now to ensure strict collision)
        // A true OBB would be rotated, but an AABB covering the entire segment is safer for rejecting buildings
        const minX = Math.min(entry.x, exit.x) - (width / 2);
        const maxX = Math.max(entry.x, exit.x) + (width / 2);
        const minZ = Math.min(entry.z, exit.z) - (width / 2);
        const maxZ = Math.max(entry.z, exit.z) + (width / 2);

        return { minX, maxX, minZ, maxZ, width };
    }

    intersectsRoad(bMinX, bMaxX, bMinZ, bMaxZ) {
        // Check if building AABB intersects ANY route node's AABB
        for (const node of this.nodes) {
            const rb = node.bounds;
            if (bMinX <= rb.maxX && bMaxX >= rb.minX &&
                bMinZ <= rb.maxZ && bMaxZ >= rb.minZ) {
                return true;
            }
        }
        return false;
    }

    update(currentZ) {
        // Player drives into negative Z. currentZ is getting smaller.
        // If the end of the graph is within 2500 units, generate more!
        const lastNode = this.nodes[this.nodes.length - 1];
        if (lastNode && lastNode.exit.z > currentZ - 2500) {
            
            // Randomly extend the road
            const r = Math.random();
            if (r > 0.85) {
                this.addProceduralStraight(600);
                this.addProceduralCurve(Math.PI / 2, 400); // Right
                this.addProceduralStraight(400);
                this.addProceduralCurve(-Math.PI / 2, 400); // Left
            } else if (r > 0.70) {
                this.addProceduralStraight(600);
                this.addProceduralCurve(-Math.PI / 2, 400); // Left
                this.addProceduralStraight(400);
                this.addProceduralCurve(Math.PI / 2, 400); // Right
            } else if (r > 0.55) {
                this.addProceduralIntersection();
                this.addProceduralStraight(1200);
            } else {
                this.addProceduralStraight(1000);
            }
        }
    }
}
