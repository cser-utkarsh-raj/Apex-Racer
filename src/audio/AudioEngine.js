/**
 * AudioEngine.js - Cinematic Dynamic Audio System for Apex Racer
 * 
 * Features:
 * - World-specific procedural music themes (Neo-Tazader, Chiang Tung, Curitiba, Nantwich)
 * - Dynamic engine sound that scales with RPM and speed
 * - Realistic SFX: skidding, impacts, nitro, gear shifts, wind
 * - Ambient sounds per world (city, mountain, countryside)
 * - Smooth crossfading between music tracks
 * - Volume ducking during important SFX
 * - Mute toggle and volume control
 * 
 * All audio is procedural - no external files required!
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;
        
        // Audio Nodes
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.engineGain = null;
        this.ambientGain = null;
        
        // Music State
        this.currentWorld = 'neo_tazader';
        this.currentMode = 'MENU';
        this.isMuted = false;
        this.musicVolume = 0.5;
        this.sfxVolume = 0.7;
        this.engineVolume = 0.6;
        
        // Active music track
        this.activeMusicTrack = null;
        this.musicNodes = [];
        
        // Engine oscillators
        this.engineOscs = [];
        this.engineFilter = null;
        
        // World ambient nodes
        this.ambientNodes = [];
        
        // SFX state
        this.isDrifting = false;
        this.isNitroActive = false;
        this.lastGear = 1;
        
        // Timing
        this.lastMusicTime = 0;
        this.musicTempo = 120; // BPM
        
        // Initialize
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.isInitialized = true;
            this.setupMasterChain();
            this.setupEngine();
            this.setupSFX();
            this.setupMusicTracks();
            this.setupAmbient();
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    }
    
    // ==================== SETUP METHODS ====================
    
    setupMasterChain() {
        if (!this.ctx) return;
        
        // Master Gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        
        // Music Bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.masterGain);
        
        // SFX Bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.sfxGain.connect(this.masterGain);
        
        // Engine Bus
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineGain.connect(this.masterGain);
        
        // Ambient Bus
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0.3;
        this.ambientGain.connect(this.masterGain);
    }
    
    setupEngine() {
        if (!this.ctx) return;
        
        // Low-pass filter for engine
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 500;
        this.engineFilter.Q.value = 1;
        this.engineFilter.connect(this.engineGain);
        
        // Create 4 oscillators for rich engine sound
        const waveTypes = ['sawtooth', 'sawtooth', 'triangle', 'sine'];
        const freqMultipliers = [1, 1.01, 2, 3];
        const detuneValues = [0, 15, 0, 0];
        
        for (let i = 0; i < 4; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = waveTypes[i];
            osc.frequency.value = 40;
            osc.detune.value = detuneValues[i];
            osc.connect(this.engineFilter);
            osc.start(0);
            this.engineOscs.push(osc);
        }
    }
    
    setupSFX() {
        // SFX will be created on-demand
    }
    
    setupMusicTracks() {
        // Music tracks are created dynamically based on world
        this.musicTracks = {
            'neo_tazader': this.createNeoTazaderTrack.bind(this),
            'chiang_tung': this.createChiangTungTrack.bind(this),
            'curitiba': this.createCuritibaTrack.bind(this),
            'nantwich': this.createNantwichTrack.bind(this),
            'menu': this.createMenuTrack.bind(this),
            'garage': this.createGarageTrack.bind(this)
        };
    }
    
    setupAmbient() {
        // Ambient sounds are created per world
        this.ambientTracks = {
            'neo_tazader': this.createNeoTazaderAmbient.bind(this),
            'chiang_tung': this.createChiangTungAmbient.bind(this),
            'curitiba': this.createCuritibaAmbient.bind(this),
            'nantwich': this.createNantwichAmbient.bind(this)
        };
    }
    
    // ==================== MUSIC CREATION ====================
    
    createNeoTazaderTrack() {
        // Synthwave / Cyberpunk theme
        // Dark, atmospheric, driving
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Bass line (synth bass)
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.value = 55;
        bassGain.gain.value = 0;
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start(now);
        nodes.push({ osc: bassOsc, gain: bassGain, type: 'bass' });
        
        // Lead synth (arpeggio)
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        leadOsc.type = 'sine';
        leadOsc.frequency.value = 440;
        leadGain.gain.value = 0;
        leadOsc.connect(leadGain);
        leadGain.connect(this.musicGain);
        leadOsc.start(now);
        nodes.push({ osc: leadOsc, gain: leadGain, type: 'lead' });
        
        // Pad (atmospheric)
        const padOsc1 = this.ctx.createOscillator();
        const padOsc2 = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        const padFilter = this.ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 1000;
        padOsc1.type = 'sine';
        padOsc2.type = 'sine';
        padOsc1.frequency.value = 110;
        padOsc2.frequency.value = 165;
        padOsc1.connect(padFilter);
        padOsc2.connect(padFilter);
        padFilter.connect(padGain);
        padGain.gain.value = 0;
        padGain.connect(this.musicGain);
        padOsc1.start(now);
        padOsc2.start(now);
        nodes.push({ osc: padOsc1, gain: padGain, filter: padFilter, type: 'pad' });
        
        // Kick drum (procedural)
        const kickPattern = this.createKickDrum();
        nodes.push({ node: kickPattern, type: 'kick' });
        
        return nodes;
    }
    
    createChiangTungTrack() {
        // Mountain/touge theme
        // Ethereal, mysterious, flowing
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Soft bass
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = 82.4; // E2
        bassGain.gain.value = 0;
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start(now);
        nodes.push({ osc: bassOsc, gain: bassGain, type: 'bass' });
        
        // Wind-like pad
        const padOsc1 = this.ctx.createOscillator();
        const padOsc2 = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        const padFilter = this.ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 800;
        padOsc1.type = 'triangle';
        padOsc2.type = 'triangle';
        padOsc1.frequency.value = 130.8; // C3
        padOsc2.frequency.value = 196; // G3
        padOsc1.connect(padFilter);
        padOsc2.connect(padFilter);
        padFilter.connect(padGain);
        padGain.gain.value = 0;
        padGain.connect(this.musicGain);
        padOsc1.start(now);
        padOsc2.start(now);
        nodes.push({ osc: padOsc1, gain: padGain, filter: padFilter, type: 'pad' });
        
        // Nature sounds (wind)
        const wind = this.createWindSound();
        nodes.push({ node: wind, type: 'wind' });
        
        return nodes;
    }
    
    createCuritibaTrack() {
        // City/urban theme
        // Funky, groovy, energetic
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Funky bass
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        const bassFilter = this.ctx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 800;
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.value = 110; // A2
        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.gain.value = 0;
        bassGain.connect(this.musicGain);
        bassOsc.start(now);
        nodes.push({ osc: bassOsc, gain: bassGain, filter: bassFilter, type: 'bass' });
        
        // Plucked strings (guitar-like)
        const pluck = this.createPluckSound(220);
        nodes.push({ node: pluck, type: 'pluck' });
        
        // Light percussion
        const hiHat = this.createHiHat();
        nodes.push({ node: hiHat, type: 'hihat' });
        
        return nodes;
    }
    
    createNantwichTrack() {
        // Countryside theme
        // Peaceful, acoustic, warm
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Acoustic bass
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = 65.4; // C2
        bassGain.gain.value = 0;
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start(now);
        nodes.push({ osc: bassOsc, gain: bassGain, type: 'bass' });
        
        // Soft pad
        const padOsc1 = this.ctx.createOscillator();
        const padOsc2 = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        padOsc1.type = 'sine';
        padOsc2.type = 'sine';
        padOsc1.frequency.value = 130.8; // C3
        padOsc2.frequency.value = 164.8; // E3
        padOsc1.connect(padGain);
        padOsc2.connect(padGain);
        padGain.gain.value = 0;
        padGain.connect(this.musicGain);
        padOsc1.start(now);
        padOsc2.start(now);
        nodes.push({ osc: padOsc1, gain: padGain, type: 'pad' });
        
        // Birds chirping
        const birds = this.createBirdSounds();
        nodes.push({ node: birds, type: 'birds' });
        
        return nodes;
    }
    
    createMenuTrack() {
        // Chill, ambient menu music
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Ambient pad
        const padOsc1 = this.ctx.createOscillator();
        const padOsc2 = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        const padFilter = this.ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 1200;
        padOsc1.type = 'sine';
        padOsc2.type = 'sine';
        padOsc1.frequency.value = 220; // A3
        padOsc2.frequency.value = 277.2; // C#4
        padOsc1.connect(padFilter);
        padOsc2.connect(padFilter);
        padFilter.connect(padGain);
        padGain.gain.value = 0;
        padGain.connect(this.musicGain);
        padOsc1.start(now);
        padOsc2.start(now);
        nodes.push({ osc: padOsc1, gain: padGain, filter: padFilter, type: 'pad' });
        
        // Subtle bass
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = 55; // A1
        bassGain.gain.value = 0;
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start(now);
        nodes.push({ osc: bassOsc, gain: bassGain, type: 'bass' });
        
        return nodes;
    }
    
    createGarageTrack() {
        // Luxury, showroom music
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Warm pad
        const padOsc1 = this.ctx.createOscillator();
        const padOsc2 = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        padOsc1.type = 'sine';
        padOsc2.type = 'sine';
        padOsc1.frequency.value = 174.6; // F3
        padOsc2.frequency.value = 220; // A3
        padOsc1.connect(padGain);
        padOsc2.connect(padGain);
        padGain.gain.value = 0;
        padGain.connect(this.musicGain);
        padOsc1.start(now);
        padOsc2.start(now);
        nodes.push({ osc: padOsc1, gain: padGain, type: 'pad' });
        
        // Vinyl crackle effect
        const vinyl = this.createVinylCrackle();
        nodes.push({ node: vinyl, type: 'vinyl' });
        
        return nodes;
    }
    
    // ==================== AMBIENT SOUNDS ====================
    
    createNeoTazaderAmbient() {
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // City hum (low frequency noise)
        const cityHum = this.createNoise(0.1, 200, 100);
        const cityGain = this.ctx.createGain();
        cityGain.gain.value = 0.15;
        cityHum.connect(cityGain);
        cityGain.connect(this.ambientGain);
        nodes.push({ node: cityHum, gain: cityGain, type: 'cityHum' });
        
        // Distant sirens (occasional)
        const siren = this.createSirenSound();
        nodes.push({ node: siren, type: 'siren' });
        
        return nodes;
    }
    
    createChiangTungAmbient() {
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Mountain wind
        const wind = this.createWindSound();
        nodes.push({ node: wind, type: 'wind' });
        
        // Distant waterfall
        const waterfall = this.createWaterfallSound();
        nodes.push({ node: waterfall, type: 'waterfall' });
        
        return nodes;
    }
    
    createCuritibaAmbient() {
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // City traffic
        const traffic = this.createTrafficSound();
        nodes.push({ node: traffic, type: 'traffic' });
        
        // Occasional horn
        const horn = this.createHornSound();
        nodes.push({ node: horn, type: 'horn' });
        
        return nodes;
    }
    
    createNantwichAmbient() {
        const nodes = [];
        const now = this.ctx.currentTime;
        
        // Birds
        const birds = this.createBirdSounds();
        nodes.push({ node: birds, type: 'birds' });
        
        // Gentle wind
        const wind = this.createWindSound();
        nodes.push({ node: wind, type: 'wind' });
        
        return nodes;
    }
    
    // ==================== SFX GENERATORS ====================
    
    createKickDrum() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        // Sub bass
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(60, now);
        subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        subGain.gain.setValueAtTime(0.3, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        subOsc.start(now);
        subOsc.stop(now + 0.15);
        group.nodes.push(subOsc, subGain);
        
        // Click
        const clickBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
        const clickData = clickBuffer.getChannelData(0);
        for (let i = 0; i < clickData.length; i++) {
            clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1000);
        }
        const clickSource = this.ctx.createBufferSource();
        clickSource.buffer = clickBuffer;
        const clickGain = this.ctx.createGain();
        clickGain.gain.setValueAtTime(0.2, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        clickSource.connect(clickGain);
        clickGain.connect(this.sfxGain);
        clickSource.start(now);
        clickSource.stop(now + 0.05);
        group.nodes.push(clickSource, clickGain);
        
        return group;
    }
    
    createHiHat() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 2000) * 
                     (1 + Math.sin(i * 0.1) * 0.5);
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.15;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
        
        group.nodes.push(source, gain, filter);
        return group;
    }
    
    createPluckSound(freq) {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        const omega = 2 * Math.PI * freq / this.ctx.sampleRate;
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.sin(i * omega) * Math.exp(-i / (this.ctx.sampleRate * 0.2)) * 0.3;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.2;
        
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
        
        group.nodes.push(source, gain);
        return group;
    }
    
    createWindSound() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const noise = (Math.random() * 2 - 1) * 0.3;
            const wind = Math.sin(i * 0.01) * 0.1;
            data[i] = (noise + wind) * Math.exp(-i / (this.ctx.sampleRate * 1.5));
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ambientGain);
        source.start(now);
        
        group.nodes.push(source, gain, filter);
        return group;
    }
    
    createVinylCrackle() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        // Create crackle sound
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            if (Math.random() < 0.0005) {
                data[i] = (Math.random() * 2 - 1) * 0.2;
            } else {
                data[i] = 0;
            }
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.05;
        
        source.connect(gain);
        gain.connect(this.musicGain);
        source.start(now);
        
        group.nodes.push(source, gain);
        return group;
    }
    
    createBirdSounds() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        // Simple chirp
        const chirpBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
        const chirpData = chirpBuffer.getChannelData(0);
        for (let i = 0; i < chirpData.length; i++) {
            const freq = 800 + i * 20;
            const omega = 2 * Math.PI * freq / this.ctx.sampleRate;
            chirpData[i] = Math.sin(i * omega) * Math.exp(-i / (this.ctx.sampleRate * 0.05)) * 0.2;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = chirpBuffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        
        source.connect(gain);
        gain.connect(this.ambientGain);
        source.start(now);
        
        // Trigger chirps randomly
        const triggerChirp = () => {
            if (!this.ctx) return;
            gain.gain.cancelScheduledValues(this.ctx.currentTime);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
            setTimeout(triggerChirp, 2000 + Math.random() * 5000);
        };
        triggerChirp();
        
        group.nodes.push(source, gain);
        return group;
    }
    
    createWaterfallSound() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        const bufferSize = this.ctx.sampleRate * 1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.2 * Math.exp(-i / (this.ctx.sampleRate * 0.8));
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3000;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ambientGain);
        source.start(now);
        
        group.nodes.push(source, gain, filter);
        return group;
    }
    
    createTrafficSound() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        // Engine rumble
        const rumbleBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
        const rumbleData = rumbleBuffer.getChannelData(0);
        for (let i = 0; i < rumbleData.length; i++) {
            rumbleData[i] = (Math.random() * 2 - 1) * 0.15 * 
                           (0.5 + 0.5 * Math.sin(i * 0.02)) * 
                           Math.exp(-i / (this.ctx.sampleRate * 0.3));
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = rumbleBuffer;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ambientGain);
        source.start(now);
        
        group.nodes.push(source, gain, filter);
        return group;
    }
    
    createSirenSound() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        // Siren wail
        const sirenOsc = this.ctx.createOscillator();
        const sirenGain = this.ctx.createGain();
        const sirenFilter = this.ctx.createBiquadFilter();
        sirenFilter.type = 'bandpass';
        sirenFilter.frequency.value = 1000;
        sirenFilter.Q.value = 5;
        
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 440;
        sirenGain.gain.value = 0;
        
        sirenOsc.connect(sirenFilter);
        sirenFilter.connect(sirenGain);
        sirenGain.connect(this.ambientGain);
        sirenOsc.start(now);
        
        // Animate siren
        const animateSiren = () => {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            sirenOsc.frequency.setValueAtTime(440, t);
            sirenOsc.frequency.exponentialRampToValueAtTime(880, t + 0.5);
            sirenOsc.frequency.exponentialRampToValueAtTime(440, t + 1);
            sirenGain.gain.setValueAtTime(0.05, t);
            sirenGain.gain.exponentialRampToValueAtTime(0.01, t + 1);
            setTimeout(animateSiren, 8000 + Math.random() * 15000);
        };
        animateSiren();
        
        group.nodes.push(sirenOsc, sirenGain, sirenFilter);
        return group;
    }
    
    createHornSound() {
        const group = { nodes: [] };
        const now = this.ctx.currentTime;
        
        // Simple horn
        const hornOsc = this.ctx.createOscillator();
        const hornGain = this.ctx.createGain();
        const hornFilter = this.ctx.createBiquadFilter();
        hornFilter.type = 'lowpass';
        hornFilter.frequency.value = 800;
        
        hornOsc.type = 'sawtooth';
        hornOsc.frequency.value = 220;
        hornGain.gain.value = 0;
        
        hornOsc.connect(hornFilter);
        hornFilter.connect(hornGain);
        hornGain.connect(this.ambientGain);
        hornOsc.start(now);
        
        // Trigger occasionally
        const triggerHorn = () => {
            if (!this.ctx) return;
            hornGain.gain.cancelScheduledValues(this.ctx.currentTime);
            hornGain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            hornGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            setTimeout(triggerHorn, 10000 + Math.random() * 20000);
        };
        triggerHorn();
        
        group.nodes.push(hornOsc, hornGain, hornFilter);
        return group;
    }
    
    createNoise(duration, cutoff, gainVal) {
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * duration * 0.5));
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        
        const gain = this.ctx.createGain();
        gain.gain.value = gainVal;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        
        source.connect(filter);
        filter.connect(gain);
        
        source.start(0);
        
        return { source, gain, filter };
    }
    
    // ==================== MAIN CONTROL METHODS ====================
    
    setWorld(worldId) {
        if (!this.ctx || this.currentWorld === worldId) return;
        
        // Fade out current ambient
        this.ambientNodes.forEach(node => {
            if (node.gain) node.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        });
        this.ambientNodes = [];
        
        this.currentWorld = worldId;
        
        // Create new ambient for this world
        if (this.ambientTracks[worldId]) {
            this.ambientNodes = this.ambientTracks[worldId]();
        }
        
        // Switch music track
        this.switchMusicTrack(worldId === 'MENU' || worldId === 'GARAGE' ? worldId : this.currentWorld);
    }
    
    setMode(mode) {
        if (!this.ctx || this.currentMode === mode) return;
        
        const wasGame = this.currentMode === 'GAME';
        this.currentMode = mode;
        
        // Fade out current music
        this.musicNodes.forEach(node => {
            if (node.gain) node.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        });
        this.musicNodes = [];
        
        // Determine track based on mode and world
        let trackId = mode;
        if (mode === 'GAME') {
            trackId = this.currentWorld;
        }
        
        // Start new music
        this.switchMusicTrack(trackId);
        
        // Engine state
        if (mode === 'GAME') {
            this.engineGain.gain.setTargetAtTime(this.engineVolume, this.ctx.currentTime, 0.3);
        } else {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        }
    }
    
    switchMusicTrack(trackId) {
        if (!this.ctx || !this.musicTracks[trackId]) return;
        
        // Fade out current music
        this.musicNodes.forEach(node => {
            if (node.gain) node.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        });
        
        // Create new music track
        this.musicNodes = this.musicTracks[trackId]();
        this.activeMusicTrack = trackId;
        
        // Fade in new music
        this.musicNodes.forEach(node => {
            if (node.gain) node.gain.gain.setTargetAtTime(this.musicVolume * 0.8, this.ctx.currentTime, 0.5);
        });
    }
    
    toggleMute() {
        this.resumeContext();
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.5, this.ctx.currentTime, 0.1);
        }
        return this.isMuted;
    }
    
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.musicGain && this.ctx) {
            this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.1);
        }
    }
    
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        if (this.sfxGain && this.ctx) {
            this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.1);
        }
    }
    
    setEngineVolume(volume) {
        this.engineVolume = Math.max(0, Math.min(1, volume));
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setTargetAtTime(this.engineVolume, this.ctx.currentTime, 0.1);
        }
    }
    
    resumeContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    // ==================== GAME UPDATE ====================
    
    update(speedKmh, isDrifting = false, isNitro = false, gear = 1, rpm = 0) {
        if (!this.isInitialized || !this.ctx) return;
        
        this.resumeContext();
        
        // Update engine sound
        this.updateEngine(speedKmh, isNitro, rpm);
        
        // Update music based on speed
        this.updateMusicIntensity(speedKmh);
        
        // Handle gear shift
        if (gear !== this.lastGear) {
            this.playGearShift(gear);
            this.lastGear = gear;
        }
        
        // Update drifting
        if (isDrifting !== this.isDrifting) {
            this.isDrifting = isDrifting;
            if (isDrifting) {
                this.playDriftStart();
            }
        }
        
        // Update nitro
        if (isNitro !== this.isNitroActive) {
            this.isNitroActive = isNitro;
            if (isNitro) {
                this.playNitro();
            }
        }
        
        // Update ambient based on speed
        this.updateAmbientIntensity(speedKmh);
    }
    
    updateEngine(speedKmh, isNitro, rpm) {
        const speed = Math.abs(speedKmh);
        const speedRatio = Math.min(1, speed / 320);
        
        // Base frequency based on speed and RPM
        const baseFreq = 30 + Math.pow(speedRatio, 0.8) * 150 + (isNitro ? 30 : 0);
        const rpmFactor = Math.max(0, rpm / 8000);
        const finalFreq = baseFreq + rpmFactor * 80;
        
        // Update oscillators
        this.engineOscs.forEach((osc, i) => {
            const mult = [1, 1.01, 2, 3][i];
            osc.frequency.setTargetAtTime(finalFreq * mult, this.ctx.currentTime, 0.02);
        });
        
        // Update filter
        if (this.engineFilter) {
            const filterFreq = 300 + Math.pow(speedRatio, 0.6) * 4000 + (isNitro ? 1000 : 0);
            this.engineFilter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.02);
        }
        
        // Update engine volume
        if (this.engineGain) {
            const vol = 0.1 + speedRatio * 0.4 + (isNitro ? 0.2 : 0);
            this.engineGain.gain.setTargetAtTime(vol * this.engineVolume, this.ctx.currentTime, 0.02);
        }
    }
    
    updateMusicIntensity(speedKmh) {
        const speedRatio = Math.min(1, Math.abs(speedKmh) / 320);
        
        // Increase music intensity with speed
        this.musicNodes.forEach(node => {
            if (node.gain && node.type !== 'kick' && node.type !== 'hihat') {
                const intensity = 0.5 + speedRatio * 0.5;
                node.gain.gain.setTargetAtTime(this.musicVolume * intensity, this.ctx.currentTime, 0.3);
            }
        });
    }
    
    updateAmbientIntensity(speedKmh) {
        const speedRatio = Math.min(1, Math.abs(speedKmh) / 100);
        
        // Ambient gets louder with speed (wind effect)
        this.ambientNodes.forEach(node => {
            if (node.gain && node.type === 'wind') {
                node.gain.gain.setTargetAtTime(0.1 + speedRatio * 0.3, this.ctx.currentTime, 0.1);
            }
        });
    }
    
    // ==================== SFX PLAYBACK ====================
    
    playDriftStart() {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Tire screech
        const screechBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
        const screechData = screechBuffer.getChannelData(0);
        for (let i = 0; i < screechData.length; i++) {
            const freq = 100 + i * 0.5;
            const omega = 2 * Math.PI * freq / this.ctx.sampleRate;
            screechData[i] = Math.sin(i * omega) * Math.exp(-i / (this.ctx.sampleRate * 0.1)) * 0.3;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = screechBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 3;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
        
        // Schedule loop for sustained drift
        this.driftSource = source;
        this.driftGain = gain;
    }
    
    playNitro() {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Turbo whine
        const whineOsc = this.ctx.createOscillator();
        const whineGain = this.ctx.createGain();
        const whineFilter = this.ctx.createBiquadFilter();
        whineFilter.type = 'highpass';
        whineFilter.frequency.value = 3000;
        
        whineOsc.type = 'sawtooth';
        whineOsc.frequency.setValueAtTime(800, now);
        whineOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
        whineGain.gain.setValueAtTime(0.2, now);
        whineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        whineOsc.connect(whineFilter);
        whineFilter.connect(whineGain);
        whineGain.connect(this.sfxGain);
        whineOsc.start(now);
        whineOsc.stop(now + 0.3);
        
        // Bass boost
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = 80;
        bassGain.gain.setValueAtTime(0.15, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        bassOsc.connect(bassGain);
        bassGain.connect(this.sfxGain);
        bassOsc.start(now);
        bassOsc.stop(now + 0.3);
    }
    
    playGearShift(gear) {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        const pitch = 1 + (gear - 1) * 0.1;
        
        // Mechanical clunk
        const clunkBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
        const clunkData = clunkBuffer.getChannelData(0);
        for (let i = 0; i < clunkData.length; i++) {
            clunkData[i] = (Math.random() * 2 - 1) * Math.exp(-i / 2000) * 0.4;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = clunkBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500 * pitch;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
        
        // RPM drop sound
        const rpmDropOsc = this.ctx.createOscillator();
        const rpmDropGain = this.ctx.createGain();
        rpmDropOsc.type = 'sine';
        rpmDropOsc.frequency.setValueAtTime(200 * pitch, now);
        rpmDropOsc.frequency.exponentialRampToValueAtTime(100 * pitch, now + 0.15);
        rpmDropGain.gain.setValueAtTime(0.15, now);
        rpmDropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        rpmDropOsc.connect(rpmDropGain);
        rpmDropGain.connect(this.sfxGain);
        rpmDropOsc.start(now);
        rpmDropOsc.stop(now + 0.15);
    }
    
    playImpact(severity = 1.0) {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        severity = Math.max(0.1, Math.min(1, severity));
        
        // Sub bass thud
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(100 * (1 + severity * 0.5), now);
        subOsc.frequency.exponentialRampToValueAtTime(20 * (1 + severity * 0.5), now + 0.3);
        subGain.gain.setValueAtTime(0.4 * severity, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        subOsc.start(now);
        subOsc.stop(now + 0.3);
        
        // Metal crunch
        const crunchBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
        const crunchData = crunchBuffer.getChannelData(0);
        for (let i = 0; i < crunchData.length; i++) {
            const noise = (Math.random() * 2 - 1) * 0.5;
            const ring = Math.sin(i * 0.1) * 0.3;
            crunchData[i] = (noise + ring) * Math.exp(-i / (this.ctx.sampleRate * 0.2)) * severity * 0.4;
        }
        
        const crunchSource = this.ctx.createBufferSource();
        crunchSource.buffer = crunchBuffer;
        const crunchGain = this.ctx.createGain();
        crunchGain.gain.setValueAtTime(0.3 * severity, now);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        const crunchFilter = this.ctx.createBiquadFilter();
        crunchFilter.type = 'lowpass';
        crunchFilter.frequency.value = 2000;
        
        crunchSource.connect(crunchFilter);
        crunchFilter.connect(crunchGain);
        crunchGain.connect(this.sfxGain);
        crunchSource.start(now);
        
        // Duck music briefly
        this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.3, now, 0.05);
        this.musicGain.gain.setTargetAtTime(this.musicVolume, now + 0.2, 0.1);
    }
    
    playSkid() {
        if (!this.ctx || this.isDrifting) return;
        
        const now = this.ctx.currentTime;
        
        // Quick tire squeal
        const squealBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
        const squealData = squealBuffer.getChannelData(0);
        for (let i = 0; i < squealData.length; i++) {
            const freq = 150 + i * 2;
            const omega = 2 * Math.PI * freq / this.ctx.sampleRate;
            squealData[i] = Math.sin(i * omega) * Math.exp(-i / (this.ctx.sampleRate * 0.05)) * 0.25;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = squealBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500;
        filter.Q.value = 2;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
    }
    
    playButtonClick() {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Click sound
        const clickBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
        const clickData = clickBuffer.getChannelData(0);
        for (let i = 0; i < clickData.length; i++) {
            clickData[i] = Math.sin(i * 0.2) * Math.exp(-i / 1000) * 0.3;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = clickBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
    }
    
    playSelection() {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Selection sound (higher pitch)
        const selBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
        const selData = selBuffer.getChannelData(0);
        for (let i = 0; i < selData.length; i++) {
            const freq = 800 + i * 5;
            const omega = 2 * Math.PI * freq / this.ctx.sampleRate;
            selData[i] = Math.sin(i * omega) * Math.exp(-i / (this.ctx.sampleRate * 0.05)) * 0.25;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = selBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
    }
    
    // ==================== CLEANUP ====================
    
    cleanupMusic() {
        this.musicNodes.forEach(node => {
            if (node.osc) node.osc.stop();
            if (node.node && node.node.nodes) {
                node.node.nodes.forEach(n => {
                    if (n.stop) n.stop();
                });
            }
        });
        this.musicNodes = [];
    }
    
    cleanupAmbient() {
        this.ambientNodes.forEach(node => {
            if (node.node && node.node.nodes) {
                node.node.nodes.forEach(n => {
                    if (n.stop) n.stop();
                });
            }
        });
        this.ambientNodes = [];
    }
    
    cleanup() {
        this.cleanupMusic();
        this.cleanupAmbient();
        this.engineOscs.forEach(osc => osc.stop());
        this.engineOscs = [];
    }
}
