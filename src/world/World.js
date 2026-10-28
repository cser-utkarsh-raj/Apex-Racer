import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment } from './Environment.js';

export class World {
    constructor(game) {
        this.game = game;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Lighting
        this.ambientLight = null;
        this.dirLight = null;
        this.skyColor = new THREE.Color(0x0a0a1e);
        
        // Environment values
        this.sunAngle = 0; // 0 to 2PI (0 = noon, PI = midnight)
        this.dayDuration = 180; // 3 minutes full day cycle
        this.weatherState = 'clear'; // clear, rain, fog
        this.environmentEffects = null;
        
        this.init();
    }
    
    init() {
        const canvas = document.getElementById('game-canvas');
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = this.skyColor;
        this.scene.fog = new THREE.FogExp2(0x0a0a1e, 0.005);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 1000);
        
        // Lighting setup
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(this.ambientLight);
        
        this.dirLight = new THREE.DirectionalLight(0xfff5eb, 1.2);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 10;
        this.dirLight.shadow.camera.far = 300;
        
        const d = 120;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);
        
        this.environmentEffects = new Environment(this);
        
        // Resize listener
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    setMenuCamera() {
        this.camera.position.set(200, 180, 200);
        this.camera.lookAt(0, 0, 0);
        this.camera.fov = 60;
        this.camera.updateProjectionMatrix();
    }
    
    setGarageCamera() {
        // Place camera looking at the car platform (which is at 0, 0, 0)
        this.camera.position.set(0, 3.5, 9);
        this.camera.lookAt(0, 0.8, 0);
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
    }
    
    setDrivingCamera() {
        this.camera.fov = 65;
        this.camera.updateProjectionMatrix();
    }
    
    applyGraphicsSettings() {
        const graphics = this.game.settings.graphics;
        if (graphics === 'high') {
            this.renderer.shadowMap.enabled = true;
            this.dirLight.castShadow = true;
        } else if (graphics === 'medium') {
            this.renderer.shadowMap.enabled = false;
            this.dirLight.castShadow = false;
        } else {
            this.renderer.shadowMap.enabled = false;
            this.dirLight.castShadow = false;
        }
    }
    
    updateCamera(delta) {
        if (this.game.state !== 'FREE_ROAM' && this.game.state !== 'RACING') return;
        
        const car = this.game.playerVehicle;
        if (!car) return;
        
        // Smooth camera follow logic
        const speed = car.physics.speed;
        
        // Camera distances based on speed
        const speedMultiplier = 1.0 + (speed / car.physics.maxSpeed) * 0.25;
        const targetDistance = 7.5 * speedMultiplier;
        const targetHeight = 2.4 * speedMultiplier;
        
        // Calculate offset position behind player car
        // Car's forward angle
        const angle = car.physics.angle;
        
        const backX = Math.sin(angle) * targetDistance;
        const backZ = Math.cos(angle) * targetDistance;
        
        const targetCamPos = new THREE.Vector3(
            car.mesh.position.x - backX,
            car.mesh.position.y + targetHeight,
            car.mesh.position.z - backZ
        );
        
        // Interpolate camera position
        this.camera.position.lerp(targetCamPos, delta * 5.0);
        
        // Look slightly in front of the car
        const lookTarget = new THREE.Vector3(
            car.mesh.position.x + Math.sin(angle) * 3.0,
            car.mesh.position.y + 0.8,
            car.mesh.position.z + Math.cos(angle) * 3.0
        );
        
        this.camera.lookAt(lookTarget);
    }
    
    updateEnvironment(delta) {
        // Rotate day/night sun angle
        const timeSetting = this.game.settings.time;
        
        if (timeSetting === 'dynamic') {
            this.sunAngle += (delta / this.dayDuration) * 2 * Math.PI;
        } else if (timeSetting === 'day') {
            this.sunAngle = 0.2; // warm bright midday
        } else {
            this.sunAngle = Math.PI + 0.5; // midnight
        }
        
        // Wrap around
        this.sunAngle %= 2 * Math.PI;
        
        // Calculate light position and color based on angle
        const sin = Math.sin(this.sunAngle);
        const cos = Math.cos(this.sunAngle);
        
        // Set sun/moon direction
        this.dirLight.position.set(sin * 180, cos * 180, 50);
        
        // Day/Night transitions
        const isDay = cos > 0;
        
        if (isDay) {
            // Day mode: transition ambient and sky colors
            const intensity = cos; // 0 at horizon, 1 at peak
            
            // Bright blue clear daytime sky
            this.skyColor.setHSL(0.58, 0.55, 0.35 + intensity * 0.45); // beautiful bright sky
            this.scene.background = this.skyColor;
            
            // Adjust light colors
            this.dirLight.color.setHSL(0.08, 0.5, 0.5 + intensity * 0.5);
            this.dirLight.intensity = intensity * 2.0;
            this.ambientLight.color.setHSL(0.6, 0.2, 0.3 + intensity * 0.3);
            this.ambientLight.intensity = 0.5 + intensity * 0.3; // bright ambient shadows
            
            // Make shadows active
            if (this.game.settings.graphics === 'high') {
                this.dirLight.castShadow = true;
            }
        } else {
            // Night mode: moonlight
            const intensity = Math.abs(cos); // peak at midnight
            
            this.skyColor.setHSL(0.65, 0.6, 0.03); // dark blue
            this.scene.background = this.skyColor;
            
            this.dirLight.color.setHSL(0.6, 0.2, 0.4); 
            this.dirLight.intensity = intensity * 0.4;
            this.ambientLight.color.setHSL(0.6, 0.3, 0.1);
            this.ambientLight.intensity = 0.2;
            
            // Turn off shadows at night for performance unless setting is high
            if (this.game.settings.graphics !== 'high') {
                this.dirLight.castShadow = false;
            }
        }
        
        // Handle Fog
        const weatherSetting = this.game.settings.weather;
        if (weatherSetting === 'rain') {
            this.scene.fog.color = new THREE.Color(0x1a1a2b);
            this.scene.fog.density = 0.015;
            this.renderer.clearColor = 0x1a1a2b;
        } else if (weatherSetting === 'fog') {
            this.scene.fog.color = new THREE.Color(0x3a3a4e);
            this.scene.fog.density = 0.025;
        } else {
            // Clear sky
            this.scene.fog.color = this.skyColor;
            this.scene.fog.density = 0.003;
        }
        
        // Handle Environment particles
        if (this.environmentEffects) {
            this.environmentEffects.update(delta);
        }
        
        // Direct rendering call
        this.renderer.render(this.scene, this.camera);
    }
    
    updateMenuEffects(delta) {
        // Slow rotation around the city in menu mode
        this.sunAngle += delta * 0.05;
        const radius = 280;
        this.camera.position.set(
            Math.sin(this.sunAngle * 0.1) * radius,
            120 + Math.cos(this.sunAngle * 0.05) * 40,
            Math.cos(this.sunAngle * 0.1) * radius
        );
        
        // Spawn/garage coordinate is center
        this.camera.lookAt(0, -10, 0);
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
}
