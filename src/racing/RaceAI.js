import * as THREE from 'three';

export class RaceAI {
    constructor(controller, track) {
        this.controller = controller;
        this.track = track;
        
        this.nextCheckIdx = 0;
        this.stuckTimer = 0;
        this.reverseTimer = 0;
        
        // Random slight offsets to AI performance to avoid they driving in a perfect line
        this.skillFactor = 0.8 + Math.random() * 0.2;
    }
    
    setNextCheckpoint(idx) {
        this.nextCheckIdx = idx;
    }
    
    update(delta) {
        const physics = this.controller.physics;
        const currentCp = this.track.checkpoints[this.nextCheckIdx];
        
        if (!currentCp) return;
        
        // 1. Calculate direction vector to checkpoint
        const dx = currentCp.x - physics.x;
        const dz = currentCp.z - physics.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Heading vectors
        const headingX = Math.sin(physics.angle);
        const headingZ = Math.cos(physics.angle);
        
        // 2. Angle to target relative to heading
        const targetAngle = Math.atan2(dx, dz);
        let angleDiff = targetAngle - physics.angle;
        
        // Normalize angle to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Reset controls
        const controls = this.controller.aiControls;
        controls.throttle = false;
        controls.brake = false;
        controls.steerLeft = false;
        controls.steerRight = false;
        controls.handbrake = false;
        controls.nitro = false;
        
        // 3. Sticking recovery logic
        if (physics.speed < 1.0) {
            this.stuckTimer += delta;
        } else {
            this.stuckTimer = 0;
        }
        
        // If stuck for 2.0s, reverse for 1.2s
        if (this.stuckTimer > 2.0 && this.reverseTimer <= 0) {
            this.reverseTimer = 1.2;
            this.stuckTimer = 0;
        }
        
        if (this.reverseTimer > 0) {
            this.reverseTimer -= delta;
            
            // Reverse controls
            controls.brake = true; // when speed is 0 or moving back, brake acts as reverse
            
            // Steer away from target
            if (angleDiff > 0) {
                controls.steerRight = true;
            } else {
                controls.steerLeft = true;
            }
            return;
        }
        
        // 4. Standard steering
        const steerThreshold = 0.08;
        if (angleDiff > steerThreshold) {
            controls.steerLeft = true;
        } else if (angleDiff < -steerThreshold) {
            controls.steerRight = true;
        }
        
        // 5. Speed control
        const absAngle = Math.abs(angleDiff);
        
        if (absAngle > 0.8) {
            // Very sharp corner: brake hard!
            controls.brake = true;
        } else if (absAngle > 0.4) {
            // Medium corner: release throttle or brake slightly
            if (physics.speed > physics.maxSpeed * 0.4) {
                controls.brake = true;
            } else {
                controls.throttle = true;
            }
        } else {
            // Straight line: full speed ahead!
            controls.throttle = true;
            
            // AI occasionally uses Nitro on straightaways
            if (dist > 60.0 && physics.speed > physics.maxSpeed * 0.7 && Math.random() < 0.02 * this.skillFactor) {
                controls.nitro = true;
            }
        }
        
        // Scale AI performance based on skill factor
        if (physics.speed > physics.maxSpeed * this.skillFactor) {
            controls.throttle = false;
        }
    }
}
