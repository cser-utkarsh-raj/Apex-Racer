import * as THREE from 'three';

/**
 * RaceManager.js — Race Events, Countdown, Lap Tracking & Finish Flow
 */
export class RaceManager {
    constructor(game) {
        this.game = game;
        this.activeEvent = null;
        this.state = 'INACTIVE'; // INACTIVE, COUNTDOWN, RACING, FINISHED
        
        this.currentLap = 1;
        this.currentCheckpointIdx = 0;
        this.raceTime = 0;
        this.countdown = 3;
        this.countdownTimer = 1.0;
        
        this.beaconGroup = new THREE.Group();
        this.beaconGroup.name = "race_beacons";
        
        this.beaconMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide
        });
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0xf5a623,
            wireframe: true
        });
    }
    
    init() {
        if (this.game.scene) {
            this.game.scene.add(this.beaconGroup);
        }
    }
    
    startEvent(eventData) {
        this.activeEvent = eventData;
        this.state = 'COUNTDOWN';
        this.currentLap = 1;
        this.currentCheckpointIdx = 0;
        this.raceTime = 0;
        this.countdown = 3;
        this.countdownTimer = 1.0;
        
        const startCp = eventData.checkpoints[0];
        if (this.game.physics) {
            this.game.physics.x = startCp.x;
            this.game.physics.z = startCp.z - 35;
            this.game.physics.angle = 0;
            this.game.physics.speed = 0;
            this.game.physics.vx = 0;
            this.game.physics.vz = 0;
        }
        
        const cdEl = document.getElementById('race-countdown-overlay');
        if (cdEl) {
            cdEl.style.display = 'block';
            cdEl.innerText = '3';
            cdEl.style.color = '#00f0ff';
        }
        
        this.updateBeacons();
        console.log(`RaceManager: Started ${eventData.name}`);
    }
    
    updateBeacons() {
        while (this.beaconGroup.children.length > 0) {
            this.beaconGroup.remove(this.beaconGroup.children[0]);
        }
        
        if (!this.activeEvent || this.state === 'FINISHED' || this.state === 'INACTIVE') return;
        
        const cp = this.activeEvent.checkpoints[this.currentCheckpointIdx];
        if (!cp) return;
        
        const cylGeo = new THREE.CylinderGeometry(cp.radius, cp.radius, 40, 24, 1, true);
        const beaconMesh = new THREE.Mesh(cylGeo, this.beaconMat);
        beaconMesh.position.set(cp.x, 20, cp.z);
        this.beaconGroup.add(beaconMesh);
        
        const ringGeo = new THREE.TorusGeometry(cp.radius, 0.4, 8, 24);
        ringGeo.rotateX(Math.PI / 2);
        const ringMesh = new THREE.Mesh(ringGeo, this.ringMat);
        ringMesh.position.set(cp.x, 1.5, cp.z);
        this.beaconGroup.add(ringMesh);
    }
    
    update(delta) {
        if (this.state === 'INACTIVE') return;
        
        if (this.state === 'COUNTDOWN') {
            this.countdownTimer -= delta;
            const cdEl = document.getElementById('race-countdown-overlay');
            
            if (this.countdownTimer <= 0) {
                this.countdown--;
                this.countdownTimer = 1.0;
                
                if (cdEl) {
                    if (this.countdown > 0) {
                        cdEl.innerText = this.countdown;
                        cdEl.style.color = '#00f0ff';
                    } else if (this.countdown === 0) {
                        cdEl.innerText = 'GO!';
                        cdEl.style.color = '#00ff88';
                    }
                }
                
                if (this.countdown < 0) {
                    this.state = 'RACING';
                    if (cdEl) {
                        setTimeout(() => { cdEl.style.display = 'none'; }, 600);
                    }
                }
            }
            return;
        }
        
        if (this.state === 'RACING') {
            this.raceTime += delta;
            
            const playerX = this.game.physics ? this.game.physics.x : 0;
            const playerZ = this.game.physics ? this.game.physics.z : 0;
            
            const cp = this.activeEvent.checkpoints[this.currentCheckpointIdx];
            if (cp) {
                const dist = Math.hypot(playerX - cp.x, playerZ - cp.z);
                if (dist < cp.radius + 5.0) {
                    this.currentCheckpointIdx++;
                    
                    if (this.currentCheckpointIdx >= this.activeEvent.checkpoints.length) {
                        if (this.currentLap < this.activeEvent.laps) {
                            this.currentLap++;
                            this.currentCheckpointIdx = 0;
                        } else {
                            this.finishRace();
                        }
                    }
                    this.updateBeacons();
                }
            }
        }
    }
    
    finishRace() {
        this.state = 'FINISHED';
        this.updateBeacons();
        
        const rewardCash = this.activeEvent.rewardCash || 15000;
        const rewardRep = this.activeEvent.rewardRep || 250;
        
        if (this.onRaceFinished) {
            this.onRaceFinished({
                eventName: this.activeEvent.name,
                time: this.raceTime,
                rewardCash: rewardCash,
                rewardRep: rewardRep
            });
        }
    }
}
