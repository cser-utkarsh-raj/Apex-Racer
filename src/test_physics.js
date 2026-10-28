import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VehicleLoader } from './vehicles/VehicleLoader.js';

class SandboxPhysics {
    constructor() {
        this.heading = 0; // 0 = facing -Z
        this.speed = 0; // m/s
        this.x = 0;
        this.z = 0;
        this.steerInput = 0;
        
        // Specs for LaFerrari approx
        this.topSpeedMs = 350 * 0.27778; // ~97 m/s
        this.acceleration = 25; // m/s^2
        this.brakeForce = 45; // m/s^2
        this.maxTurnRate = 0.8; // rad/s
    }

    update(delta, controls) {
        if (delta <= 0) return;
        delta = Math.min(delta, 0.05);

        // 1. Throttle / Brake
        if (controls.throttle) {
            if (this.speed < -0.5) {
                this.speed += this.brakeForce * delta;
            } else {
                const speedRatio = Math.max(0, this.speed / this.topSpeedMs);
                const power = Math.max(0.1, 1.0 - Math.pow(speedRatio, 1.8));
                this.speed = Math.min(this.topSpeedMs, this.speed + this.acceleration * power * delta);
            }
        } else if (controls.brake) {
            if (this.speed > 0.5) {
                this.speed = Math.max(0, this.speed - this.brakeForce * delta);
            } else {
                this.speed = Math.max(-20, this.speed - (this.acceleration * 0.5) * delta);
            }
        } else {
            // Drag
            const drag = (5.0 + (this.speed > 50 ? (this.speed - 50) * 0.2 : 0)) * delta;
            if (Math.abs(this.speed) < drag) this.speed = 0;
            else this.speed -= Math.sign(this.speed) * drag;
        }

        // 2. Input smoothing
        if (controls.steerLeft) {
            this.steerInput = Math.min(1.0, this.steerInput + 5.0 * delta);
        } else if (controls.steerRight) {
            this.steerInput = Math.max(-1.0, this.steerInput - 5.0 * delta);
        } else {
            this.steerInput += (0 - this.steerInput) * Math.min(1.0, delta * 10.0);
            if (Math.abs(this.steerInput) < 0.001) this.steerInput = 0;
        }

        // 3. Simplified Physics Steering
        if (Math.abs(this.speed) > 0.5) {
            const speedRatio = Math.abs(this.speed) / this.topSpeedMs;
            
            // Arcade steering curve: responsive at low speed, less sensitive at high speed
            const steerStrength = THREE.MathUtils.lerp(
                1.0,
                0.25,
                THREE.MathUtils.smoothstep(speedRatio, 0.0, 1.0)
            );

            let yawRate = this.steerInput * this.maxTurnRate * steerStrength * Math.sign(this.speed);
            
            // Handbrake drift allows sharper turn
            if (controls.handbrake) {
                yawRate *= 1.3;
            }

            yawRate = THREE.MathUtils.clamp(yawRate, -0.8, 0.8);
            this.heading += yawRate * delta;
        }

        // 4. Integrate Position along Canonical -Z
        const forwardX = -Math.sin(this.heading);
        const forwardZ = -Math.cos(this.heading);

        // Simple arcade grip: velocity always matches heading immediately unless drifting
        // In this strict sandbox, we just lock velocity to heading for now.
        const vx = forwardX * this.speed;
        const vz = forwardZ * this.speed;

        this.x += vx * delta;
        this.z += vz * delta;
    }
}

async function initSandbox() {
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    scene.add(dirLight);

    // Infinite Flat Road
    const gridHelper = new THREE.GridHelper(1000, 100, 0x444444, 0x888888);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const roadGeo = new THREE.PlaneGeometry(10000, 10000);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    scene.add(road);

    // Load Canonical Vehicle
    const vehicleLoader = new VehicleLoader(null);
    const contract = await vehicleLoader.createVehicleMesh('gtv_ferrari_laferrari');
    const carMesh = contract.root;
    scene.add(carMesh);

    console.log("Canonical Vehicle Contract Loaded:", contract);

    // Add visual axis helper to car to verify orientation (-Z is forward)
    const axesHelper = new THREE.AxesHelper(3);
    carMesh.add(axesHelper);

    const physics = new SandboxPhysics();

    // Input Handling
    const keys = {};
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    const controls = { throttle: false, brake: false, steerLeft: false, steerRight: false, handbrake: false };

    // UI elements
    const uiSpeed = document.getElementById('speedout');
    const uiHeading = document.getElementById('headingout');
    const uiPos = document.getElementById('posout');

    let lastTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        controls.throttle = keys['KeyW'] || keys['ArrowUp'];
        controls.brake = keys['KeyS'] || keys['ArrowDown'];
        controls.steerLeft = keys['KeyA'] || keys['ArrowLeft'];
        controls.steerRight = keys['KeyD'] || keys['ArrowRight'];
        controls.handbrake = keys['Space'];

        physics.update(delta, controls);

        // SINGLE AUTHORITY for orientation and position
        carMesh.position.set(physics.x, 0, physics.z); // Y=0 because loader handles grounding offset internally
        carMesh.rotation.y = physics.heading;

        // Chase Camera
        const camOffset = new THREE.Vector3(
            Math.sin(physics.heading) * 6, // 6m behind
            2.5,                           // 2.5m up
            Math.cos(physics.heading) * 6
        );
        camera.position.copy(carMesh.position).add(camOffset);
        camera.lookAt(carMesh.position.x, carMesh.position.y + 1, carMesh.position.z);

        renderer.render(scene, camera);

        // Update UI
        uiSpeed.innerText = `Speed: ${(Math.abs(physics.speed) / 0.27778).toFixed(1)} km/h`;
        uiHeading.innerText = `Heading: ${physics.heading.toFixed(4)} rad`;
        uiPos.innerText = `Pos: (${physics.x.toFixed(2)}, 0.00, ${physics.z.toFixed(2)})`;
    }

    animate();
}

window.addEventListener('resize', () => {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

initSandbox();
