import * as THREE from 'three';

/**
 * RoadExtruder.js — Smooth Marked Asphalt Meshes with Painted Lanes, Curbs & Crosswalks
 */
export class RoadExtruder {
    constructor() {
        this.materials = {
            asphalt: new THREE.MeshStandardMaterial({
                color: 0x181a1f,
                roughness: 0.8,
                metalness: 0.1
            }),
            curb: new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.9
            }),
            yellowLine: new THREE.MeshBasicMaterial({
                color: 0xffcc00
            }),
            whiteLine: new THREE.MeshBasicMaterial({
                color: 0xffffff
            }),
            grass: new THREE.MeshStandardMaterial({
                color: 0x2d4c1e,
                roughness: 0.95
            }),
            crosswalk: new THREE.MeshBasicMaterial({
                color: 0xeeeeee
            })
        };
    }
    
    buildRoadNetwork(roads) {
        const group = new THREE.Group();
        group.name = "road_network";
        
        roads.forEach(road => {
            const mesh = this.createRoadMesh(road);
            if (mesh) group.add(mesh);
        });
        
        return group;
    }
    
    createRoadMesh(road) {
        const group = new THREE.Group();
        
        const dx = road.endX - road.startX;
        const dz = road.endZ - road.startZ;
        const len = Math.hypot(dx, dz);
        if (len === 0) return null;
        
        const angle = Math.atan2(dx, dz);
        const midX = (road.startX + road.endX) / 2;
        const midZ = (road.startZ + road.endZ) / 2;
        
        // 1. Asphalt Deck
        const roadGeo = new THREE.PlaneGeometry(road.width, len);
        roadGeo.rotateX(-Math.PI / 2);
        const roadMesh = new THREE.Mesh(roadGeo, this.materials.asphalt);
        roadMesh.position.set(0, 0.05, 0);
        roadMesh.receiveShadow = true;
        group.add(roadMesh);
        
        // 2. Concrete Curbs / Shoulders
        const curbWidth = 1.2;
        const curbGeo = new THREE.BoxGeometry(curbWidth, 0.25, len);
        
        const leftCurb = new THREE.Mesh(curbGeo, this.materials.curb);
        leftCurb.position.set(-(road.width / 2 + curbWidth / 2), 0.12, 0);
        group.add(leftCurb);
        
        const rightCurb = new THREE.Mesh(curbGeo, this.materials.curb);
        rightCurb.position.set(road.width / 2 + curbWidth / 2, 0.12, 0);
        group.add(rightCurb);
        
        // 3. Yellow Shoulder Lines
        const yellowLineGeo = new THREE.PlaneGeometry(0.35, len);
        yellowLineGeo.rotateX(-Math.PI / 2);
        
        const leftYellow = new THREE.Mesh(yellowLineGeo, this.materials.yellowLine);
        leftYellow.position.set(-(road.width / 2 - 0.8), 0.07, 0);
        group.add(leftYellow);
        
        const rightYellow = new THREE.Mesh(yellowLineGeo, this.materials.yellowLine);
        rightYellow.position.set(road.width / 2 - 0.8, 0.07, 0);
        group.add(rightYellow);
        
        // 4. Center Double-Yellow Divider (for 2-lane roads)
        const laneCount = typeof road.lanes === 'number' ? road.lanes : 2;
        
        if (laneCount <= 2) {
            // Double yellow center line
            const cy1Geo = new THREE.PlaneGeometry(0.18, len);
            cy1Geo.rotateX(-Math.PI / 2);
            const cy1 = new THREE.Mesh(cy1Geo, this.materials.yellowLine);
            cy1.position.set(-0.25, 0.07, 0);
            group.add(cy1);
            
            const cy2Geo = new THREE.PlaneGeometry(0.18, len);
            cy2Geo.rotateX(-Math.PI / 2);
            const cy2 = new THREE.Mesh(cy2Geo, this.materials.yellowLine);
            cy2.position.set(0.25, 0.07, 0);
            group.add(cy2);
        }
        
        // 5. Dashed White Lane Dividers (FIXED: lanes is an integer, not an array)
        if (laneCount > 2) {
            const usableWidth = road.width - 3.2; // Inside the shoulder lines
            const laneWidth = usableWidth / laneCount;
            
            // Center double-yellow (separating directions)
            const cy1Geo = new THREE.PlaneGeometry(0.18, len);
            cy1Geo.rotateX(-Math.PI / 2);
            const cy1 = new THREE.Mesh(cy1Geo, this.materials.yellowLine);
            cy1.position.set(-0.25, 0.07, 0);
            group.add(cy1);
            
            const cy2Geo = new THREE.PlaneGeometry(0.18, len);
            cy2Geo.rotateX(-Math.PI / 2);
            const cy2 = new THREE.Mesh(cy2Geo, this.materials.yellowLine);
            cy2.position.set(0.25, 0.07, 0);
            group.add(cy2);
            
            // White dashed dividers between same-direction lanes
            const halfLanes = Math.floor(laneCount / 2);
            for (let side = -1; side <= 1; side += 2) {
                for (let i = 1; i < halfLanes; i++) {
                    const offset = side * (i * laneWidth + 0.5);
                    const dashCount = Math.floor(len / 10);
                    for (let d = 0; d < dashCount; d++) {
                        const dashGeo = new THREE.PlaneGeometry(0.22, 3.5);
                        dashGeo.rotateX(-Math.PI / 2);
                        const dashMesh = new THREE.Mesh(dashGeo, this.materials.whiteLine);
                        const t = (d + 0.5) / dashCount;
                        dashMesh.position.set(offset, 0.07, -len / 2 + t * len);
                        group.add(dashMesh);
                    }
                }
            }
        }
        
        // 6. Crosswalk Markings at road start and end
        if (len > 60) {
            for (const zPos of [-len / 2 + 3, len / 2 - 3]) {
                for (let s = 0; s < 6; s++) {
                    const stripeGeo = new THREE.PlaneGeometry(road.width * 0.6 / 6, 0.6);
                    stripeGeo.rotateX(-Math.PI / 2);
                    const stripe = new THREE.Mesh(stripeGeo, this.materials.crosswalk);
                    const xOff = -road.width * 0.3 + (s + 0.5) * (road.width * 0.6 / 6);
                    stripe.position.set(xOff, 0.07, zPos);
                    group.add(stripe);
                }
            }
        }
        
        group.position.set(midX, 0, midZ);
        group.rotation.y = angle;
        
        return group;
    }
}
