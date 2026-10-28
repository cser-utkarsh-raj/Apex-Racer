import * as THREE from 'three';
import { VehicleController } from '../vehicles/VehicleController.js';
import { RaceAI } from './RaceAI.js';

export class RaceManager {
    constructor(game) {
        this.game = game;
        this.tracks = [];
        this.activeRace = null;
        
        // 3D Visual Gates (beacons) for race starts
        this.gates = [];
        
        this.initTracks();
    }
    
    initTracks() {
        // We will define 3 tracks by filtering coordinates from metadata road_points
        // Road points: list of {x, y, z} representing block coords (0 to 1536 range)
        const roadPoints = this.game.mapLoader.meta.road_points || [];
        
        console.log(`RaceManager: Initializing tracks using ${roadPoints.length} road points...`);
        
        // Track 1: Downtown Sprint (Point A -> Point B)
        // Outskirts (spawn at Z=2400) to City Center (Z=1800, X=1500)
        // Let's filter road points that bridge this path
        // We map coordinate space: X_block = x, Z_block = z.
        // Local game coordinates: x_world = x - minX, z_world = z - minZ
        const mapLoader = this.game.mapLoader;
        
        const localPoints = roadPoints.map(p => ({
            x: p.x - mapLoader.minX,
            z: p.z - mapLoader.minZ,
            y: p.y
        }));
        
        // Setup Track 1 checkpoints manually or by filter to make sure it is a valid path
        // Let's build a path from spawn (x ~ 167, z ~ 1135) to city center (x ~ 1100, z ~ 500)
        const cp1 = [
            { x: 167, z: 1135 }, // Spawn
            { x: 300, z: 1050 },
            { x: 420, z: 980 },
            { x: 550, z: 920 },
            { x: 700, z: 800 },
            { x: 850, z: 750 },
            { x: 980, z: 680 },
            { x: 1050, z: 580 },
            { x: 1100, z: 500 }  // City Center
        ];
        
        // Track 2: Nantwich GP (3 Laps Circuit around City Center)
        // Closed loop centered on X=1100, Z=500
        const cp2 = [
            { x: 1100, z: 500 },
            { x: 1250, z: 520 },
            { x: 1300, z: 380 },
            { x: 1200, z: 280 },
            { x: 1050, z: 260 },
            { x: 950, z: 320 },
            { x: 980, z: 450 },
            { x: 1100, z: 500 }
        ];
        
        // Track 3: Rural Time Trial (Sprint through the valleys)
        const cp3 = [
            { x: 1100, z: 500 },
            { x: 980, z: 680 },
            { x: 800, z: 820 },
            { x: 680, z: 950 },
            { x: 500, z: 1050 },
            { x: 350, z: 1150 },
            { x: 220, z: 1280 },
            { x: 120, z: 1350 }
        ];
        
        // Store tracks
        this.tracks = [
            {
                id: 'downtown_sprint',
                name: 'Downtown Sprint',
                type: 'SPRINT',
                checkpoints: cp1,
                laps: 1,
                rewardCash: 3000,
                rewardRep: 400,
                rating: 'C 220+',
                startGate: cp1[0]
            },
            {
                id: 'nantwich_gp',
                name: 'Nantwich Grand Prix',
                type: 'CIRCUIT',
                checkpoints: cp2,
                laps: 3,
                rewardCash: 4500,
                rewardRep: 600,
                rating: 'B 320+',
                startGate: cp2[0]
            },
            {
                id: 'rural_time_trial',
                name: 'Rural Speedrun',
                type: 'TIME_TRIAL',
                checkpoints: cp3,
                laps: 1,
                rewardCash: 5000,
                rewardRep: 800,
                rating: 'A 420+',
                startGate: cp3[0]
            }
        ];
        
        this.spawnStartGates();
    }
    
    spawnStartGates() {
        // Create 3D beacons at race start points
        const geometry = new THREE.CylinderGeometry(5, 5, 12, 16, 1, true);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffea00, // Glowing yellow cylinders
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide
        });
        
        this.tracks.forEach((track, idx) => {
            const mesh = new THREE.Mesh(geometry, material);
            const gate = track.startGate;
            const y = this.game.mapLoader.getHeight(gate.x, gate.z);
            mesh.position.set(gate.x, y + 6, gate.z);
            
            // Add a floating glowing ring above the gate
            const ringGeo = new THREE.TorusGeometry(5, 0.4, 8, 24);
            ringGeo.rotateX(Math.PI/2);
            const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffea00 }));
            ringMesh.position.set(0, 6, 0);
            mesh.add(ringMesh);
            
            this.game.world.scene.add(mesh);
            this.gates.push({ mesh, track, ringMesh });
            
            console.log(`Spawned Race Start Gate for ${track.name} at (${gate.x}, ${gate.z})`);
        });
    }
    
    checkProximityToRaceGates() {
        if (this.game.state !== 'FREE_ROAM') return;
        
        const player = this.game.playerVehicle;
        if (!player) return;
        
        const px = player.physics.x;
        const pz = player.physics.z;
        
        this.gates.forEach(gate => {
            const dx = gate.track.startGate.x - px;
            const dz = gate.track.startGate.z - pz;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist < 8.0) {
                // Trigger race offer overlay
                this.offerRace(gate.track);
            }
        });
    }
    
    offerRace(track) {
        // Pause driving input
        this.game.state = 'MENU';
        
        const overlay = document.getElementById('race-setup');
        overlay.classList.remove('hidden');
        
        document.getElementById('race-type-tag').innerText = track.type + " RACE";
        document.getElementById('race-name').innerText = track.name.toUpperCase();
        document.getElementById('race-dist').innerText = `${(track.checkpoints.length * 0.4).toFixed(1)} KM`;
        document.getElementById('race-opponents').innerText = track.type === 'TIME_TRIAL' ? 'SOLO RUN' : '3 AI RACERS';
        document.getElementById('race-class').innerText = track.rating;
        document.getElementById('race-reward-cash').innerText = `$${track.rewardCash.toLocaleString()}`;
        document.getElementById('race-reward-rep').innerText = `+${track.rewardRep} REP`;
        
        // Button actions
        document.getElementById('btn-race-start').onclick = () => {
            overlay.classList.add('hidden');
            this.startRace(track);
        };
        document.getElementById('btn-race-cancel').onclick = () => {
            overlay.classList.add('hidden');
            // Back to driving
            this.game.state = 'FREE_ROAM';
            
            // Push player back slightly to avoid double triggers
            const player = this.game.playerVehicle;
            const angle = player.physics.angle;
            player.setPosition(
                player.physics.x - Math.sin(angle) * 10,
                player.physics.y,
                player.physics.z - Math.cos(angle) * 10
            );
        };
    }
    
    async startRace(track) {
        this.game.state = 'RACING';
        
        // Configure HUD
        document.getElementById('hud-race-info').classList.remove('hidden');
        document.getElementById('hud-pos').innerText = "1/4";
        document.getElementById('hud-lap').innerText = `1/${track.laps}`;
        if (track.type === 'TIME_TRIAL') {
            document.getElementById('hud-pos').innerText = "1/1";
            document.getElementById('hud-lap-container').classList.add('hidden');
        } else {
            document.getElementById('hud-lap-container').classList.remove('hidden');
        }
        
        // 1. Setup active race record
        this.activeRace = {
            track: track,
            elapsedTime: 0,
            countdown: 3.5,
            playerState: {
                nextCheck: 0,
                lap: 1,
                checkpointTimer: 0
            },
            opponents: []
        };
        
        // 2. Position player car at start grid
        const startPt = track.checkpoints[0];
        const nextPt = track.checkpoints[1];
        const angle = Math.atan2(nextPt.x - startPt.x, nextPt.z - startPt.z);
        
        const player = this.game.playerVehicle;
        player.setPosition(startPt.x, this.game.mapLoader.getHeight(startPt.x, startPt.z) + 1.0, startPt.z);
        player.setRotation(0, angle, 0);
        
        // Stop player velocity
        player.physics.vx = 0;
        player.physics.vz = 0;
        player.physics.speed = 0;
        
        // 3. Clear existing AI, spawn new AI opponents (except in Time Trial)
        this.game.aiVehicles.forEach(ai => this.game.world.scene.remove(ai.mesh));
        this.game.aiVehicles = [];
        
        if (track.type !== 'TIME_TRIAL') {
            const aiCarIds = ['mustang', 'police_car', 'taxi'];
            
            for (let i = 0; i < 3; i++) {
                const mesh = await this.game.vehicleLoader.createVehicleMesh(aiCarIds[i]);
                this.game.world.scene.add(mesh);
                
                // Spawn slightly behind player
                const offsetDistance = 6.0 * (i + 1);
                const offsetAngle = angle + Math.PI + (Math.random() - 0.5) * 0.3;
                
                const aiX = startPt.x + Math.sin(offsetAngle) * offsetDistance;
                const aiZ = startPt.z + Math.cos(offsetAngle) * offsetDistance;
                
                const aiController = new VehicleController(this.game, aiCarIds[i], mesh, true);
                aiController.setPosition(aiX, this.game.mapLoader.getHeight(aiX, aiZ) + 1.0, aiZ);
                aiController.setRotation(0, angle, 0);
                
                // Add AI pilot logic
                const aiPilot = new RaceAI(aiController, track);
                
                this.activeRace.opponents.push({
                    controller: aiController,
                    pilot: aiPilot,
                    nextCheck: 0,
                    lap: 1
                });
                
                this.game.aiVehicles.push(aiController);
            }
        }
        
        // Spawn active visual Checkpoint cylinder
        this.spawnRaceCheckpointVisuals();
    }
    
    spawnRaceCheckpointVisuals() {
        // Remove old visual checkpoint
        if (this.visualCheckpoint) {
            this.game.world.scene.remove(this.visualCheckpoint);
        }
        
        const track = this.activeRace.track;
        const pIndex = this.activeRace.playerState.nextCheck;
        const cp = track.checkpoints[pIndex];
        
        const geometry = new THREE.CylinderGeometry(4, 4, 10, 16, 1, true);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffd2, // Cyan glowing check points
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        const y = this.game.mapLoader.getHeight(cp.x, cp.z);
        mesh.position.set(cp.x, y + 5, cp.z);
        
        // Floating ring above
        const ringGeo = new THREE.TorusGeometry(4, 0.3, 8, 24);
        ringGeo.rotateX(Math.PI/2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00ffd2 }));
        ring.position.set(0, 5, 0);
        mesh.add(ring);
        
        this.game.world.scene.add(mesh);
        this.visualCheckpoint = mesh;
    }
    
    getNextCheckpoint() {
        if (!this.activeRace) return null;
        const track = this.activeRace.track;
        const idx = this.activeRace.playerState.nextCheck;
        return track.checkpoints[idx];
    }
    
    update(delta) {
        if (!this.activeRace) return;
        
        // Countdown
        if (this.activeRace.countdown > 0) {
            this.activeRace.countdown -= delta;
            
            const alertText = document.getElementById('hud-alert-text');
            alertText.classList.remove('hidden');
            
            if (this.activeRace.countdown > 2.5) {
                alertText.innerText = "3";
            } else if (this.activeRace.countdown > 1.5) {
                alertText.innerText = "2";
            } else if (this.activeRace.countdown > 0.5) {
                alertText.innerText = "1";
            } else {
                alertText.innerText = "GO!";
                // Release lock on controls (handled below)
            }
            
            // Lock speeds / velocities to 0
            const player = this.game.playerVehicle;
            player.physics.vx = 0;
            player.physics.vz = 0;
            player.physics.speed = 0;
            
            this.activeRace.opponents.forEach(opp => {
                opp.controller.physics.vx = 0;
                opp.controller.physics.vz = 0;
                opp.controller.physics.speed = 0;
            });
            
            return;
        } else {
            // Hide countdown alert after 1s of GO!
            if (this.activeRace.countdown > -1.0) {
                this.activeRace.countdown -= delta;
                if (this.activeRace.countdown <= -1.0) {
                    document.getElementById('hud-alert-text').classList.add('hidden');
                }
            }
        }
        
        // Update race elapsed time
        this.activeRace.elapsedTime += delta;
        const elapsed = this.activeRace.elapsedTime;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        const ms = Math.floor((elapsed * 100) % 100);
        document.getElementById('hud-time').innerText = 
            `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
            
        // 1. Update AI Opponents logic
        this.activeRace.opponents.forEach(opp => {
            opp.pilot.update(delta);
            opp.controller.update(delta);
            
            // Check AI checkpoints
            const nextCp = opp.pilot.track.checkpoints[opp.nextCheck];
            const dx = nextCp.x - opp.controller.physics.x;
            const dz = nextCp.z - opp.controller.physics.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist < 10.0) {
                opp.nextCheck++;
                if (opp.nextCheck >= opp.pilot.track.checkpoints.length) {
                    opp.nextCheck = 0;
                    opp.lap++;
                }
                opp.pilot.setNextCheckpoint(opp.nextCheck);
            }
        });
        
        // 2. Track Player checkpoints
        const player = this.game.playerVehicle;
        const pState = this.activeRace.playerState;
        const track = this.activeRace.track;
        const nextCp = track.checkpoints[pState.nextCheck];
        
        const dx = nextCp.x - player.physics.x;
        const dz = nextCp.z - player.physics.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < 12.0) {
            // Crossed checkpoint!
            pState.nextCheck++;
            console.log(`Player crossed checkpoint ${pState.nextCheck - 1}!`);
            
            if (pState.nextCheck >= track.checkpoints.length) {
                // Completed a lap!
                if (pState.lap >= track.laps) {
                    // Won/finished the race!
                    this.finishRace();
                    return;
                } else {
                    pState.nextCheck = 0;
                    pState.lap++;
                    document.getElementById('hud-lap').innerText = `${pState.lap}/${track.laps}`;
                    console.log(`Player started lap ${pState.lap}!`);
                }
            }
            
            this.spawnRaceCheckpointVisuals();
        }
        
        // 3. Determine positions
        this.updatePositions();
    }
    
    updatePositions() {
        if (!this.activeRace) return;
        const pState = this.activeRace.playerState;
        const track = this.activeRace.track;
        
        // Make list of all racers with their score:
        // Score = (lap * checkpointsCount) + currentCheckpointIndex - (distance to next checkpoint / total distance between checkpoints)
        const getScore = (lap, nextCheck, x, z) => {
            const nextCp = track.checkpoints[nextCheck];
            // Prev checkpoint index
            const prevCheck = (nextCheck === 0) ? track.checkpoints.length - 1 : nextCheck - 1;
            const prevCp = track.checkpoints[prevCheck];
            
            const dx = nextCp.x - x;
            const dz = nextCp.z - z;
            const checkDist = Math.sqrt(dx*dx + dz*dz);
            
            const segmentDx = nextCp.x - prevCp.x;
            const segmentDz = nextCp.z - prevCp.z;
            const segmentLength = Math.max(1, Math.sqrt(segmentDx*segmentDx + segmentDz*segmentDz));
            
            const progressRatio = Math.max(0, Math.min(1.0, 1.0 - (checkDist / segmentLength)));
            return (lap * 100) + nextCheck + progressRatio;
        };
        
        const racers = [
            { id: 'player', score: getScore(pState.lap, pState.nextCheck, this.game.playerVehicle.physics.x, this.game.playerVehicle.physics.z) }
        ];
        
        this.activeRace.opponents.forEach((opp, idx) => {
            racers.push({
                id: `ai_${idx}`,
                score: getScore(opp.lap, opp.nextCheck, opp.controller.physics.x, opp.controller.physics.z)
            });
        });
        
        // Sort racers descending by score
        racers.sort((a, b) => b.score - a.score);
        
        // Find player position
        const pIndex = racers.findIndex(r => r.id === 'player');
        const posText = `${pIndex + 1}/${racers.length}`;
        document.getElementById('hud-pos').innerText = posText;
    }
    
    finishRace() {
        console.log("Player crossed the finish line!");
        
        // Remove visual checkpoint
        if (this.visualCheckpoint) {
            this.game.world.scene.remove(this.visualCheckpoint);
            this.visualCheckpoint = null;
        }
        
        const track = this.activeRace.track;
        const playerPos = parseInt(document.getElementById('hud-pos').innerText.split('/')[0]);
        
        // Calculate payout modifiers based on placement
        let moneyPayout = track.rewardCash;
        let repPayout = track.rewardRep;
        
        let positionWord = "1ST PLACE";
        if (playerPos === 2) {
            moneyPayout = Math.round(moneyPayout * 0.7);
            repPayout = Math.round(repPayout * 0.7);
            positionWord = "2ND PLACE";
        } else if (playerPos === 3) {
            moneyPayout = Math.round(moneyPayout * 0.5);
            repPayout = Math.round(repPayout * 0.5);
            positionWord = "3RD PLACE";
        } else if (playerPos > 3) {
            moneyPayout = Math.round(moneyPayout * 0.2);
            repPayout = Math.round(repPayout * 0.2);
            positionWord = "DNF / 4TH";
        }
        
        // Add payouts to career profile
        this.game.saveData.money += moneyPayout;
        this.game.saveData.rep += repPayout;
        
        if (!this.game.saveData.completedRaces.includes(track.id)) {
            this.game.saveData.completedRaces.push(track.id);
        }
        
        this.game.saveSystem.save(this.game.saveData);
        
        // Alert HUD Results
        const alertText = document.getElementById('hud-alert-text');
        alertText.classList.remove('hidden');
        alertText.innerHTML = `
            FINISHED!<br>
            <span style="font-size: 28px; color: #00f3ff;">${positionWord}</span><br>
            <span style="font-size: 20px; color: #39ff14;">+$${moneyPayout.toLocaleString()} CASH</span><br>
            <span style="font-size: 20px; color: #00ffd2;">+${repPayout} REP</span>
        `;
        
        // Quit active race and return to Free Roam after 4s
        this.activeRace = null;
        
        setTimeout(() => {
            alertText.classList.add('hidden');
            this.game.startFreeRoam();
        }, 4000);
    }
    
    restartRace() {
        if (this.activeRace) {
            const trk = this.activeRace.track;
            this.startRace(trk);
        }
    }
}
