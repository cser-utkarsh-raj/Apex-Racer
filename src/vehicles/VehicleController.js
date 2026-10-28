import * as THREE from 'three';
import { VehiclePhysics } from './VehiclePhysics.js';

export class VehicleController {
    constructor(game, id, mesh, isAI = false) {
        this.game = game;
        this.id = id;
        this.mesh = mesh;
        this.isAI = isAI;
        
        // Physics solver
        const specs = game.vehicleLoader.getSpecs(id);
        this.physics = new VehiclePhysics(game, specs);
        
        // Wheels reference for animation
        this.wheels = {
            fl: [],
            fr: [],
            rl: [],
            rr: []
        };
        
        // Find wheel bones
        this.findWheelBones();
        
        // AI control overrides
        this.aiControls = {
            throttle: false,
            brake: false,
            steerLeft: false,
            steerRight: false,
            handbrake: false,
            nitro: false
        };
        
        // Visual effects (particles/trails)
        this.smokeParticles = null;
        this.initSmokeParticles();
        
        // Headlights and brake lights
        this.initLights();
    }
    
    setPosition(x, y, z) {
        this.physics.x = x;
        this.physics.y = y;
        this.physics.z = z;
        this.mesh.position.set(x, y, z);
    }
    
    setRotation(rx, ry, rz) {
        this.physics.angle = ry;
        this.mesh.rotation.set(rx, ry, rz);
    }
    
    findWheelBones() {
        this.mesh.traverse(child => {
            if (child.isGroup && (child.name.toLowerCase().includes('wheel') || child.name.toLowerCase().includes('pneu'))) {
                const name = child.name.toLowerCase();
                
                if (name.includes('fl') || (name.includes('front') && name.includes('left')) || name === 'pneu1') {
                    this.wheels.fl.push(child);
                } else if (name.includes('fr') || (name.includes('front') && name.includes('right')) || name === 'pneu2') {
                    this.wheels.fr.push(child);
                } else if (name.includes('rl') || (name.includes('rear') && name.includes('left')) || (name.includes('back') && name.includes('left')) || name === 'pneu3') {
                    this.wheels.rl.push(child);
                } else if (name.includes('rr') || (name.includes('rear') && name.includes('right')) || (name.includes('back') && name.includes('right')) || name === 'pneu4') {
                    this.wheels.rr.push(child);
                }
            }
        });
        
        console.log(`Auto-discovered wheels for ${this.id}: FL=${this.wheels.fl.length}, FR=${this.wheels.fr.length}, RL=${this.wheels.rl.length}, RR=${this.wheels.rr.length}`);
    }
    
    initSmokeParticles() {
        // Simple particle system for tire smoke and nitro fire
        const pCount = 50;
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(pCount * 3);
        const sizes = new Float32Array(pCount);
        const alphas = new Float32Array(pCount);
        
        for (let i = 0; i < pCount; i++) {
            sizes[i] = 0;
            alphas[i] = 0;
        }
        
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        
        // Custom material with fade outs
        const mat = new THREE.PointsMaterial({
            color: 0xcccccc,
            size: 0.8,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
        });
        
        this.smokeParticles = new THREE.Points(geom, mat);
        this.game.world.scene.add(this.smokeParticles);
        
        this.particleData = [];
        for (let i = 0; i < pCount; i++) {
            this.particleData.push({
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0,
                maxLife: 1.0,
                colorType: 'smoke' // smoke, fire
            });
        }
    }
    
    emitParticle(x, y, z, vx, vy, vz, colorType) {
        // Find dead particle
        const p = this.particleData.find(pd => pd.life <= 0);
        if (p) {
            p.x = x; p.y = y; p.z = z;
            p.vx = vx; p.vy = vy; p.vz = vz;
            p.life = 1.0;
            p.maxLife = 0.5 + Math.random() * 0.5;
            p.colorType = colorType;
        }
    }
    
    updateParticles(delta) {
        const posAttr = this.smokeParticles.geometry.attributes.position;
        const positions = posAttr.array;
        
        for (let i = 0; i < this.particleData.length; i++) {
            const p = this.particleData[i];
            if (p.life > 0) {
                p.life -= delta;
                
                // Update physics
                p.x += p.vx * delta;
                p.y += p.vy * delta;
                p.z += p.vz * delta;
                
                p.vy += delta * 1.5; // slowly float up
                
                // Map to buffer
                const idx = i * 3;
                positions[idx] = p.x;
                positions[idx + 1] = p.y;
                positions[idx + 2] = p.z;
            } else {
                // hide offscreen
                const idx = i * 3;
                positions[idx] = 9999;
                positions[idx + 1] = 9999;
                positions[idx + 2] = 9999;
            }
        }
        
        posAttr.needsUpdate = true;
    }
    
    update(delta) {
        // 1. Gather controls inputs
        let controls = this.aiControls;
        
        if (!this.isAI) {
            // Player controls mapping
            controls = {
                throttle: this.game.isKeyPressed('w') || this.game.isKeyPressed('arrowup'),
                brake: this.game.isKeyPressed('s') || this.game.isKeyPressed('arrowdown'),
                steerLeft: this.game.isKeyPressed('a') || this.game.isKeyPressed('arrowleft'),
                steerRight: this.game.isKeyPressed('d') || this.game.isKeyPressed('arrowright'),
                handbrake: this.game.isKeyPressed(' ') || this.game.isKeyPressed('space'),
                nitro: this.game.isKeyPressed('shift')
            };
        }
        
        // 2. Solve physics
        this.physics.update(delta, controls);
        
        // 3. Sync visual mesh positioning
        this.mesh.position.set(this.physics.x, this.physics.y, this.physics.z);
        this.mesh.rotation.y = this.physics.angle;
        
        // 4. Animate wheels
        this.animateWheels(delta, controls);
        
        // 5. Emit particle smoke/fire
        this.handleSmokeEmission(delta);
        
        // 6. Update vehicle lights (headlights on at night, brake lights glow red when braking)
        const isNight = Math.cos(this.game.world.sunAngle) < -0.1;
        
        this.headlightL.spotLight.visible = isNight;
        this.headlightR.spotLight.visible = isNight;
        this.headlightL.glow.visible = isNight;
        this.headlightR.glow.visible = isNight;
        
        const isBraking = controls.brake;
        const col = isBraking ? 0xff2222 : (isNight ? 0x660000 : 0x110000);
        this.brakeLightMat.color.setHex(col);
    }
    
    animateWheels(delta, controls) {
        const speed = this.physics.speed;
        
        // Spin angle: proportional to speed and direction (forward/reverse)
        const forward = this.physics.vx * Math.sin(this.physics.angle) + this.physics.vz * Math.cos(this.physics.angle);
        const dir = forward >= 0 ? 1 : -1;
        const spinDelta = speed * 1.2 * delta * dir;
        
        // Steering angle: target is proportional to steer input
        let steerTarget = 0;
        if (controls.steerLeft) steerTarget = 0.45;      // 25 degrees left
        if (controls.steerRight) steerTarget = -0.45;    // 25 degrees right
        
        // Helper to check if model bones are rotated by visual_root
        const isRotated = (w) => {
            let p = w.parent;
            while (p) {
                if (p.name === 'visual_root') return true;
                p = p.parent;
            }
            return false;
        };
        
        // FL & FR: Spin and Steer
        const spinWheel = (w, isFront) => {
            const rotMult = isRotated(w) ? -1 : 1;
            w.rotation.x += spinDelta * rotMult; // spin around X-axis (inverted if 180 rotated)
            
            if (isFront) {
                // steer around Y-axis (inverted if 180 rotated)
                w.rotation.y = THREE.MathUtils.lerp(w.rotation.y, steerTarget * rotMult, delta * 10.0);
            }
        };
        
        this.wheels.fl.forEach(w => spinWheel(w, true));
        this.wheels.fr.forEach(w => spinWheel(w, true));
        
        // RL & RR: Spin only
        this.wheels.rl.forEach(w => spinWheel(w, false));
        this.wheels.rr.forEach(w => spinWheel(w, false));
    }
    
    handleSmokeEmission(delta) {
        // Emit smoke during drifts or when nitro is active
        const forwardX = Math.sin(this.physics.angle);
        const forwardZ = Math.cos(this.physics.angle);
        
        // Wheels positions (out of center offset)
        const rx = Math.cos(this.physics.angle);
        const rz = -Math.sin(this.physics.angle);
        
        const rearLeftPos = new THREE.Vector3(
            this.physics.x - forwardX * 1.2 - rx * 0.8,
            this.physics.y + 0.15,
            this.physics.z - forwardZ * 1.2 - rz * 0.8
        );
        const rearRightPos = new THREE.Vector3(
            this.physics.x - forwardX * 1.2 + rx * 0.8,
            this.physics.y + 0.15,
            this.physics.z - forwardZ * 1.2 + rz * 0.8
        );
        
        // Drift smoke
        if (this.physics.isDrifting && this.physics.speed > 5) {
            // Emit from rear wheels
            this.emitParticle(
                rearLeftPos.x, rearLeftPos.y, rearLeftPos.z,
                (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2,
                'smoke'
            );
            this.emitParticle(
                rearRightPos.x, rearRightPos.y, rearRightPos.z,
                (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2,
                'smoke'
            );
        }
        
        // Nitro fire
        if (this.physics.isNitroActive) {
            // Emit from exhaust pipe position (center rear)
            const exhaustPos = new THREE.Vector3(
                this.physics.x - forwardX * 1.5,
                this.physics.y + 0.3,
                this.physics.z - forwardZ * 1.5
            );
            // Fire sparks heading backwards
            this.emitParticle(
                exhaustPos.x, exhaustPos.y, exhaustPos.z,
                -forwardX * 15 + (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 2,
                -forwardZ * 15 + (Math.random() - 0.5) * 3,
                'fire'
            );
        }
        
        this.updateParticles(delta);
    }
    
    initLights() {
        // Target object positioned ahead of car
        const target = new THREE.Object3D();
        target.position.set(0, 0, 20.0);
        this.mesh.add(target);
        
        const createHeadlight = (xOffset) => {
            const spotLight = new THREE.SpotLight(0xfffaeb, 4.0, 50, Math.PI / 5, 0.5, 1.0);
            spotLight.position.set(xOffset, 0.4, 1.5);
            spotLight.target = target;
            spotLight.castShadow = true;
            spotLight.shadow.bias = -0.0005;
            this.mesh.add(spotLight);
            
            // Visual emissive bulb
            const geo = new THREE.BoxGeometry(0.2, 0.15, 0.1);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const glow = new THREE.Mesh(geo, mat);
            glow.position.set(xOffset, 0.4, 1.55);
            this.mesh.add(glow);
            
            return { spotLight, glow };
        };
        
        this.headlightL = createHeadlight(-0.6);
        this.headlightR = createHeadlight(0.6);
        
        // Shared brake lights material
        this.brakeLightMat = new THREE.MeshBasicMaterial({ color: 0x110000 });
        
        const createBrakeLight = (xOffset) => {
            const geo = new THREE.BoxGeometry(0.2, 0.15, 0.1);
            const mesh = new THREE.Mesh(geo, this.brakeLightMat);
            mesh.position.set(xOffset, 0.5, -1.6);
            this.mesh.add(mesh);
            return mesh;
        };
        
        this.brakeLightL = createBrakeLight(-0.6);
        this.brakeLightR = createBrakeLight(0.6);
    }
}
