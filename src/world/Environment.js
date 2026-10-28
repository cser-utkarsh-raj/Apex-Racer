import * as THREE from 'three';

export class Environment {
    constructor(world) {
        this.world = world;
        this.game = world.game;
        this.scene = world.scene;
        
        // Rain particles
        this.rainParticles = null;
        this.rainCount = 2000;
        this.rainGeometry = null;
        this.rainSpeed = 60; // units/sec
        
        this.init();
    }
    
    init() {
        // Setup rain particle system
        this.rainGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.rainCount * 3);
        const velocities = new Float32Array(this.rainCount);
        
        for (let i = 0; i < this.rainCount * 3; i += 3) {
            // Spawn in a box centered on origin
            positions[i] = (Math.random() - 0.5) * 120; // X
            positions[i + 1] = Math.random() * 80;      // Y
            positions[i + 2] = (Math.random() - 0.5) * 120; // Z
            
            velocities[i / 3] = 40 + Math.random() * 20; // speed
        }
        
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        
        // Simple line material for rain droplets
        const rainMat = new THREE.PointsMaterial({
            color: 0xaaaaee,
            size: 0.15,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
        
        this.rainParticles = new THREE.Points(this.rainGeometry, rainMat);
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }
    
    update(delta) {
        const weather = this.game.settings.weather;
        
        if (weather === 'rain') {
            this.rainParticles.visible = true;
            
            // Move rain with player camera
            const camPos = this.world.camera.position;
            this.rainParticles.position.set(camPos.x, 0, camPos.z);
            
            const positions = this.rainGeometry.attributes.position.array;
            const velocities = this.rainGeometry.attributes.velocity.array;
            
            for (let i = 0; i < this.rainCount * 3; i += 3) {
                // Subtract Y position
                positions[i + 1] -= velocities[i / 3] * delta;
                
                // If it hits bottom (Y=0 relative to camera, or below ground)
                // Let's reset it at the top
                if (positions[i + 1] < -10) {
                    positions[i] = (Math.random() - 0.5) * 120;
                    positions[i + 1] = 50 + Math.random() * 30;
                    positions[i + 2] = (Math.random() - 0.5) * 120;
                }
            }
            
            this.rainGeometry.attributes.position.needsUpdate = true;
        } else {
            this.rainParticles.visible = false;
        }
    }
}
