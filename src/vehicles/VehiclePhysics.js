import * as THREE from 'three';

/**
 * VehiclePhysics.js — Canonical APEX Arcade Vehicle Physics
 * 
 * CONTRACT:
 * - FORWARD = -Z in local vehicle space
 * - Heading is defined by `angle` (radians)
 * - forwardX = -Math.sin(angle), forwardZ = -Math.cos(angle)
 * - Speed is scalar velocity in m/s (positive = forward, negative = reverse)
 * - Stable Ackermann-style arcade steering with absolute yaw rate cap
 * - No oscillation at any speed
 */
export class VehiclePhysics {
    constructor(game, specs = {}) {
        this.game = game;
        
        this.specs = Object.assign({
            topSpeed: 320,        // km/h
            acceleration: 33,     // m/s^2 launch torque (reduced from 44)
            brakeForce: 65,       // m/s^2 braking
            reverseSpeed: 70,     // km/h
            handling: 1.35,       // steering responsiveness
            driftGrip: 0.86,      // lateral drift traction
            nitroMultiplier: 1.45 // nitro boost multiplier
        }, specs);
        
        // Transform State
        this.x = 0;
        this.y = 0.05;
        this.z = 0;
        this.angle = 0; // heading in radians (0 = facing -Z)
        
        // Velocities
        this.speed = 0; // m/s forward (+ = forward along -Z, - = reverse)
        this.vx = 0;
        this.vz = 0;
        this.steerAngle = 0; // Front wheel visual steer angle
        this.steerInput = 0; // Raw normalized input [-1, +1]
        
        // Engine & Telemetry
        this.gear = 1;
        this.rpm = 900;
        this.idleRpm = 900;
        this.isDrifting = false;
        this.isNitroActive = false;
    }
    
    update(delta, controls) {
        if (delta <= 0) return;
        delta = Math.min(delta, 0.05); // Prevent frame spike artifacts
        
        const topSpeedMs = (this.specs.topSpeed * 0.27778);
        const reverseTopMs = (this.specs.reverseSpeed * 0.27778);
        
        // 1. Throttle, Reverse & Braking
        if (controls.throttle) {
            if (this.speed < -0.5) {
                // Braking out of reverse
                this.speed += this.specs.brakeForce * delta;
            } else {
                let accel = this.specs.acceleration;
                if (controls.nitro) {
                    accel *= this.specs.nitroMultiplier;
                    this.isNitroActive = true;
                } else {
                    this.isNitroActive = false;
                }
                
                // Power curve with exponential drag above 250 km/h
                const speedRatio = Math.max(0, this.speed / topSpeedMs);
                const powerFactor = Math.max(0.15, 1.0 - Math.pow(speedRatio, 1.8));
                this.speed = Math.min(topSpeedMs, this.speed + accel * powerFactor * delta);
            }
        } else if (controls.brake) {
            this.isNitroActive = false;
            if (this.speed > 0.5) {
                // Braking while moving forward
                this.speed = Math.max(0, this.speed - this.specs.brakeForce * delta);
            } else {
                // Reverse acceleration
                this.speed = Math.max(-reverseTopMs, this.speed - (this.specs.acceleration * 0.55) * delta);
            }
        } else {
            this.isNitroActive = false;
            // Rolling resistance + air drag
            const speedKmhAbs = Math.abs(this.speed) / 0.27778;
            const baseDrag = 12.0;
            const airDrag = speedKmhAbs > 200 ? (speedKmhAbs - 200) * 0.08 : 0;
            const drag = (baseDrag + airDrag) * delta;
            if (Math.abs(this.speed) < drag) {
                this.speed = 0;
            } else {
                this.speed -= Math.sign(this.speed) * drag;
            }
        }
        
        // 2. Stable Progressive Arcade Steering
        const speedKmh = Math.abs(this.speed) / 0.27778;
        
        // Dynamic steering responsiveness: agile at parking/city speeds, smooth on highway
        const steerSpeedFactor = Math.max(0.45, 1.0 - (speedKmh / 320) * 0.55);
        const steerRate = 4.2 * steerSpeedFactor;
        
        // Smooth steer input accumulation with progressive easing
        if (controls.steerLeft) {
            this.steerInput = Math.min(1.0, this.steerInput + steerRate * delta);
        } else if (controls.steerRight) {
            this.steerInput = Math.max(-1.0, this.steerInput - steerRate * delta);
        } else {
            // Rapid auto-centering return spring for rock-solid stability
            this.steerInput = THREE.MathUtils.lerp(this.steerInput, 0, delta * 13.0);
            if (Math.abs(this.steerInput) < 0.001) this.steerInput = 0;
        }
        
        // Visual wheel steer (capped smaller for visual fidelity)
        this.steerAngle = this.steerInput * 0.35;
        
        // 3. Stable Yaw Rate Calculation
        const isHandbrake = controls.handbrake && speedKmh > 20;
        this.isDrifting = isHandbrake;
        
        if (Math.abs(this.speed) > 0.3) {
            // Speed curve: gentle at very low speed, peaks at ~50 km/h, progressively tapers at highway speeds
            const normalizedSpeed = Math.min(speedKmh / 45.0, 1.0);
            const highSpeedTaper = Math.max(0.28, 1.0 - Math.pow(Math.max(0, speedKmh - 75) / 240, 1.1));
            
            // Base turn rate scaled by vehicle handling spec
            const baseTurnRate = 0.72 * (this.specs.handling || 1.0);
            let yawRate = this.steerInput * baseTurnRate * normalizedSpeed * highSpeedTaper * Math.sign(this.speed);
            
            if (this.isDrifting) {
                yawRate *= 1.35;
            }
            
            // Absolute safety cap
            yawRate = THREE.MathUtils.clamp(yawRate, -0.85, 0.85);
            
            this.angle += yawRate * delta;
        }
        
        // 4. Resolve World Velocity along Canonical -Z Forward Vector
        const forwardX = -Math.sin(this.angle);
        const forwardZ = -Math.cos(this.angle);
        
        let targetVx = forwardX * this.speed;
        let targetVz = forwardZ * this.speed;
        
        // Lateral traction & slide recovery: glued to the road when driving straight
        const lateralGrip = this.isDrifting ? (this.specs.driftGrip || 0.82) : 0.98;
        this.vx = THREE.MathUtils.lerp(this.vx, targetVx, delta * (lateralGrip * 16.0));
        this.vz = THREE.MathUtils.lerp(this.vz, targetVz, delta * (lateralGrip * 16.0));
        
        // 5. Integrate Position
        this.x += this.vx * delta;
        this.z += this.vz * delta;
        
        // 6. Ground Height Tracking
        if (this.game.mapLoader) {
            this.y = this.game.mapLoader.getHeight(this.x, this.z);
        }
        
        // 7. Resolve Building Collisions
        this.resolveCollisions();
        
        // 8. Gearbox & RPM
        this.updateGearbox(speedKmh, controls.throttle);
    }
    
    resolveCollisions() {
        if (!this.game.mapLoader || !this.game.mapLoader.buildings) return;
        const buildings = this.game.mapLoader.buildings;
        const carRadius = 1.2;
        
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            const dx = this.x - b.x;
            const dz = this.z - b.z;
            if (Math.abs(dx) > b.r_x + carRadius || Math.abs(dz) > b.r_z + carRadius) continue;
            
            const overlapX = (b.r_x + carRadius) - Math.abs(dx);
            const overlapZ = (b.r_z + carRadius) - Math.abs(dz);
            
            if (overlapX > 0 && overlapZ > 0) {
                if (overlapX < overlapZ) {
                    this.x += Math.sign(dx) * overlapX;
                } else {
                    this.z += Math.sign(dz) * overlapZ;
                }
                this.speed *= 0.55;
                if (this.game.audioEngine) {
                    this.game.audioEngine.playImpact(15);
                }
                break;
            }
        }
    }
    
    updateGearbox(speedKmh, isThrottling) {
        if (this.speed < -1) {
            this.gear = 'R';
            this.rpm = 2600;
            return;
        }
        const gearRanges = [0, 50, 95, 150, 215, 275, 360];
        let curGear = 1;
        for (let i = 1; i < gearRanges.length; i++) {
            if (speedKmh >= gearRanges[i - 1]) curGear = i;
        }
        this.gear = curGear;
        const minS = gearRanges[this.gear - 1];
        const maxS = gearRanges[this.gear] || 360;
        const prog = Math.max(0, Math.min(1, (speedKmh - minS) / (maxS - minS + 1)));
        this.rpm = isThrottling ? 2000 + prog * 5800 : Math.max(this.idleRpm, 1200 + prog * 2200);
    }
}
