import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { VehiclePhysics } from './vehicles/VehiclePhysics.js';
import { VehicleLoader } from './vehicles/VehicleLoader.js';
import { mergeVehicleParts } from './vehicles/VehicleMerger.js';
import { WorldAssemblerV3 } from './world/WorldAssemblerV3.js';
import { createGradePass } from './world/PostFX.js';
import { TrafficSystem } from './traffic/TrafficSystem.js';
import { RaceManager } from './race/RaceManager.js';
import { GarageUI } from './ui/GarageUI.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { TouchControls, detectTouch } from './ui/TouchControls.js';
import { registerWhenReady, warmRuntimeCache } from './pwa.js';

class ApexGame {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.clock = new THREE.Clock();
        
        this.vehicleLoader = new VehicleLoader(this);
        
        this.worldAssemblerV3 = new WorldAssemblerV3(this);
        this.world = this.worldAssemblerV3;
        this.mapLoader = this.worldAssemblerV3;
        
        this.trafficSystem = new TrafficSystem(this);
        this.raceManager = new RaceManager(this);
        this.garageUI = new GarageUI(this);
        this.audioEngine = new AudioEngine();
        
        this.currentScreen = 'MENU';
        this.currentWorldId = 'neo_tazader';
        this.keys = {};
        
        this.carMesh = null;
        this.physics = null;
        this.wheels = { fl: [], fr: [], rl: [], rr: [] };
        
        this.minimapCanvas = null;
        this.minimapCtx = null;
        this.touchStartX = 0;

        // Touch devices get the on-screen cockpit and a cheaper render path.
        // `?touch=1` / `?touch=0` override detection for QA and hybrids.
        const coarse = typeof window.matchMedia === 'function' &&
            window.matchMedia('(pointer: coarse)').matches;
        this.isTouch = detectTouch({
            maxTouchPoints: (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0,
            coarsePointer: coarse,
            touchEvent: typeof window !== 'undefined' && 'ontouchstart' in window,
            search: typeof location !== 'undefined' ? location.search : ''
        });
        this.touchControls = null;
        
        this.init();
    }
    
    isKeyPressed(key) {
        return !!this.keys[key];
    }
    
    async init() {
        const canvas = document.getElementById('game-canvas');
        
        // 1. Scene & Atmosphere (Dense Fog)
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x6eb7e8);
        this.scene.fog = new THREE.FogExp2(0x6eb7e8, 0.0040); // Even thicker atmospheric fog
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: false, // Turn off antialiasing for composer performance
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.15 : 1.5));
        this.renderer.shadowMap.enabled = !this.isTouch;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;
        // Draw-call telemetry needs the whole post-processing chain, so count
        // across all passes and reset once per frame instead of per pass.
        this.renderer.info.autoReset = false;
        
        this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 3500);
        
        // Post-Processing Pipeline
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Ambient occlusion is what stops the voxel architecture from looking
        // like flat cardboard. Desktops get the full pass; phones skip it.
        this._devParams = new URLSearchParams(location.search);
        const wantsAO = this._devParams.get('ssao') === '1' || this._devParams.get('quality') === 'high';
        if (!this.isTouch && wantsAO) {
            this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
            this.ssaoPass.kernelRadius = 1.6;
            this.ssaoPass.minDistance = 0.002;
            this.ssaoPass.maxDistance = 0.18;
            this.composer.addPass(this.ssaoPass);
        }

        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.85);
        this.composer.addPass(bloomPass);
        this.bloomPass = bloomPass;

        // Tone-map / colour-space conversion must happen inside the composer,
        // otherwise the whole frame is displayed in linear light (dark, grey
        // and undersaturated). OutputPass is the canonical fix.
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.material.uniforms.resolution.value.set(
            1 / (window.innerWidth * this.renderer.getPixelRatio()),
            1 / (window.innerHeight * this.renderer.getPixelRatio())
        );
        this.composer.addPass(this.fxaaPass);

        this.gradePass = createGradePass();
        this.composer.addPass(this.gradePass);
        
        // Lighting
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.8);
        this.scene.add(this.hemiLight);
        
        this.sunLight = new THREE.DirectionalLight(0xfff8ea, 2.3);
        this.sunLight.position.set(250, 450, 150);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 1024;
        this.sunLight.shadow.mapSize.height = 1024;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 700;
        const d = 140;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.camera.updateProjectionMatrix();
        this.sunLight.shadow.bias = -0.0004;
        this.scene.add(this.sunLight);
        
        // Showroom Podium
        const podiumGroup = new THREE.Group();
        podiumGroup.name = "garage_podium";
        const podGeo = new THREE.CylinderGeometry(5.5, 5.8, 0.25, 48);
        const podMat = new THREE.MeshStandardMaterial({ color: 0x0e131d, roughness: 0.2, metalness: 0.8 });
        const podMesh = new THREE.Mesh(podGeo, podMat);
        podMesh.position.set(0, 0.12, 5000);
        podMesh.receiveShadow = true;
        podiumGroup.add(podMesh);
        
        const ringGeo = new THREE.TorusGeometry(5.2, 0.08, 16, 64);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(0, 0.26, 5000);
        podiumGroup.add(ringMesh);
        this.scene.add(podiumGroup);
        
        // 2. Setup UI & Keyboard
        this.setupUI();
        this.setupKeyboard();
        this.setupTouch();
        this.registerPwa();
        
        // 3. Subsystems
        this.trafficSystem.init();
        this.raceManager.init();
        
        this.minimapCanvas = document.getElementById('minimap-canvas');
        if (this.minimapCanvas) {
            this.minimapCtx = this.minimapCanvas.getContext('2d');
        }
        
        // 4. Start animation loop
        this.animate();
        
        // 5. Async World & Vehicle Load
        try {
            const bar = document.getElementById('loading-bar');
            if (bar) bar.style.width = '30%';
            
            await this.mapLoader.loadWorld('neo_tazader');
            
            if (bar) bar.style.width = '70%';
            await this.loadVehicle(this.garageUI.getCurrentCar());
            // Bake the traffic models while the loading screen is still up.
            if (bar) bar.style.width = '85%';
            if (this.trafficSystem && this.trafficSystem.prewarm) {
                await this.trafficSystem.prewarm();
            }
            this.updateMenuDisplay();
            if (bar) bar.style.width = '100%';
            
            setTimeout(() => {
                const ls = document.getElementById('loading-screen');
                if (ls) {
                    ls.style.opacity = '0';
                    setTimeout(() => ls.style.display = 'none', 500);
                }
            }, 400);
            
        } catch (e) {
            console.warn("Async init load error:", e);
        }
        
        this.raceManager.onRaceFinished = (res) => {
            document.getElementById('res-event-name').innerText = res.eventName;
            document.getElementById('res-final-time').innerText = `${res.time.toFixed(2)}s`;
            document.getElementById('res-cash').innerText = `+$${res.rewardCash.toLocaleString()}`;
            document.getElementById('res-rep').innerText = `+${res.rewardRep} REP`;
            document.getElementById('results-overlay').style.display = 'flex';
        };

        // Dev/QA harness. `?autostart=1&world=<id>&drive=1&telemetry=1`
        // boots straight into a world and mirrors physics into the tab title,
        // which lets a headless browser smoke-test the real game. No effect
        // on normal play.
        this._dev = new URLSearchParams(location.search);
        window.__apex = this;
        if (this._dev.get('autostart')) {
            const id = this._dev.get('world');
            if (id) {
                this.currentWorldId = id;
                await this.mapLoader.loadWorld(id);
            }
            this.showScreen('GAME');
            this.placeCarAtSpawn();
            if (this._dev.get('drive')) this.keys.w = true;
            const steer = this._dev.get('steer');
            if (steer) this.keys[steer] = true;
        }
    }
    
    setupKeyboard() {
        // Keys that would otherwise scroll the page or move focus while driving.
        const GAME_KEYS = new Set([
            'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ',
            'w', 'a', 's', 'd', 'shift'
        ]);

        const isTyping = (target) => !!target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        );

        // Losing focus mid-corner used to leave throttle/steer stuck on.
        const releaseKeys = () => {
            this.keys = {};
            if (this.touchControls) this.touchControls.releaseAll();
        };
        window.addEventListener('blur', releaseKeys);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) releaseKeys();
        });

        window.addEventListener('keydown', async (e) => {
            if (isTyping(e.target)) return;
            const key = e.key.toLowerCase();

            if (this.currentScreen === 'GAME' && GAME_KEYS.has(key)) {
                e.preventDefault();
            }

            this.keys[key] = true;
            
            if (e.key === 'Escape') {
                if (this.currentScreen === 'GAME') {
                    this.showScreen('MENU');
                }
            }
            
            // Main Menu Shortcuts
            if (this.currentScreen === 'MENU') {
                if (key === 'enter' || key === ' ') {
                    e.preventDefault();
                    this.showScreen('GAME');
                    this.placeCarAtSpawn();
                } else if (key === 'g') {
                    this.showScreen('GARAGE');
                    this.updateGarageDisplay();
                } else if (key === 'w') {
                    document.getElementById('world-select-overlay').style.display = 'flex';
                }
            }

            if (key === 'm') {
                this.toggleSound();
            }
            
            if (e.key === 'F8') {
                const dbg = document.getElementById('debug-overlay');
                if (dbg) {
                    dbg.style.display = (dbg.style.display === 'none' || dbg.style.display === '') ? 'block' : 'none';
                }
            }
            
            // Garage Arrow Key Car Cycling
            if (this.currentScreen === 'GARAGE') {
                if (e.key === 'ArrowLeft' || key === 'a') {
                    const car = this.garageUI.prevCar();
                    this.updateGarageDisplay();
                    await this.loadVehicle(car);
                } else if (e.key === 'ArrowRight' || key === 'd') {
                    const car = this.garageUI.nextCar();
                    this.updateGarageDisplay();
                    await this.loadVehicle(car);
                }
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
        
        // Touch Swipe
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                this.touchStartX = e.touches[0].clientX;
            }
        });
        
        window.addEventListener('touchend', async (e) => {
            if (this.currentScreen === 'GARAGE' && e.changedTouches.length > 0) {
                const diff = e.changedTouches[0].clientX - this.touchStartX;
                if (diff > 45) {
                    const car = this.garageUI.prevCar();
                    this.updateGarageDisplay();
                    await this.loadVehicle(car);
                } else if (diff < -45) {
                    const car = this.garageUI.nextCar();
                    this.updateGarageDisplay();
                    await this.loadVehicle(car);
                }
            }
        });
        
        window.addEventListener('resize', () => this.applyRenderScale());
        window.addEventListener('orientationchange', () => {
            // Mobile browsers report the old size for a frame or two, and a
            // finger held through the rotation should not keep driving.
            if (this.touchControls) this.touchControls.releaseAll();
            setTimeout(() => this.applyRenderScale(), 250);
        });
    }

    /** Keep renderer, camera and post-processing in sync with the viewport. */
    applyRenderScale() {
        if (!this.renderer || !this.camera) return;
        const cap = this.isTouch ? 1.15 : 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.composer) {
            if (typeof this.composer.setPixelRatio === 'function') {
                this.composer.setPixelRatio(this.renderer.getPixelRatio());
            }
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.ssaoPass) this.ssaoPass.setSize(window.innerWidth, window.innerHeight);
        if (this.fxaaPass) {
            const pr = this.renderer.getPixelRatio();
            this.fxaaPass.material.uniforms.resolution.value.set(
                1 / (window.innerWidth * pr),
                1 / (window.innerHeight * pr)
            );
        }
    }

    /** Mount the on-screen cockpit on phones/tablets. */
    setupTouch() {
        if (!this.isTouch) return;
        document.body.classList.add('touch-mode');
        const root = document.getElementById('touch-controls');
        if (!root) return;

        this.touchControls = new TouchControls(root, {
            onChange: () => {
                // The first touch is also the gesture iOS needs to start audio.
                if (this.audioEngine) {
                    this.audioEngine.init();
                    this.audioEngine.resumeContext();
                }
            }
        }).mount();
        this.touchControls.setVisible(this.currentScreen === 'GAME');
    }

    /** Installable PWA: no button, the browser decides when to offer it. */
    registerPwa() {
        registerWhenReady({ search: location.search }).then((registration) => {
            if (!registration) return;
            // The first visit happens before the worker controls the page, so
            // hand it the URLs that were loaded (modules, textures, tiles) and
            // repeat once the world has finished streaming.
            warmRuntimeCache({ registration });
            setTimeout(() => warmRuntimeCache({ registration }), 8000);
        });
    }

    isTouchPressed(action) {
        return !!(this.touchControls && this.touchControls.state[action]);
    }
    
    setupUI() {
        const soundBtn = document.getElementById('btn-sound-toggle');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                this.toggleSound();
            });
        }
        
        const freeroamBtn = document.getElementById('btn-freeroam');
        if (freeroamBtn) {
            freeroamBtn.addEventListener('click', () => {
                this.showScreen('GAME');
                document.getElementById('race-banner').style.display = 'none';
                this.placeCarAtSpawn();
            });
        }
        
        const garageBtn = document.getElementById('btn-garage');
        if (garageBtn) {
            garageBtn.addEventListener('click', () => {
                this.showScreen('GARAGE');
                this.updateGarageDisplay();
            });
        }
        
        const worldSelectBtn = document.getElementById('btn-world-select');
        if (worldSelectBtn) {
            worldSelectBtn.addEventListener('click', () => {
                document.getElementById('world-select-overlay').style.display = 'flex';
            });
        }
        
        const worldCloseBtn = document.getElementById('btn-world-close');
        if (worldCloseBtn) {
            worldCloseBtn.addEventListener('click', () => {
                document.getElementById('world-select-overlay').style.display = 'none';
            });
        }
        
        document.querySelectorAll('.world-pick-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelectorAll('.world-pick-btn').forEach(b => b.classList.remove('active-world'));
                btn.classList.add('active-world');
                const worldId = btn.getAttribute('data-world');
                this.currentWorldId = worldId;
                document.getElementById('world-select-overlay').style.display = 'none';
                await this.mapLoader.loadWorld(worldId);
                this.updateMenuDisplay();
                if (this.currentScreen === 'GAME') this.snapCarToTrack();
            });
        });
        
        const racesBtn = document.getElementById('btn-races');
        if (racesBtn) {
            racesBtn.addEventListener('click', () => {
                this.showScreen('GAME');
                const event = this.mapLoader.events[0];
                if (event) {
                    this.raceManager.startEvent(event);
                    document.getElementById('race-banner').style.display = 'block';
                    document.getElementById('hud-race-title').innerText = event.name;
                }
            });
        }
        
        const settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                document.getElementById('settings-overlay').style.display = 'flex';
            });
        }
        
        const settingsCloseBtn = document.getElementById('btn-settings-close');
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', () => {
                document.getElementById('settings-overlay').style.display = 'none';
            });
        }
        
        // Traffic Density Buttons
        document.querySelectorAll('.setting-traffic-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.setting-traffic-btn').forEach(b => b.classList.remove('pixel-btn-primary'));
                btn.classList.add('pixel-btn-primary');
                const density = btn.getAttribute('data-traffic');
                this.trafficSystem.setDensity(density);
            });
        });
        
        // Time of Day
        document.querySelectorAll('.setting-tod-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.setting-tod-btn').forEach(b => b.classList.remove('pixel-btn-primary'));
                btn.classList.add('pixel-btn-primary');
                const tod = btn.getAttribute('data-tod');
                this.setTimeOfDay(tod);
            });
        });
        
        const garageCloseBtn = document.getElementById('btn-garage-close');
        if (garageCloseBtn) {
            garageCloseBtn.addEventListener('click', () => {
                this.showScreen('MENU');
            });
        }
        
        const carPrevBtn = document.getElementById('btn-car-prev');
        if (carPrevBtn) {
            carPrevBtn.addEventListener('click', async () => {
                const car = this.garageUI.prevCar();
                this.updateGarageDisplay();
                await this.loadVehicle(car);
            });
        }
        
        const carNextBtn = document.getElementById('btn-car-next');
        if (carNextBtn) {
            carNextBtn.addEventListener('click', async () => {
                const car = this.garageUI.nextCar();
                this.updateGarageDisplay();
                await this.loadVehicle(car);
            });
        }
        
        const driveSelectedBtn = document.getElementById('btn-drive-selected');
        if (driveSelectedBtn) {
            driveSelectedBtn.addEventListener('click', () => {
                this.showScreen('GAME');
                document.getElementById('race-banner').style.display = 'none';
            });
        }
        
        const pauseBtn = document.getElementById('btn-pause-menu');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                this.showScreen('MENU');
            });
        }
        
        const resContinueBtn = document.getElementById('btn-res-continue');
        if (resContinueBtn) {
            resContinueBtn.addEventListener('click', () => {
                document.getElementById('results-overlay').style.display = 'none';
                this.showScreen('GARAGE');
                this.updateGarageDisplay();
            });
        }
    }
    
    setTimeOfDay(tod) {
        if (tod === 'day') {
            this.scene.background.setHex(0x6eb7e8);
            this.scene.fog.color.setHex(0xa8d2ec);
            this.sunLight.color.setHex(0xfff8ea);
            this.sunLight.intensity = 2.3;
        } else if (tod === 'sunset') {
            this.scene.background.setHex(0xff7744);
            this.scene.fog.color.setHex(0xbb5533);
            this.sunLight.color.setHex(0xffaa55);
            this.sunLight.intensity = 1.8;
        } else if (tod === 'night') {
            this.scene.background.setHex(0x06080e);
            this.scene.fog.color.setHex(0x090d16);
            this.sunLight.color.setHex(0x224488);
            this.sunLight.intensity = 0.5;
        }
    }
    
    updateGarageDisplay() {
        const car = this.garageUI.getCurrentCar();
        document.getElementById('garage-car-title').innerText = car.name.toUpperCase();
        document.getElementById('garage-car-class').innerText = `${car.class.toUpperCase()} • $${car.price.toLocaleString()}`;
        
        document.getElementById('feat-engine').innerText = car.engine;
        document.getElementById('feat-drive').innerText = car.drivetrain;
        document.getElementById('feat-hp').innerText = car.power;
        document.getElementById('feat-trans').innerText = car.trans;
        
        document.getElementById('stat-val-speed').innerText = `${car.topSpeed} km/h`;
        document.getElementById('stat-bar-speed').style.width = `${Math.min(100, (car.topSpeed / 350) * 100)}%`;
        
        document.getElementById('stat-val-accel').innerText = car.accel.toFixed(1);
        document.getElementById('stat-bar-accel').style.width = `${car.accel * 10}%`;
        
        document.getElementById('stat-val-handle').innerText = car.handling.toFixed(1);
        document.getElementById('stat-bar-handle').style.width = `${car.handling * 10}%`;
        
        document.getElementById('stat-val-drift').innerText = car.drift.toFixed(1);
        document.getElementById('stat-bar-drift').style.width = `${car.drift * 10}%`;
        this.updateMenuDisplay();
    }
    
    updateMenuDisplay() {
        const carEl = document.getElementById('menu-current-car');
        if (carEl && this.garageUI) {
            const car = this.garageUI.getCurrentCar();
            carEl.innerText = car ? car.name.toUpperCase() : 'FERRARI LAFERRARI';
        }
        const worldEl = document.getElementById('menu-current-world');
        if (worldEl) {
            const labels = {
                neo_tazader: 'NEO-TAZADER DOWNTOWN',
                chiang_tung: 'CHIANG TUNG PASS',
                curitiba: 'CURITIBA COASTLINE',
                nantwich: 'NANTWICH HIGHLANDS'
            };
            worldEl.innerText = labels[this.currentWorldId] || (this.currentWorldId ? this.currentWorldId.toUpperCase() : 'NEO-TAZADER');
        }
    }

    toggleSound() {
        if (!this.audioEngine) return;
        const isMuted = this.audioEngine.toggleMute();
        const icon = document.getElementById('sound-icon');
        const text = document.getElementById('sound-text');
        if (icon) icon.innerText = isMuted ? '🔇' : '🔊';
        if (text) text.innerText = isMuted ? 'AUDIO: MUTED [M]' : 'AUDIO: ON [M]';
    }

    showLapBanner() {
        this.currentLap = (this.currentLap || 1) + 1;
        const banner = document.getElementById('race-banner');
        if (banner) {
            banner.style.display = 'block';
            banner.innerText = `CIRCUIT LOOP • LAP ${this.currentLap}`;
            setTimeout(() => {
                if (this.currentScreen === 'GAME' && (!this.raceManager || !this.raceManager.currentEvent)) {
                    banner.style.display = 'none';
                }
            }, 3000);
        }
    }
    
    showScreen(screen) {
        this.currentScreen = screen;
        if (this.audioEngine) {
            this.audioEngine.setMode(screen);
        }
        
        document.getElementById('main-menu-screen').classList.toggle('active', screen === 'MENU');
        document.getElementById('garage-screen').classList.toggle('active', screen === 'GARAGE');
        document.getElementById('hud-screen').classList.toggle('active', screen === 'GAME');
        document.body.classList.toggle('playing', screen === 'GAME');
        if (this.touchControls) this.touchControls.setVisible(screen === 'GAME');
        
        if (screen === 'GARAGE' || screen === 'MENU') {
            if (screen === 'MENU') {
                this.updateMenuDisplay();
            }
            if (this.carMesh) {
                this.carMesh.position.set(0, 0.25, 5000);
                this.carMesh.rotation.y = 0;
            }
            if (screen === 'GARAGE') {
                this.camera.position.set(0, 1.4, 5000 + 4.6);
                this.camera.lookAt(new THREE.Vector3(0, 0.75, 5000));
            }
        } else if (screen === 'GAME') {
            if (this.physics && this.carMesh) {
                // Coming back from the showroom (z = 5000) always starts at the
                // baked map's spawn gate, heading down the real street.
                if (Math.abs(this.physics.z) > 2000) {
                    this.placeCarAtSpawn();
                }
                this.carMesh.position.set(this.physics.x, this.physics.y, this.physics.z);
                this.carMesh.rotation.y = this.physics.angle;
                this.snapCamera();
            }
        }
    }

    /** Reset car + camera to the start of the baked route. */
    placeCarAtSpawn(spawn = null) {
        if (!this.physics) return;
        const s = spawn || (this.world && this.world.getSpawnPoint
            ? this.world.getSpawnPoint()
            : { x: 0, y: 0.25, z: 0, angle: 0 });

        this.physics.x = s.x;
        this.physics.y = s.y;
        this.physics.z = s.z;
        this.physics.angle = s.angle || 0;
        this.physics.speed = 0;
        this.physics.vx = 0;
        this.physics.vz = 0;
        this.physics.steerInput = 0;
        this.physics.steerAngle = 0;
        this.physics.isDrifting = false;
        this.physics.isNitroActive = false;

        if (this.mapLoader && this.mapLoader.syncChunks) {
            this.mapLoader.syncChunks(this.physics.z, true);
        }
        if (this.carMesh) {
            this.carMesh.position.set(this.physics.x, this.physics.y, this.physics.z);
            this.carMesh.rotation.y = this.physics.angle;
        }
        this.snapCamera();
    }

    /** Hard-snap the chase camera behind the car (used after teleports). */
    snapCamera() {
        if (!this.physics) return;
        const p = this.physics;
        const forwardX = -Math.sin(p.angle);
        const forwardZ = -Math.cos(p.angle);
        this.camera.position.set(
            p.x - forwardX * 5.8,
            p.y + 2.0,
            p.z - forwardZ * 5.8
        );
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(
            new THREE.Vector3(p.x + forwardX * 12, p.y + 0.9, p.z + forwardZ * 12)
        );
        this._camRoll = 0;
    }
    
    snapCarToTrack() {
        if (!this.physics || !this.world) return;
        const route = this.world.route;
        const zMin = route ? route.zMin + 4 : -1e9;
        const zMax = route ? route.zMax - 4 : 1e9;
        this.physics.z = Math.min(zMax, Math.max(zMin, this.physics.z));

        const bounds = this.world.getRoadBounds(this.physics.z);
        this.physics.x = bounds.centerX;
        this.physics.y = this.world.getTrackHeight(this.physics.x, this.physics.z);
        this.physics.angle = Number.isFinite(bounds.heading) ? bounds.heading : this.physics.angle;
        this.physics.speed = 0;
        this.physics.vx = 0;
        this.physics.vz = 0;
        this.physics.steerInput = 0;
        this.physics.steerAngle = 0;

        if (this.mapLoader && this.mapLoader.syncChunks) {
            this.mapLoader.syncChunks(this.physics.z, true);
        }
        if (this.carMesh) {
            this.carMesh.position.set(this.physics.x, this.physics.y, this.physics.z);
            this.carMesh.rotation.y = this.physics.angle;
        }
        this.snapCamera();
    }

    async loadVehicle(carInfo) {
        console.log(`Loading vehicle: ${carInfo.name}...`);
        
        if (this.carMesh) {
            this.scene.remove(this.carMesh);
        }
        
        this.wheels = { fl: [], fr: [], rl: [], rr: [] };
        
        const contract = await this.vehicleLoader.createVehicleMesh(carInfo.id);
        this.carMesh = contract.root;
        
        // STRICT wheel bone matching
        const WHEEL_NAMES = {
            fl: ['pneu1', 'tire0', 'wheel_fl', 'front_left_wheel', 'frontleftwheel'],
            fr: ['pneu2', 'tire1', 'wheel_fr', 'front_right_wheel', 'frontrightwheel'],
            rl: ['pneu3', 'tire2', 'wheel_rl', 'rear_left_wheel', 'rearleftwheel'],
            rr: ['pneu4', 'tire3', 'tire4', 'tire5', 'wheel_rr', 'rear_right_wheel', 'rearrightwheel']
        };
        
        this.carMesh.traverse(child => {
            if (child.isGroup) {
                const name = child.name.toLowerCase();
                if (WHEEL_NAMES.fl.includes(name)) this.wheels.fl.push(child);
                else if (WHEEL_NAMES.fr.includes(name)) this.wheels.fr.push(child);
                else if (WHEEL_NAMES.rl.includes(name)) this.wheels.rl.push(child);
                else if (WHEEL_NAMES.rr.includes(name)) this.wheels.rr.push(child);
            }
        });

        // VehicleLoader builds one mesh per voxel cube (~600 draw calls for a
        // hypercar). Bake the body into one mesh and each wheel into one mesh,
        // keeping the wheel groups themselves so spin/steer still animates.
        const wheelGroups = [...new Set([
            ...this.wheels.fl, ...this.wheels.fr, ...this.wheels.rl, ...this.wheels.rr
        ])];
        const bodyMerge = mergeVehicleParts(this.carMesh, {
            keepGroups: wheelGroups,
            name: 'merged_body'
        });
        for (const wheel of wheelGroups) {
            mergeVehicleParts(wheel, { name: 'merged_wheel' });
        }
        console.log(`[Vehicle] ${carInfo.id}: ${bodyMerge.merged} body batch(es), ` +
            `${bodyMerge.removed} parts baked, ${wheelGroups.length} wheels kept.`);

        this.scene.add(this.carMesh);
        
        const specs = {
            topSpeed: Math.min(270, (carInfo.topSpeed || 280) * 0.76),
            acceleration: (carInfo.accel || 8.0) * 1.65,
            brakeForce: 78.0,
            handling: (carInfo.handling || 9.0) / 8.5,
            driftGrip: 0.88 - ((carInfo.drift || 8.0) / 90.0)
        };
        
        const showroom = (this.currentScreen === 'GARAGE' || this.currentScreen === 'MENU');
        const spawn = (!showroom && this.world && this.world.getSpawnPoint)
            ? this.world.getSpawnPoint()
            : { x: 0, y: 0.25, z: 5000, angle: 0 };
        const initialX = showroom ? 0 : spawn.x;
        const initialZ = showroom ? 5000 : spawn.z;
        const initialY = showroom ? 0.25 : spawn.y;
        const initialAngle = showroom ? 0 : spawn.angle;
        
        this.physics = new VehiclePhysics(this, specs);
        this.physics.x = initialX;
        this.physics.z = initialZ;
        this.physics.y = initialY;
        this.physics.angle = initialAngle;
        
        this.carMesh.position.set(initialX, initialY, initialZ);
        this.carMesh.rotation.y = initialAngle;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.loop();
    }
    
    loop() {
        const delta = Math.min(this.clock.getDelta(), 0.05);
        if (this.renderer && this.renderer.info) this.renderer.info.reset();
        
        if (this.currentScreen === 'GARAGE') {
            if (this.carMesh) {
                this.carMesh.rotation.y += delta * 0.45;
                // On phones the specs card is docked right, so pan the view to
                // keep the rotating car visible on the left half of the screen.
                const pan = this.isTouch && window.innerWidth > window.innerHeight ? 1.9 : 0;
                this.camera.position.set(pan, 1.4, 5000 + 4.6);
                this.camera.lookAt(new THREE.Vector3(pan, 0.75, 5000));
            }
        } else if (this.currentScreen === 'MENU') {
            if (this.carMesh) {
                // Slow dramatic panning camera around the showroom vehicle
                const t = performance.now() * 0.0001;
                const radius = 5.5;
                this.camera.position.set(Math.sin(t) * radius, 1.2, 5000 + Math.cos(t) * radius);
                this.camera.lookAt(new THREE.Vector3(0, 0.6, 5000));
                this.carMesh.rotation.y = 0; // Keep car still in menu
            }
        } else if (this.currentScreen === 'GAME' && this.physics && this.carMesh) {
            const controls = {
                throttle: this.isKeyPressed('w') || this.isKeyPressed('arrowup') || this.isTouchPressed('throttle'),
                brake: this.isKeyPressed('s') || this.isKeyPressed('arrowdown') || this.isTouchPressed('brake'),
                steerLeft: this.isKeyPressed('a') || this.isKeyPressed('arrowleft') || this.isTouchPressed('steerLeft'),
                steerRight: this.isKeyPressed('d') || this.isKeyPressed('arrowright') || this.isTouchPressed('steerRight'),
                handbrake: this.isKeyPressed(' ') || this.isKeyPressed('space') || this.isTouchPressed('handbrake'),
                nitro: this.isKeyPressed('shift') || this.isTouchPressed('nitro')
            };
            
            this.physics.update(delta, controls);
            this.trafficSystem.update(delta);
            this.raceManager.update(delta);
            this.mapLoader.update(delta, this.physics.z);
            
            const speedKmh = Math.round(this.physics.speed / 0.27778);
            
            if (this.audioEngine) {
                this.audioEngine.update(speedKmh, this.physics.isDrifting, this.physics.isNitroActive);
            }
            
            // Canonical mesh placement: rotation.y is strictly physics.angle
            this.carMesh.position.set(this.physics.x, this.physics.y, this.physics.z);
            this.carMesh.rotation.y = this.physics.angle;
            
            // Wheel animations
            const speed = this.physics.speed;
            const spinDelta = speed * 1.5 * delta;
            const steerTarget = this.physics.steerAngle * 0.75;
            
            const spin = (w, isFront) => {
                w.rotation.x -= spinDelta;
                if (isFront) {
                    // Positive steer input turns left, and a +Y wheel rotation
                    // also points the wheel left for the canonical -Z car.
                    w.rotation.y = THREE.MathUtils.lerp(w.rotation.y, steerTarget, delta * 14.0);
                }
            };
            
            this.wheels.fl.forEach(w => spin(w, true));
            this.wheels.fr.forEach(w => spin(w, true));
            this.wheels.rl.forEach(w => spin(w, false));
            this.wheels.rr.forEach(w => spin(w, false));
            
            // Dynamic Speed FOV Curve
            const targetFov = 62 + Math.min(16, (speedKmh / 300) * 16) + (this.physics.isNitroActive ? 8 : 0);
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 8.0);
            this.camera.updateProjectionMatrix();
            
            // Canonical Chase Camera (Sits behind along +Z relative to angle, looks ahead toward -Z)
            const forwardX = -Math.sin(this.physics.angle);
            const forwardZ = -Math.cos(this.physics.angle);
            const rightX = -forwardZ;
            const rightZ = forwardX;
            const speedFactor = Math.min(1, speedKmh / 320);
            const camHeight = 1.95 + speedFactor * 0.3;
            const camDist = 5.6 + speedFactor * 1.6;
            const sway = -this.physics.steerInput * (0.28 + speedFactor * 0.7);
            
            const targetCamX = this.physics.x - forwardX * camDist + rightX * sway;
            const targetCamZ = this.physics.z - forwardZ * camDist + rightZ * sway;
            const targetCamY = this.physics.y + camHeight;
            
            const posK = 1 - Math.exp(-delta * 11.0);
            const yK = 1 - Math.exp(-delta * 7.5);
            this.camera.position.x += (targetCamX - this.camera.position.x) * posK;
            this.camera.position.z += (targetCamZ - this.camera.position.z) * posK;
            this.camera.position.y += (targetCamY - this.camera.position.y) * yK;
            
            const lookTarget = new THREE.Vector3(
                this.physics.x + forwardX * 12.0 + rightX * this.physics.steerInput * 1.4,
                this.physics.y + 0.95,
                this.physics.z + forwardZ * 12.0 + rightZ * this.physics.steerInput * 1.4
            );
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(lookTarget);
            
            // Subtle chassis roll so corners feel loaded without making the
            // player seasick on straights.
            const targetRoll = -this.physics.steerInput * speedFactor * 0.045;
            this._camRoll = (this._camRoll || 0) + (targetRoll - (this._camRoll || 0)) * (1 - Math.exp(-delta * 5.0));
            this.camera.rotateZ(this._camRoll);
            
            // Sun follow
            if (this.sunLight) {
                this.sunLight.position.set(this.physics.x + 120, this.physics.y + 250, this.physics.z + 80);
                this.sunLight.target.position.set(this.physics.x, this.physics.y, this.physics.z);
                this.sunLight.target.updateMatrixWorld();
            }
            
            this.updateHUD(speedKmh);
            const baseBloom = (this.world && this.world.bloomStrength) || 1.2;
            const targetBloom = this.physics.isNitroActive ? baseBloom + 1.1 : baseBloom;
            this.bloomPass.strength = THREE.MathUtils.lerp(this.bloomPass.strength, targetBloom, delta * 5.0);
            this.drawMinimap();
        }
        
        if (this.gradePass) this.gradePass.uniforms.uTime.value += delta;

        // Shadows follow the car, but a 1-frame-old sun position is invisible
        // at speed. Refreshing the map every other frame halves the cost of
        // the heaviest pass in the pipeline.
        this._shadowFrame = (this._shadowFrame || 0) + 1;
        if (this._shadowFrame % 2 === 0 && this.renderer.shadowMap.enabled) {
            this.renderer.shadowMap.needsUpdate = true;
        }
        this.composer.render();

        if (this.world && this.world.stats && this.renderer && this.renderer.info) {
            this.world.stats.drawCalls = this.renderer.info.render.calls;
        }

        // Dev/QA telemetry (see the autostart hook above). The title is the
        // only output a headless `--dump-dom` run can read back.
        if (this._dev && this._dev.get('telemetry')) {
            const p = this.physics;
            const s = (this.world && this.world.stats) || {};
            const kmh = p ? Math.abs(Math.round(p.speed / 0.27778)) : 0;
            document.title = `APEX|${this.currentWorldId}|${kmh}kmh|` +
                `x${p ? p.x.toFixed(0) : '-'} z${p ? p.z.toFixed(0) : '-'} y${p ? p.y.toFixed(1) : '-'}|` +
                `calls${s.drawCalls ?? '-'}|tiles${s.loadedChunks ?? '-'}` +
                `|touch${this.isTouch ? 1 : 0}|shadow${this.renderer?.shadowMap?.enabled ? 1 : 0}` +
                `|ssao${this.ssaoPass ? 1 : 0}`;
        }
    }
    
    updateHUD(speedKmh) {
        const speedEl = document.getElementById('hud-speed');
        if (speedEl) speedEl.innerText = Math.abs(speedKmh);
        
        const gearEl = document.getElementById('hud-gear');
        if (gearEl) gearEl.innerText = (this.physics.gear === 'R') ? 'R' : `D ${this.physics.gear}`;
        
        const rpmBar = document.getElementById('hud-rpm-fill');
        if (rpmBar) {
            const rpmPercent = Math.min(100, (this.physics.rpm / 8000) * 100);
            rpmBar.style.width = `${rpmPercent}%`;
        }
        
        const driftEl = document.getElementById('hud-drift-tag');
        if (driftEl) {
            driftEl.style.visibility = this.physics.isDrifting ? 'visible' : 'hidden';
        }
        
        if (this.raceManager.state === 'RACING') {
            const timerEl = document.getElementById('hud-race-timer');
            if (timerEl) {
                const mins = Math.floor(this.raceManager.raceTime / 60);
                const secs = (this.raceManager.raceTime % 60).toFixed(1);
                timerEl.innerText = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
            const lapEl = document.getElementById('hud-race-lap');
            if (lapEl && this.raceManager.activeEvent) {
                lapEl.innerText = `LAP ${this.raceManager.currentLap}/${this.raceManager.activeEvent.laps}`;
            }
        }
        
        // Update Debug Overlay
        this.updateF8Panel();
    }
    
    updateF8Panel() {
        const stats = document.getElementById('debug-stats');
        if (!stats) return;
        
        if (this.mapLoader && this.mapLoader.stats) {
            const m = this.mapLoader.stats;
            stats.innerHTML = `
                <div class="stat-row"><span class="stat-label">WORLD:</span> <span class="stat-value">${this.currentWorldId.toUpperCase()}</span></div>
                <div class="stat-row"><span class="stat-label">CURRENT CHUNK:</span> <span class="stat-value">${m.currentChunk || 0}</span></div>
                <div class="stat-row"><span class="stat-label">LOADED CHUNKS:</span> <span class="stat-value">${m.loadedChunks || 0}</span></div>
                <div class="stat-row"><span class="stat-label">ROAD MODULES:</span> <span class="stat-value">${m.roadModules || 0}</span></div>
                <div class="stat-row"><span class="stat-label">BUILDINGS:</span> <span class="stat-value">${m.buildings || 0}</span></div>
                <div class="stat-row"><span class="stat-label">TRAFFICCRAFT:</span> <span class="stat-value">${m.trafficProps || 0}</span></div>
                <div class="stat-row"><span class="stat-label">VEGETATION:</span> <span class="stat-value">${m.vegetation || 0}</span></div>
                <div class="stat-row"><span class="stat-label">SOURCE MAPS USED:</span></div>
                <div class="stat-row" style="color: var(--text-main); font-size: 10px;">${m.sourceMapsUsed || '-'}</div>
            `;
        }
    }
    
    drawMinimap() {
        if (!this.minimapCtx || !this.physics) return;
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(0, 0, w, h);
        
        const px = this.physics.x;
        const pz = this.physics.z;
        const scale = 0.055;
        
        ctx.strokeStyle = '#223147';
        ctx.lineWidth = 6;
        
        this.mapLoader.roads.forEach(r => {
            const x1 = w/2 + (r.startX - px) * scale;
            const y1 = h/2 + (r.startZ - pz) * scale;
            const x2 = w/2 + (r.endX - px) * scale;
            const y2 = h/2 + (r.endZ - pz) * scale;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
        
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        this.mapLoader.roads.forEach(r => {
            const x1 = w/2 + (r.startX - px) * scale;
            const y1 = h/2 + (r.startZ - pz) * scale;
            const x2 = w/2 + (r.endX - px) * scale;
            const y2 = h/2 + (r.endZ - pz) * scale;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
        
        // AI Traffic
        ctx.fillStyle = '#ff0055';
        this.trafficSystem.vehicles.forEach(ai => {
            const ax = w/2 + (ai.mesh.position.x - px) * scale;
            const ay = h/2 + (ai.mesh.position.z - pz) * scale;
            if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) {
                ctx.beginPath();
                ctx.arc(ax, ay, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        // Race Checkpoint
        if (this.raceManager.state === 'RACING' && this.raceManager.activeEvent) {
            const cp = this.raceManager.activeEvent.checkpoints[this.raceManager.currentCheckpointIdx];
            if (cp) {
                const cx = w/2 + (cp.x - px) * scale;
                const cy = h/2 + (cp.z - pz) * scale;
                ctx.fillStyle = '#ffe600';
                ctx.beginPath();
                ctx.arc(cx, cy, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Player Arrow (Heading points toward -Z)
        const angle = this.physics.angle;
        ctx.save();
        ctx.translate(w/2, h/2);
        // Canvas +Y points down, so a left turn (positive angle) needs a
        // negative canvas rotation to point the arrow the same way as the car.
        ctx.rotate(-angle);
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 6);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.apexGame = new ApexGame();
});
