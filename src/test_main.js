import * as THREE from 'three';
import { VehiclePhysics } from './vehicles/VehiclePhysics.js';
import { VehicleLoader } from './vehicles/VehicleLoader.js';
import { MapLoader } from './world/MapLoader.js';
import { AudioEngine } from './audio/AudioEngine.js';

class TazaderTest {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        
        this.vehicleLoader = new VehicleLoader(this);
        this.mapLoader = new MapLoader(this);
        this.audioEngine = new AudioEngine();
        
        // Available Test Vehicles (from your Downloaded Assets)
        this.availableCars = [
            { id: 'gtv_ford_mustang_shelby_gt500', name: 'FORD MUSTANG SHELBY GT500' },
            { id: 'gtv_amg_g63', name: 'MERCEDES G63 AMG SUV' },
            { id: 'gtv_lamborghini_urus', name: 'LAMBORGHINI URUS SUV' },
            { id: 'ae86', name: 'TOYOTA AE86 TRUENO (DRIFT)' },
            { id: 'gtv_ford_bronco_sport', name: 'FORD BRONCO SPORT SUV' },
            { id: 'ferrari_f40', name: 'FERRARI F40 SUPERCAR' }
        ];
        this.currentCarIndex = 0;
        
        // Available Real Minecraft Maps
        this.availableMaps = [
            { id: 'curitiba_city', name: 'CITY OF CURITIBA (REAL MINECRAFT METROPOLIS)' },
            { id: 'chiang_tung', name: 'KINGDOM OF CHIANG TUNG (MOUNTAIN EMPIRE)' }
        ];
        this.currentMapId = 'curitiba_city';
        
        this.settings = {
            graphics: 'high',
            weather: 'clear',
            time: 'noon'
        };
        
        this.saveData = { currentCar: 'gtv_ford_mustang_shelby_gt500', upgrades: {} };
        this.saveSystem = { save: () => {} };
        this.keys = {};
        
        this.carMesh = null;
        this.physics = null;
        this.wheels = { fl: [], fr: [], rl: [], rr: [] };
        
        this.minimapCanvas = null;
        this.minimapCtx = null;
        
        this.fpsCount = 0;
        this.lastTime = performance.now();
        
        this.init();
    }
    
    isKeyPressed(key) {
        return !!this.keys[key];
    }
    
    async init() {
        const canvas = document.getElementById('game-canvas');
        
        this.scene = new THREE.Scene();
        
        // Crisp vibrant daylight sky & atmospheric haze
        const skyColor = new THREE.Color(0x6eb5ff);
        const hazeColor = new THREE.Color(0xbddcfa);
        this.scene.background = skyColor;
        this.scene.fog = new THREE.FogExp2(hazeColor, 0.002);
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 2000);
        
        // Natural Hemisphere Light
        const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x3a4832, 1.1);
        this.scene.add(hemiLight);
        
        // Golden Sun Directional Light
        this.sunLight = new THREE.DirectionalLight(0xfff8ea, 2.2);
        this.sunLight.position.set(300, 500, 200);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 800;
        const d = 160;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.bias = -0.0004;
        this.scene.add(this.sunLight);
        
        // Glowing 3D Sun Disc in Sky
        const sunGeo = new THREE.SphereGeometry(35, 16, 16);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.position.set(600, 900, 400);
        this.scene.add(sunMesh);
        
        // Procedural 3D Voxel Clouds
        const cloudGroup = new THREE.Group();
        const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
        for (let i = 0; i < 35; i++) {
            const cx = 200 + (Math.random() - 0.5) * 800;
            const cz = -60 + (Math.random() - 0.5) * 800;
            const cy = 120 + Math.random() * 40;
            const cloud = new THREE.Mesh(new THREE.BoxGeometry(40 + Math.random() * 50, 10, 30 + Math.random() * 40), cloudMat);
            cloud.position.set(cx, cy, cz);
            cloudGroup.add(cloud);
        }
        this.scene.add(cloudGroup);
        
        this.minimapCanvas = document.getElementById('minimap-canvas');
        if (this.minimapCanvas) {
            this.minimapCanvas.width = 160;
            this.minimapCanvas.height = 160;
            this.minimapCtx = this.minimapCanvas.getContext('2d');
        }
        
        window.addEventListener('keydown', async (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            
            // F3: Debug telemetry toggle
            if (e.key === 'F3') {
                const stats = document.getElementById('stats-overlay');
                if (stats) {
                    stats.style.display = (stats.style.display === 'none' || stats.style.display === '') ? 'block' : 'none';
                }
                e.preventDefault();
            }
            
            // C: Hot-swap vehicle
            if (key === 'c') {
                this.currentCarIndex = (this.currentCarIndex + 1) % this.availableCars.length;
                await this.switchVehicle(this.availableCars[this.currentCarIndex]);
            }
            
            // Map selector hotkeys
            if (key === '1') {
                await this.switchMap('curitiba_city');
            } else if (key === '2') {
                await this.switchMap('chiang_tung');
            }
            
            if (this.audioEngine) {
                this.audioEngine.init();
                this.audioEngine.resumeContext();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
        });
        
        window.addEventListener('click', () => {
            if (this.audioEngine) {
                this.audioEngine.init();
                this.audioEngine.resumeContext();
            }
        });
        
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Load Real Curitiba Minecraft map and Ford Mustang Shelby GT500
        await this.mapLoader.loadMap('curitiba_city');
        await this.switchVehicle(this.availableCars[0]);
        
        this.animate();
    }
    
    async switchMap(mapId) {
        console.log(`Switching Map to: ${mapId}...`);
        this.currentMapId = mapId;
        
        await this.mapLoader.loadMap(mapId);
        
        let spawnX = 150;
        let spawnZ = -80;
        let spawnAngle = 0;
        
        if (mapId === 'chiang_tung' && this.mapLoader.metadata) {
            spawnX = this.mapLoader.metadata.spawnPoint.x;
            spawnZ = this.mapLoader.metadata.spawnPoint.z;
            spawnAngle = 0;
        }
        
        const groundY = this.mapLoader.getHeight(spawnX, spawnZ);
        
        if (this.physics) {
            this.physics.x = spawnX;
            this.physics.z = spawnZ;
            this.physics.vx = 0;
            this.physics.vz = 0;
            this.physics.speed = 0;
            this.physics.angularVelocity = 0;
            this.physics.steerAngle = 0;
            this.physics.angle = spawnAngle;
            this.physics.y = groundY;
        }
        if (this.carMesh) {
            this.carMesh.position.set(spawnX, groundY, spawnZ);
            this.carMesh.rotation.y = spawnAngle;
        }
        
        const forwardX = Math.sin(spawnAngle);
        const forwardZ = Math.cos(spawnAngle);
        this.camera.position.set(spawnX - forwardX * 7.5, groundY + 2.8, spawnZ - forwardZ * 7.5);
        this.camera.lookAt(new THREE.Vector3(spawnX, groundY + 1.0, spawnZ));
    }
    
    async switchVehicle(carInfo) {
        console.log(`Switching vehicle to: ${carInfo.name}...`);
        
        const curX = this.physics ? this.physics.x : 150;
        const curZ = this.physics ? this.physics.z : -80;
        const curAngle = this.physics ? this.physics.angle : 0;
        
        if (this.carMesh) {
            this.scene.remove(this.carMesh);
        }
        
        this.wheels = { fl: [], fr: [], rl: [], rr: [] };
        this.carMesh = await this.vehicleLoader.createVehicleMesh(carInfo.id);
        
        this.carMesh.traverse(child => {
            if (child.isGroup) {
                const name = child.name.toLowerCase();
                if (name === 'pneu1' || name === 'tire0' || name.includes('fl') || (name.includes('front') && name.includes('left'))) this.wheels.fl.push(child);
                else if (name === 'pneu2' || name === 'tire1' || name.includes('fr') || (name.includes('front') && name.includes('right'))) this.wheels.fr.push(child);
                else if (name === 'pneu3' || name === 'tire2' || name.includes('rl') || (name.includes('rear') && name.includes('left'))) this.wheels.rl.push(child);
                else if (name === 'pneu4' || name === 'tire5' || name === 'tire3' || name === 'tire4' || name.includes('rr') || (name.includes('rear') && name.includes('right'))) this.wheels.rr.push(child);
            }
        });
        
        this.scene.add(this.carMesh);
        
        const specs = this.vehicleLoader.getSpecs(carInfo.id);
        this.physics = new VehiclePhysics(this, specs);
        this.physics.x = curX;
        this.physics.z = curZ;
        this.physics.y = this.mapLoader.getHeight(curX, curZ);
        this.physics.angle = curAngle;
        
        this.carMesh.position.set(curX, this.physics.y, curZ);
        this.carMesh.rotation.y = curAngle;
        
        const nameEl = document.getElementById('car-name');
        if (nameEl) nameEl.innerText = carInfo.name;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.loop();
    }
    
    loop() {
        const delta = Math.min(this.clock.getDelta(), 0.1);
        
        if (this.physics && this.carMesh) {
            const controls = {
                throttle: this.isKeyPressed('w') || this.isKeyPressed('arrowup'),
                brake: this.isKeyPressed('s') || this.isKeyPressed('arrowdown'),
                steerLeft: this.isKeyPressed('a') || this.isKeyPressed('arrowleft'),
                steerRight: this.isKeyPressed('d') || this.isKeyPressed('arrowright'),
                handbrake: this.isKeyPressed(' ') || this.isKeyPressed('space'),
                nitro: false
            };
            
            this.physics.update(delta, controls);
            this.mapLoader.update(delta);
            
            const speedKmh = Math.round(this.physics.speed / 0.28);
            
            if (this.audioEngine) {
                this.audioEngine.update(speedKmh, this.physics.isDrifting, this.physics.isNitroActive);
            }
            
            this.carMesh.position.set(this.physics.x, this.physics.y, this.physics.z);
            this.carMesh.rotation.y = this.physics.angle;
            
            // Wheel animations
            const speed = this.physics.speed;
            const forward = this.physics.vx * Math.sin(this.physics.angle) + this.physics.vz * Math.cos(this.physics.angle);
            const dir = forward >= 0 ? 1 : -1;
            const spinDelta = speed * 1.2 * delta * dir;
            
            let steerTarget = 0;
            if (this.physics && this.physics.steerAngle !== undefined) {
                steerTarget = this.physics.steerAngle * 0.45;
            }
            
            const spin = (w, isFront) => {
                w.rotation.x -= spinDelta;
                if (isFront) {
                    w.rotation.y = THREE.MathUtils.lerp(w.rotation.y, -steerTarget, delta * 12.0);
                }
            };
            
            this.wheels.fl.forEach(w => spin(w, true));
            this.wheels.fr.forEach(w => spin(w, true));
            this.wheels.rl.forEach(w => spin(w, false));
            this.wheels.rr.forEach(w => spin(w, false));
            
            // Dynamic Camera Follow
            const maxSpeedKmh = this.physics.specs.topSpeed || 280;
            const fovOffset = Math.min((speedKmh / maxSpeedKmh) * 16, 22);
            this.camera.fov = 60 + fovOffset;
            this.camera.updateProjectionMatrix();
            
            const forwardX = Math.sin(this.physics.angle);
            const forwardZ = Math.cos(this.physics.angle);
            
            const isSUV = this.availableCars[this.currentCarIndex].id.includes('g63') || this.availableCars[this.currentCarIndex].id.includes('bronco') || this.availableCars[this.currentCarIndex].id.includes('urus');
            const camHeight = isSUV ? 3.2 : 2.4;
            const camDistance = isSUV ? 8.2 : 7.2;
            
            const targetCamX = this.physics.x - forwardX * camDistance;
            const targetCamZ = this.physics.z - forwardZ * camDistance;
            const targetCamY = this.physics.y + camHeight;
            
            this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, delta * 8.0);
            this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, delta * 8.0);
            this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, delta * 8.0);
            
            const lookAhead = 8.0 + (speedKmh / maxSpeedKmh) * 10.0;
            const lookTarget = new THREE.Vector3(
                this.physics.x + forwardX * lookAhead,
                this.physics.y + 0.9,
                this.physics.z + forwardZ * lookAhead
            );
            this.camera.lookAt(lookTarget);
            
            // Dynamic Sun Shadow Follow
            if (this.sunLight) {
                this.sunLight.position.set(this.physics.x + 120, this.physics.y + 200, this.physics.z + 80);
                this.sunLight.target.position.set(this.physics.x, this.physics.y, this.physics.z);
                this.sunLight.target.updateMatrixWorld();
            }
            
            this.drawMinimap();
        }
        
        this.renderer.render(this.scene, this.camera);
        this.updateStats();
    }
    
    drawMinimap() {
        if (!this.minimapCtx || !this.physics) return;
        
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        // Draw Player Pointer
        const angle = this.physics.angle;
        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.rotate(-angle + Math.PI);
        
        ctx.fillStyle = '#55ff55';
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    
    updateStats() {
        this.fpsCount++;
        const now = performance.now();
        if (now - this.lastTime >= 1000) {
            const fpsEl = document.getElementById('fps-val');
            if (fpsEl) fpsEl.innerText = this.fpsCount;
            this.fpsCount = 0;
            this.lastTime = now;
        }
        
        if (this.physics) {
            const speedKmh = Math.round(this.physics.speed / 0.28);
            const speedEl = document.getElementById('speed-num');
            if (speedEl) speedEl.innerText = speedKmh;
            
            const gearEl = document.getElementById('gear-val');
            if (gearEl) gearEl.innerText = (this.physics.gear === 'R') ? 'GEAR R' : `GEAR ${this.physics.gear}`;
            
            const rpmBar = document.getElementById('rpm-bar');
            if (rpmBar) {
                const rpmPercent = Math.min(100, (this.physics.rpm / 8000) * 100);
                rpmBar.style.width = `${rpmPercent}%`;
            }
            
            const driftEl = document.getElementById('drift-alert');
            if (driftEl) {
                driftEl.style.visibility = this.physics.isDrifting ? 'visible' : 'hidden';
            }
        }
        
        const dcEl = document.getElementById('dc-val');
        if (dcEl) dcEl.innerText = this.renderer.info.render.calls;
        
        const triEl = document.getElementById('tri-val');
        if (triEl) triEl.innerText = this.renderer.info.render.triangles.toLocaleString();
        
        const buildEl = document.getElementById('build-val');
        if (buildEl) buildEl.innerText = this.mapLoader.buildings.length;
        
        const zoneEl = document.getElementById('zone-name');
        if (zoneEl && this.physics) {
            zoneEl.innerText = this.mapLoader.getCurrentZoneName(this.physics.x, this.physics.z);
        }
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

new TazaderTest();
