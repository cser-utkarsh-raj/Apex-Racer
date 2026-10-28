import * as THREE from 'three';
import { World } from './world/World.js';
import { MapLoader } from './world/MapLoader.js';
import { SaveSystem } from './progression/SaveSystem.js';
import { VehicleLoader } from './vehicles/VehicleLoader.js';
import { VehicleController } from './vehicles/VehicleController.js';
import { RaceManager } from './racing/RaceManager.js';
import { HUD } from './ui/HUD.js';

export class Game {
    constructor() {
        this.state = 'BOOT'; // BOOT, MENU, FREE_ROAM, RACING, GARAGE
        this.world = null;
        this.mapLoader = null;
        this.saveSystem = null;
        this.vehicleLoader = null;
        this.playerVehicle = null;
        this.aiVehicles = [];
        this.raceManager = null;
        this.hud = null;
        
        // Input state
        this.keys = {};
        this.prevKeys = {};
        
        // Settings
        this.settings = {
            graphics: 'medium',
            time: 'dynamic',
            weather: 'clear',
            traffic: 'medium'
        };
        
        // Timing
        this.clock = new THREE.Clock();
        this.gameTime = 0; // seconds
        
        this.setupInput();
    }
    
    async boot() {
        this.updateLoading('Loading player profile...', 10);
        this.saveSystem = new SaveSystem();
        this.saveData = this.saveSystem.load();
        
        this.updateLoading('Initializing 3D renderer...', 25);
        this.world = new World(this);
        
        this.updateLoading('Loading city assets...', 40);
        this.mapLoader = new MapLoader(this);
        await this.mapLoader.load();
        
        this.updateLoading('Caching vehicle blueprints...', 65);
        this.vehicleLoader = new VehicleLoader(this);
        await this.vehicleLoader.init();
        
        this.updateLoading('Assembling racing tracks...', 80);
        this.raceManager = new RaceManager(this);
        
        this.updateLoading('Calibrating telemetry...', 90);
        this.hud = new HUD(this);
        this.hud.init();
        
        this.updateLoading('Ready!', 100);
        
        // Handoff to Main Menu
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            this.showMainMenu();
        }, 800);
        
        // Start animation loop
        this.animate();
    }
    
    updateLoading(status, percent) {
        document.getElementById('loading-status').innerText = status;
        document.getElementById('loader-bar').style.width = `${percent}%`;
    }
    
    setupInput() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            
            // Check for Escape (Pause menu)
            if (e.key === 'Escape') {
                if (this.state === 'FREE_ROAM' || this.state === 'RACING') {
                    this.togglePause();
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
        });
    }
    
    isKeyPressed(key) {
        return !!this.keys[key];
    }
    
    wasKeyJustPressed(key) {
        return this.keys[key] && !this.prevKeys[key];
    }
    
    showMainMenu() {
        this.state = 'MENU';
        
        // Toggle HTML panels
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('garage').classList.add('hidden');
        document.getElementById('settings').classList.add('hidden');
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('race-setup').classList.add('hidden');
        
        // Update menu values
        document.getElementById('profile-rep').innerText = `REP ${this.saveData.rep}`;
        document.getElementById('profile-cash').innerText = `$${this.saveData.money.toLocaleString()}`;
        document.getElementById('profile-car').innerText = this.saveData.currentCar.toUpperCase();
        document.getElementById('profile-races').innerText = this.saveData.completedRaces.length;
        
        // Position camera to overview city
        this.world.setMenuCamera();
        
        // Clear any active vehicles
        this.clearVehicles();
        
        // Setup menu event listeners (once)
        if (!this.menuListenersSetup) {
            document.getElementById('btn-continue').onclick = () => this.startFreeRoam();
            document.getElementById('btn-free-roam').onclick = () => this.startFreeRoam();
            document.getElementById('btn-garage').onclick = () => this.startGarage();
            document.getElementById('btn-settings').onclick = () => {
                document.getElementById('main-menu').classList.add('hidden');
                document.getElementById('settings').classList.remove('hidden');
            };
            document.getElementById('btn-settings-save').onclick = () => {
                this.settings.graphics = document.getElementById('settings-graphics').value;
                this.settings.time = document.getElementById('settings-time').value;
                this.settings.weather = document.getElementById('settings-weather').value;
                this.settings.traffic = document.getElementById('settings-traffic').value;
                
                this.world.applyGraphicsSettings();
                
                document.getElementById('settings').classList.add('hidden');
                document.getElementById('main-menu').classList.remove('hidden');
            };
            
            this.menuListenersSetup = true;
        }
    }
    
    async startFreeRoam() {
        this.state = 'FREE_ROAM';
        
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('hud-race-info').classList.add('hidden'); // hide lap/pos in free roam
        document.getElementById('hud-waypoint-container').classList.add('hidden');
        
        // Clear old vehicles
        this.clearVehicles();
        
        // Load player car
        await this.spawnPlayerCar(this.saveData.currentCar);
        
        // Set camera mode to driving
        this.world.setDrivingCamera();
    }
    
    startGarage() {
        this.state = 'GARAGE';
        
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('garage').classList.remove('hidden');
        
        // Position player car inside garage
        this.clearVehicles();
        this.spawnGarageCar();
        
        // Position camera in garage mode
        this.world.setGarageCamera();
        
        // Wire garage UI
        const garageUI = new (function(game) {
            this.game = game;
            this.activeUpgradeType = 'engine';
            
            this.init = function() {
                this.updateCarList();
                this.selectUpgrade('engine');
                
                // Wire upgrade clicks
                const items = document.querySelectorAll('.upgrade-item');
                items.forEach(item => {
                    item.onclick = () => {
                        this.selectUpgrade(item.getAttribute('data-type'));
                    };
                });
                
                // Wire back button
                document.getElementById('btn-garage-back').onclick = () => {
                    game.showMainMenu();
                };
                
                // Wire buy button
                document.getElementById('btn-buy-upgrade').onclick = () => {
                    this.buySelected();
                };
            };
            
            this.updateCarList = function() {
                const list = document.getElementById('car-list');
                list.innerHTML = '';
                
                const cars = [
                    { id: 'ae86', name: 'Toyota AE86', cost: 0 },
                    { id: 'mustang', name: 'Ford Mustang', cost: 25000 },
                    { id: 'police_car', name: 'Interseptor Police', cost: 45000 },
                    { id: 'taxi', name: 'Urban Taxi Cab', cost: 15000 }
                ];
                
                cars.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'car-item' + (game.saveData.currentCar === c.id ? ' active' : '');
                    
                    const isOwned = game.saveData.ownedCars.includes(c.id);
                    let statusHtml = '';
                    if (isOwned) {
                        statusHtml = `<span class="car-status neon-blue">${game.saveData.currentCar === c.id ? 'ACTIVE' : 'OWNED'}</span>`;
                    } else {
                        statusHtml = `<span class="car-status neon-green">$${c.cost.toLocaleString()}</span>`;
                    }
                    
                    item.innerHTML = `
                        <span class="car-name">${c.name.toUpperCase()}</span>
                        ${statusHtml}
                    `;
                    
                    item.onclick = async () => {
                        if (isOwned) {
                            game.saveData.currentCar = c.id;
                            game.saveSystem.save(game.saveData);
                            this.updateCarList();
                            // Respawn in garage
                            game.clearVehicles();
                            game.spawnGarageCar();
                            this.updateStats();
                        } else {
                            if (game.saveData.money >= c.cost) {
                                game.saveData.money -= c.cost;
                                game.saveData.ownedCars.push(c.id);
                                game.saveData.currentCar = c.id;
                                game.saveSystem.save(game.saveData);
                                this.updateCarList();
                                game.clearVehicles();
                                game.spawnGarageCar();
                                this.updateStats();
                                document.getElementById('profile-cash').innerText = `$${game.saveData.money.toLocaleString()}`;
                            } else {
                                alert("Insufficient funds!");
                            }
                        }
                    };
                    
                    list.appendChild(item);
                });
                
                this.updateStats();
            };
            
            this.selectUpgrade = function(type) {
                this.activeUpgradeType = type;
                
                // Toggle active class in HTML list
                document.querySelectorAll('.upgrade-item').forEach(item => {
                    if (item.getAttribute('data-type') === type) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
                
                // Show current levels for this upgrade type
                const car = game.saveData.currentCar;
                const upgrades = game.saveData.upgrades[car] || { engine: 0, transmission: 0, tires: 0, suspension: 0, nitro: 0 };
                const currentLvl = upgrades[type] || 0;
                
                // Update cost display
                const cost = this.getUpgradeCost(type, currentLvl);
                const btn = document.getElementById('btn-buy-upgrade');
                if (currentLvl >= 5) {
                    btn.innerText = "MAX LEVEL REACHED";
                    btn.disabled = true;
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-secondary');
                } else {
                    btn.innerText = `BUY UPGRADE ($${cost.toLocaleString()})`;
                    btn.disabled = false;
                    btn.classList.remove('btn-secondary');
                    btn.classList.add('btn-primary');
                }
                
                // Draw active boxes in levels
                const types = ['engine', 'transmission', 'tires', 'suspension', 'nitro'];
                types.forEach(t => {
                    const lvl = upgrades[t] || 0;
                    const container = document.getElementById(`lvl-${t}`);
                    container.innerHTML = '';
                    for (let i = 1; i <= 5; i++) {
                        const box = document.createElement('div');
                        box.className = 'lvl-box' + (i <= lvl ? ' active' : '');
                        container.appendChild(box);
                    }
                    
                    const costLabel = document.getElementById(`cost-${t}`);
                    const clvl = upgrades[t] || 0;
                    if (clvl >= 5) {
                        costLabel.innerText = "MAX";
                        costLabel.className = "upgrade-cost neon-blue";
                    } else {
                        costLabel.innerText = `$${this.getUpgradeCost(t, clvl).toLocaleString()}`;
                        costLabel.className = "upgrade-cost neon-green";
                    }
                });
            };
            
            this.getUpgradeCost = function(type, currentLvl) {
                // Base costs
                const baseCosts = {
                    engine: 1200,
                    transmission: 800,
                    tires: 600,
                    suspension: 1000,
                    nitro: 1500
                };
                return baseCosts[type] * (currentLvl + 1);
            };
            
            this.updateStats = function() {
                const car = game.saveData.currentCar;
                // Get vehicle specs
                const specs = game.vehicleLoader.getSpecs(car);
                
                // Apply current upgrades factor
                const upgrades = game.saveData.upgrades[car] || { engine: 0, transmission: 0, tires: 0, suspension: 0, nitro: 0 };
                
                // Map specs to bars (0 to 100%)
                const topSpeedPct = Math.min((specs.topSpeed + upgrades.engine * 5) / 2.2, 100);
                const accelPct = Math.min((specs.acceleration + upgrades.transmission * 6 + upgrades.engine * 4) / 1.8, 100);
                const handPct = Math.min((specs.handling + upgrades.suspension * 8) / 1.5, 100);
                const gripPct = Math.min((specs.grip + upgrades.tires * 7) / 1.6, 100);
                
                document.getElementById('bar-topSpeed').style.width = `${topSpeedPct}%`;
                document.getElementById('bar-acceleration').style.width = `${accelPct}%`;
                document.getElementById('bar-handling').style.width = `${handPct}%`;
                document.getElementById('bar-grip').style.width = `${gripPct}%`;
            };
            
            this.buySelected = function() {
                const car = game.saveData.currentCar;
                const upgrades = game.saveData.upgrades[car] || { engine: 0, transmission: 0, tires: 0, suspension: 0, nitro: 0 };
                const currentLvl = upgrades[this.activeUpgradeType] || 0;
                
                if (currentLvl >= 5) return;
                
                const cost = this.getUpgradeCost(this.activeUpgradeType, currentLvl);
                if (game.saveData.money >= cost) {
                    game.saveData.money -= cost;
                    upgrades[this.activeUpgradeType] = currentLvl + 1;
                    game.saveData.upgrades[car] = upgrades;
                    game.saveSystem.save(game.saveData);
                    
                    this.selectUpgrade(this.activeUpgradeType);
                    this.updateStats();
                    document.getElementById('profile-cash').innerText = `$${game.saveData.money.toLocaleString()}`;
                    console.log(`Upgraded ${this.activeUpgradeType} for ${car} to level ${currentLvl + 1}`);
                } else {
                    alert("Insufficient funds!");
                }
            };
        })(this);
        
        garageUI.init();
    }
    
    async spawnPlayerCar(id) {
        console.log(`Spawning player vehicle: ${id}...`);
        
        // Remove existing player car
        if (this.playerVehicle) {
            this.world.scene.remove(this.playerVehicle.mesh);
            this.playerVehicle = null;
        }
        
        // Spawn car using VehicleLoader
        const carObject = await this.vehicleLoader.createVehicleMesh(id);
        
        // Setup controller & physics
        this.playerVehicle = new VehicleController(this, id, carObject);
        
        // Position vehicle at world spawn point (relative coordinate mapping)
        const spawnX = (this.mapLoader.meta.spawn_x - this.mapLoader.minX) * 1;
        const spawnZ = (this.mapLoader.meta.spawn_z - this.mapLoader.minZ) * 1;
        const spawnY = this.mapLoader.getHeight(spawnX, spawnZ);
        
        this.playerVehicle.setPosition(spawnX, spawnY + 1.0, spawnZ);
        this.playerVehicle.setRotation(0, Math.PI, 0); // Face road direction
        
        this.world.scene.add(this.playerVehicle.mesh);
    }
    
    spawnGarageCar() {
        const carId = this.saveData.currentCar;
        this.vehicleLoader.createVehicleMesh(carId).then(carMesh => {
            // Put it at garage platform center
            carMesh.position.set(0, 0, 0);
            carMesh.rotation.set(0, -Math.PI / 4, 0); // Nice showroom angle
            this.world.scene.add(carMesh);
            
            // Save it under aiVehicles list temporarily so it is cleared on exit
            this.aiVehicles.push({ mesh: carMesh });
        });
    }
    
    clearVehicles() {
        if (this.playerVehicle) {
            this.world.scene.remove(this.playerVehicle.mesh);
            this.playerVehicle = null;
        }
        this.aiVehicles.forEach(v => {
            this.world.scene.remove(v.mesh);
        });
        this.aiVehicles = [];
    }
    
    togglePause() {
        if (this.state === 'PAUSED') {
            // Resume
            this.state = this.prevPauseState;
            document.getElementById('pause-menu').classList.add('hidden');
        } else {
            this.prevPauseState = this.state;
            this.state = 'PAUSED';
            document.getElementById('pause-menu').classList.remove('hidden');
            
            // Set button clicks
            document.getElementById('btn-pause-resume').onclick = () => this.togglePause();
            document.getElementById('btn-pause-restart').onclick = () => {
                this.togglePause();
                if (this.prevPauseState === 'RACING') {
                    this.raceManager.restartRace();
                } else {
                    this.startFreeRoam();
                }
            };
            document.getElementById('btn-pause-quit').onclick = () => {
                this.togglePause();
                this.startFreeRoam();
            };
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.loop();
    }
    
    loop() {
        const delta = Math.min(this.clock.getDelta(), 0.1); // cap delta to avoid physics explosions
        
        if (this.state === 'FREE_ROAM' || this.state === 'RACING') {
            this.gameTime += delta;
            
            // 1. Update player vehicle physics and input
            if (this.playerVehicle) {
                this.playerVehicle.update(delta);
            }
            
            // 2. Update AI vehicles if racing
            if (this.state === 'RACING') {
                this.raceManager.update(delta);
            }
            
            // 3. Update camera follow
            this.world.updateCamera(delta);
            
            // 4. Update lighting and day/night clock
            this.world.updateEnvironment(delta);
            
            if (this.mapLoader) {
                this.mapLoader.update(delta);
            }
            
            // 5. Update HUD telemetry & Minimap
            this.hud.update(delta);
            
            // 6. Check for race triggers in Free Roam
            if (this.state === 'FREE_ROAM') {
                this.raceManager.checkProximityToRaceGates();
            }
        } else if (this.state === 'GARAGE' || this.state === 'MENU') {
            // Idle camera rotations or light animations
            this.world.updateMenuEffects(delta);
        }
        
        // Save inputs state
        this.prevKeys = { ...this.keys };
    }
}
