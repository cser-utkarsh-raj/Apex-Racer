import test from 'node:test';
import assert from 'node:assert/strict';

test('AudioEngine instantiates and provides safe fallback without browser AudioContext', async () => {
    const { AudioEngine } = await import('../src/audio/AudioEngine.js');
    const engine = new AudioEngine();
    assert.ok(engine, 'AudioEngine instance created');
    assert.equal(engine.isInitialized, false, 'stays uninitialized gracefully outside browser');

    // Verify all public API methods don't throw when ctx is null
    assert.doesNotThrow(() => engine.setWorld('neo_city'));
    assert.doesNotThrow(() => engine.setWorld('mountain_pass'));
    assert.doesNotThrow(() => engine.setWorld('coastal_highway'));
    assert.doesNotThrow(() => engine.setWorld('countryside'));
    assert.doesNotThrow(() => engine.setMode('MENU'));
    assert.doesNotThrow(() => engine.setMode('GARAGE'));
    assert.doesNotThrow(() => engine.setMode('GAME'));
    assert.doesNotThrow(() => engine.switchMusicTrack('neo_tazader'));
    assert.doesNotThrow(() => engine.toggleMute());
    assert.doesNotThrow(() => engine.setMusicVolume(0.8));
    assert.doesNotThrow(() => engine.setSFXVolume(0.5));
    assert.doesNotThrow(() => engine.setEngineVolume(0.6));
    assert.doesNotThrow(() => engine.update(150, true, true, 3, 5200));
    assert.doesNotThrow(() => engine.playDriftStart());
    assert.doesNotThrow(() => engine.playNitro());
    assert.doesNotThrow(() => engine.playGearShift(2));
    assert.doesNotThrow(() => engine.playImpact(0.8));
    assert.doesNotThrow(() => engine.playSkid());
    assert.doesNotThrow(() => engine.playButtonClick());
    assert.doesNotThrow(() => engine.playSelection());
    assert.doesNotThrow(() => engine.dispose());
});

test('AudioEngine initializes, runs procedural synthesis and handles world aliases with Web Audio', async () => {
    // Setup minimal AudioContext mock
    const dummyParam = () => ({
        value: 1,
        setValueAtTime: () => {},
        setTargetAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        cancelScheduledValues: () => {}
    });

    globalThis.window = {
        AudioContext: class MockAudioContext {
            constructor() {
                this.currentTime = 0;
                this.state = 'running';
                this.sampleRate = 44100;
                this.destination = {};
            }
            createGain() {
                return { gain: dummyParam(), connect: () => {} };
            }
            createBiquadFilter() {
                return { frequency: dummyParam(), Q: dummyParam(), type: 'lowpass', connect: () => {} };
            }
            createOscillator() {
                return { frequency: dummyParam(), detune: dummyParam(), type: 'sawtooth', connect: () => {}, start: () => {}, stop: () => {} };
            }
            createBuffer(c, l, r) {
                return { getChannelData: () => new Float32Array(l) };
            }
            createBufferSource() {
                return { buffer: null, loop: false, connect: () => {}, start: () => {}, stop: () => {} };
            }
            resume() { return Promise.resolve(); }
            close() { return Promise.resolve(); }
        }
    };

    const { AudioEngine } = await import('../src/audio/AudioEngine.js?t=' + Date.now());
    const engine = new AudioEngine();
    assert.equal(engine.isInitialized, true, 'AudioEngine initialized with mock Web Audio');

    // Test world aliases resolution
    assert.doesNotThrow(() => engine.setWorld('neo_city'));
    assert.equal(engine.currentWorld, 'neo_tazader');

    assert.doesNotThrow(() => engine.setWorld('mountain_pass'));
    assert.equal(engine.currentWorld, 'chiang_tung');

    assert.doesNotThrow(() => engine.setWorld('coastal_highway'));
    assert.equal(engine.currentWorld, 'curitiba');

    assert.doesNotThrow(() => engine.setWorld('countryside'));
    assert.equal(engine.currentWorld, 'nantwich');

    // Test mode transitions
    assert.doesNotThrow(() => engine.setMode('GAME'));
    assert.equal(engine.currentMode, 'GAME');

    // Test car physics updates
    assert.doesNotThrow(() => engine.update(120, false, false, 2, 4000));
    assert.doesNotThrow(() => engine.update(180, true, true, 3, 6200));

    // Test SFX calls
    assert.doesNotThrow(() => engine.playImpact(1.0));
    assert.doesNotThrow(() => engine.playButtonClick());
    assert.doesNotThrow(() => engine.playSelection());
    assert.doesNotThrow(() => engine.playGearShift(4));

    // Test volume and mute
    const muted = engine.toggleMute();
    assert.equal(muted, true);
    assert.equal(engine.toggleMute(), false);

    // Clean teardown
    assert.doesNotThrow(() => engine.dispose());
    delete globalThis.window;
});
