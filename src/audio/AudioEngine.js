/**
 * AudioEngine.js — Master Audio Synthesizer & SFX Engine
 * 
 * Features:
 * - Ambient Cyber Racing BGM Chords when in Menu/Garage (chill arcade chords).
 * - Real-time Multi-Oscillator Engine Roar with 0ms latency when driving.
 * - High-impact layered metallic crash & tire screech audio.
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;
        
        // Synth Oscillators for Engine
        this.osc1 = null;
        this.osc2 = null;
        this.osc3 = null;
        this.engineGain = null;
        this.filterNode = null;
        
        // Ambient BGM Synth (Menu / Garage)
        this.bgmOsc1 = null;
        this.bgmOsc2 = null;
        this.bgmGain = null;
        
        this.masterGain = null;
        this.buffers = {};
        this.skidSource = null;
        this.skidGain = null;
        
        this.currentMode = 'MENU'; // 'MENU' or 'DRIVING'
    }
    
    init() {
        if (this.isInitialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.isInitialized = true;
            this.setupSynthesizers();
            this.loadSFX();
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    }
    
    setupSynthesizers() {
        if (!this.ctx) return;
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        
        // 1. Engine Filter & Gain
        this.filterNode = this.ctx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = 800;
        this.filterNode.connect(this.masterGain);
        
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0; // Silent at start until driving
        this.engineGain.connect(this.filterNode);
        
        this.osc1 = this.ctx.createOscillator();
        this.osc1.type = 'sawtooth';
        this.osc1.frequency.value = 45;
        this.osc1.connect(this.engineGain);
        this.osc1.start(0);
        
        this.osc2 = this.ctx.createOscillator();
        this.osc2.type = 'triangle';
        this.osc2.frequency.value = 90;
        this.osc2.connect(this.engineGain);
        this.osc2.start(0);
        
        this.osc3 = this.ctx.createOscillator();
        this.osc3.type = 'sawtooth';
        this.osc3.frequency.value = 135;
        this.osc3.connect(this.engineGain);
        this.osc3.start(0);
        
        // 2. Ambient BGM Chords for Menu & Garage
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.18;
        this.bgmGain.connect(this.masterGain);
        
        this.bgmOsc1 = this.ctx.createOscillator();
        this.bgmOsc1.type = 'sine';
        this.bgmOsc1.frequency.value = 220; // A3
        this.bgmOsc1.connect(this.bgmGain);
        this.bgmOsc1.start(0);
        
        this.bgmOsc2 = this.ctx.createOscillator();
        this.bgmOsc2.type = 'triangle';
        this.bgmOsc2.frequency.value = 330; // E4
        this.bgmOsc2.connect(this.bgmGain);
        this.bgmOsc2.start(0);
    }
    
    async loadSFX() {
        const sfxUrls = {
            skid: 'assets/audio/sfx/wheel_skidding.ogg',
            impact: 'assets/audio/sfx/wheel_striking.ogg'
        };
        
        for (const [key, url] of Object.entries(sfxUrls)) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const arrayBuf = await res.arrayBuffer();
                    const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
                    this.buffers[key] = audioBuf;
                }
            } catch (err) {}
        }
        
        if (this.buffers.skid) {
            this.skidSource = this.ctx.createBufferSource();
            this.skidSource.buffer = this.buffers.skid;
            this.skidSource.loop = true;
            
            this.skidGain = this.ctx.createGain();
            this.skidGain.gain.value = 0.0;
            
            this.skidSource.connect(this.skidGain);
            this.skidGain.connect(this.ctx.destination);
            this.skidSource.start(0);
        }
    }
    
    setMode(mode) {
        this.currentMode = mode;
        if (!this.ctx) return;
        
        if (mode === 'MENU' || mode === 'GARAGE') {
            // Smooth ambient BGM chords active, engine silent
            if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(0.20, this.ctx.currentTime, 0.1);
            if (this.engineGain) this.engineGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.1);
        } else if (mode === 'GAME') {
            // Fade out BGM, activate full engine throttle
            if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.2);
            if (this.engineGain) this.engineGain.gain.setTargetAtTime(0.20, this.ctx.currentTime, 0.1);
        }
    }
    
    resumeContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    update(speedKmh, isDrifting = false, isNitro = false) {
        if (!this.isInitialized || !this.ctx) return;
        
        // Gentle BGM chord modulation
        if (this.currentMode !== 'GAME' && this.bgmOsc1 && this.bgmOsc2) {
            const t = this.ctx.currentTime * 0.4;
            const chords = [220, 261.6, 293.7, 329.6]; // A, C, D, E
            const cIdx = Math.floor(t) % chords.length;
            this.bgmOsc1.frequency.setTargetAtTime(chords[cIdx], this.ctx.currentTime, 0.4);
            this.bgmOsc2.frequency.setTargetAtTime(chords[(cIdx + 2) % chords.length], this.ctx.currentTime, 0.4);
            return;
        }
        
        const speed = Math.abs(speedKmh);
        const speedRatio = Math.min(1.0, speed / 320);
        
        const baseFreq = 35 + Math.pow(speedRatio, 0.85) * 130 + (isNitro ? 15 : 0);
        
        if (this.osc1 && this.osc2 && this.osc3) {
            this.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);
            this.osc2.frequency.setTargetAtTime(baseFreq * 2.0, this.ctx.currentTime, 0.05);
            this.osc3.frequency.setTargetAtTime(baseFreq * 3.0, this.ctx.currentTime, 0.05);
        }
        
        if (this.filterNode) {
            const filterFreq = 650 + Math.pow(speedRatio, 0.7) * 3800 + (isNitro ? 800 : 0);
            this.filterNode.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.05);
        }
        
        if (this.engineGain) {
            const vol = 0.15 + speedRatio * 0.25;
            this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
        }
        
        if (this.skidGain) {
            const targetSkid = isDrifting ? 0.25 : 0.0;
            this.skidGain.gain.setTargetAtTime(targetSkid, this.ctx.currentTime, 0.04);
        }
    }
    
    playImpact(severity = 1.0) {
        if (!this.isInitialized || !this.ctx) return;
        
        try {
            const now = this.ctx.currentTime;
            
            // 1. Heavy Low-End Impact Thud (Sine 110Hz -> 25Hz)
            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(110, now);
            subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.28);
            
            subGain.gain.setValueAtTime(0.45, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            
            subOsc.connect(subGain);
            subGain.connect(this.masterGain);
            subOsc.start(now);
            subOsc.stop(now + 0.28);
            
            // 2. Filtered Metal Impact Crunch Noise (0.3s noise burst)
            const bufferSize = Math.floor(this.ctx.sampleRate * 0.30);
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
            }
            
            const noiseSource = this.ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;
            
            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(1200, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.30);
            
            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.35, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
            
            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            
            noiseSource.start(now);
            noiseSource.stop(now + 0.30);
        } catch (e) {}
    }
}
