import * as THREE from 'three';

export class HUD {
    constructor(game) {
        this.game = game;
        this.canvas = null;
        this.ctx = null;
        
        // Minimap scale
        this.mapScale = 1.6; // pixels per block
        this.mapRadius = 55;  // block radius to draw
    }
    
    init() {
        this.canvas = document.getElementById('minimap-canvas');
        this.ctx = this.canvas.getContext('2d');
    }
    
    update(delta) {
        const player = this.game.playerVehicle;
        if (!player) return;
        
        const physics = player.physics;
        const speedKmh = Math.round(physics.speed / 0.28);
        
        // 1. Update Telemetry displays
        document.getElementById('speed-val').innerText = String(speedKmh).padStart(3, '0');
        
        // Simulate RPM dial
        // Shift ranges: 1st (0-40), 2nd (40-75), 3rd (75-110), 4th (110-150), 5th (150+)
        let gear = 1;
        let rpmPct = 0;
        
        if (speedKmh < 3) {
            gear = physics.vx * Math.sin(physics.angle) + physics.vz * Math.cos(physics.angle) < -0.5 ? 'R' : '1';
            rpmPct = speedKmh / 40;
        } else if (speedKmh < 40) {
            gear = 1;
            rpmPct = speedKmh / 40;
        } else if (speedKmh < 75) {
            gear = 2;
            rpmPct = (speedKmh - 40) / (75 - 40);
        } else if (speedKmh < 110) {
            gear = 3;
            rpmPct = (speedKmh - 75) / (110 - 75);
        } else if (speedKmh < 150) {
            gear = 4;
            rpmPct = (speedKmh - 110) / (150 - 110);
        } else {
            gear = 5;
            rpmPct = Math.min(1.0, (speedKmh - 150) / 70);
        }
        
        // Bounce RPM slightly at limiter (e.g. rpmPct close to 1)
        if (rpmPct >= 0.98) {
            rpmPct = 0.95 + Math.sin(this.game.gameTime * 60) * 0.05;
        }
        
        document.getElementById('gear-val').innerText = gear;
        document.getElementById('rpm-bar').style.width = `${rpmPct * 100}%`;
        
        // Nitro bar
        const nitroPct = (physics.nitroMeter / physics.maxNitro) * 100;
        document.getElementById('nitro-bar').style.width = `${nitroPct}%`;
        
        // 2. Render Minimap
        this.renderMinimap(player);
        
        // 3. Waypoint Navigation
        this.updateWaypointNavigation(player);
    }
    
    renderMinimap(player) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        
        // Clear
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, w, h);
        
        ctx.save();
        // Translate to center
        ctx.translate(cx, cy);
        // Rotate map counter to player angle (so player heading is always facing UP on the screen!)
        ctx.rotate(-player.physics.angle);
        
        const playerX = player.physics.x;
        const playerZ = player.physics.z;
        const mapLoader = this.game.mapLoader;
        
        // Draw vector road lines
        const connections = mapLoader.roadConnections || [];
        
        // 1. Draw Curb Outlines
        ctx.strokeStyle = '#55555c';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        connections.forEach(c => {
            const dx1 = c.x1 - playerX;
            const dz1 = c.z1 - playerZ;
            const dx2 = c.x2 - playerX;
            const dz2 = c.z2 - playerZ;
            
            // Fast distance check
            if (Math.abs(dx1) < 120 && Math.abs(dz1) < 120) {
                ctx.moveTo(dx1 * this.mapScale, dz1 * this.mapScale);
                ctx.lineTo(dx2 * this.mapScale, dz2 * this.mapScale);
            }
        });
        ctx.stroke();
        
        // 2. Draw Asphalt center lanes
        ctx.strokeStyle = '#2c2c35';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        connections.forEach(c => {
            const dx1 = c.x1 - playerX;
            const dz1 = c.z1 - playerZ;
            const dx2 = c.x2 - playerX;
            const dz2 = c.z2 - playerZ;
            
            if (Math.abs(dx1) < 120 && Math.abs(dz1) < 120) {
                ctx.moveTo(dx1 * this.mapScale, dz1 * this.mapScale);
                ctx.lineTo(dx2 * this.mapScale, dz2 * this.mapScale);
            }
        });
        ctx.stroke();
        
        // Draw active checkpoints / race routes on the minimap
        if (this.game.state === 'RACING') {
            const nextCheck = this.game.raceManager.getNextCheckpoint();
            if (nextCheck) {
                const dx = nextCheck.x - playerX;
                const dz = nextCheck.z - playerZ;
                ctx.fillStyle = '#00ffd2'; // Cyan checkpoint dot
                ctx.beginPath();
                ctx.arc(dx * this.mapScale, dz * this.mapScale, 6, 0, 2 * Math.PI);
                ctx.fill();
                ctx.shadowColor = '#00ffd2';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0; // reset
            }
        }
        
        // Draw AI Opponents on the minimap
        this.game.aiVehicles.forEach(ai => {
            if (ai.physics) {
                const dx = ai.physics.x - playerX;
                const dz = ai.physics.z - playerZ;
                ctx.fillStyle = '#ff007f'; // Magenta dot for AI
                ctx.beginPath();
                ctx.arc(dx * this.mapScale, dz * this.mapScale, 4, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
        
        ctx.restore();
        
        // Draw Player indicator in center (always pointing UP)
        ctx.fillStyle = '#00f3ff'; // Neon blue player arrow
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx - 6, cy + 6);
        ctx.lineTo(cx, cy + 3);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.closePath();
        ctx.fill();
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    updateWaypointNavigation(player) {
        if (this.game.state !== 'RACING') {
            document.getElementById('hud-waypoint-container').classList.add('hidden');
            return;
        }
        
        const nextCheck = this.game.raceManager.getNextCheckpoint();
        if (!nextCheck) {
            document.getElementById('hud-waypoint-container').classList.add('hidden');
            return;
        }
        
        document.getElementById('hud-waypoint-container').classList.remove('hidden');
        
        // Distance
        const dx = nextCheck.x - player.physics.x;
        const dz = nextCheck.z - player.physics.z;
        const dist = Math.round(Math.sqrt(dx*dx + dz*dz));
        document.getElementById('waypoint-dist').innerText = `${dist}m`;
        
        // Angle relative to player heading
        const worldAngle = Math.atan2(dx, dz);
        const relAngle = worldAngle - player.physics.angle;
        
        // Rotate arrow
        const arrow = document.getElementById('waypoint-arrow');
        arrow.style.transform = `rotate(${relAngle * 180 / Math.PI}deg)`;
    }
}
