import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    TOUCH_ACTIONS,
    createTouchState,
    detectTouch,
    setTouchAction,
    TouchControls
} from '../src/ui/TouchControls.js';
import {
    canRegisterServiceWorker,
    collectResourceUrls,
    warmRuntimeCache
} from '../src/pwa.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

/* ---------------- touch detection ---------------- */

test('touch detection is off on a plain desktop', () => {
    assert.equal(detectTouch({}), false);
});

test('touch detection turns on for coarse pointers, touch points and touch events', () => {
    assert.equal(detectTouch({ coarsePointer: true }), true);
    assert.equal(detectTouch({ maxTouchPoints: 5 }), true);
    assert.equal(detectTouch({ touchEvent: true }), true);
});

test('?touch=1 and ?touch=0 override detection', () => {
    assert.equal(detectTouch({ search: '?touch=1' }), true);
    assert.equal(detectTouch({ search: '?foo=1&touch=1' }), true);
    assert.equal(detectTouch({ search: '?touch=0', maxTouchPoints: 10 }), false);
    assert.equal(detectTouch({ search: '?touch=0', coarsePointer: true }), false);
});

/* ---------------- control state ---------------- */

test('touch state starts with every action released', () => {
    const state = createTouchState();
    assert.deepEqual(Object.keys(state).sort(), [...TOUCH_ACTIONS].sort());
    for (const action of TOUCH_ACTIONS) assert.equal(state[action], false);
});

test('two fingers on one button keep it held until both lift', () => {
    const state = createTouchState();
    const holds = {};
    assert.equal(setTouchAction(state, holds, 'throttle', 1, true), true);
    assert.equal(setTouchAction(state, holds, 'throttle', 2, true), false);
    assert.equal(state.throttle, true);

    assert.equal(setTouchAction(state, holds, 'throttle', 1, false), false);
    assert.equal(state.throttle, true, 'second finger still holds throttle');

    assert.equal(setTouchAction(state, holds, 'throttle', 2, false), true);
    assert.equal(state.throttle, false);
});

test('unknown actions are ignored instead of polluting the state', () => {
    const state = createTouchState();
    const holds = {};
    assert.equal(setTouchAction(state, holds, 'launchMissiles', 1, true), false);
    assert.equal('launchMissiles' in state, false);
});

/* ---------------- DOM wiring ---------------- */

function fakeElement(action) {
    const listeners = new Map();
    const classes = new Set();
    return {
        dataset: { touchAction: action },
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
            contains: (name) => classes.has(name)
        },
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(fn);
        },
        removeEventListener() {},
        setPointerCapture() {},
        releasePointerCapture() {},
        setAttribute() {},
        fire(type, event = {}) {
            for (const fn of listeners.get(type) || []) {
                fn({
                    ...event,
                    currentTarget: this,
                    preventDefault() {},
                    stopPropagation() {}
                });
            }
        }
    };
}

test('buttons drive the control state and release on pointer up', () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.document = { addEventListener() {}, removeEventListener() {} };

    try {
        const throttle = fakeElement('throttle');
        const left = fakeElement('steerLeft');
        const rootEl = {
            classList: { toggle() {}, add() {}, remove() {} },
            setAttribute() {},
            querySelectorAll: () => [throttle, left]
        };

        const controls = new TouchControls(rootEl).mount();
        throttle.fire('pointerdown', { pointerId: 7 });
        left.fire('pointerdown', { pointerId: 8 });
        assert.equal(controls.state.throttle, true);
        assert.equal(controls.state.steerLeft, true);
        assert.equal(throttle.classList.contains('is-held'), true);

        throttle.fire('pointerup', { pointerId: 7 });
        assert.equal(controls.state.throttle, false);
        assert.equal(controls.state.steerLeft, true, 'steering survives a throttle release');

        controls.setVisible(false);
        assert.equal(controls.state.steerLeft, false, 'hiding the cockpit releases every button');
        controls.destroy();
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

/* ---------------- PWA assets ---------------- */

test('manifest is installable and matches the four-world game', () => {
    const manifest = readJson('manifest.webmanifest');
    assert.equal(manifest.short_name, 'APEX');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, 'landscape');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './');

    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes('192x192'), '192px icon for Android install');
    assert.ok(sizes.includes('512x512'), '512px icon for splash/install');
    assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));

    for (const icon of manifest.icons) {
        assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} exists`);
    }
});

test('service worker caches the shell and handles offline navigation', () => {
    const sw = read('sw.js');
    assert.match(sw, /addEventListener\('install'/);
    assert.match(sw, /addEventListener\('activate'/);
    assert.match(sw, /addEventListener\('fetch'/);
    assert.match(sw, /skipWaiting/);
    assert.match(sw, /clients\.claim/);
    assert.match(sw, /caches\.open/);
    assert.match(sw, /\.\/index\.html/);
    assert.match(sw, /manifest\.webmanifest/);
    assert.match(sw, /request\.mode === 'navigate'/);
});

test('page advertises the PWA without adding a separate download button', () => {
    const html = read('index.html');
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(html, /name="theme-color"/);
    assert.match(html, /name="apple-mobile-web-app-capable"/);
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.doesNotMatch(html, /id="btn-install"/i);
    assert.doesNotMatch(html, />\s*INSTALL APP\s*</i);
});

test('touch cockpit markup exposes every driving action', () => {
    const html = read('index.html');
    assert.match(html, /id="touch-controls"/);
    assert.match(html, /id="rotate-hint"/);
    for (const action of TOUCH_ACTIONS) {
        assert.match(html, new RegExp(`data-touch-action="${action}"`), `${action} button exists`);
    }
});

test('game wires touch controls, the mobile render scale and PWA registration', () => {
    const main = read('src/main.js');
    assert.match(main, /from '\.\/ui\/TouchControls\.js'/);
    assert.match(main, /from '\.\/pwa\.js'/);
    assert.match(main, /setupTouch\(\)/);
    assert.match(main, /registerWhenReady/);
    assert.match(main, /applyRenderScale\(\)/);
    for (const action of ['throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'nitro']) {
        assert.match(main, new RegExp(`isTouchPressed\\('${action}'\\)`), `${action} is read in the loop`);
    }
});

test('service worker registration is refused for file:// pages', () => {
    const fakeNav = { serviceWorker: { register() {} } };
    assert.equal(canRegisterServiceWorker(fakeNav, { protocol: 'file:' }), false);
    assert.equal(canRegisterServiceWorker(fakeNav, { protocol: 'https:' }), true);
    assert.equal(canRegisterServiceWorker(fakeNav, { protocol: 'http:' }), true);
    assert.equal(canRegisterServiceWorker({}, { protocol: 'https:' }), false);
});

/* ---------------- offline shell ---------------- */

test('the precache list covers the game modules and points at real files', () => {
    const list = readJson('assets/pwa/precache.json');
    assert.ok(Array.isArray(list) && list.length > 20);

    for (const required of [
        './index.html',
        './manifest.webmanifest',
        './src/main.js',
        './src/pwa.js',
        './src/ui/TouchControls.js',
        './src/vehicles/VehicleMerger.js',
        './assets/pwa/icon-192.png'
    ]) {
        assert.ok(list.includes(required), `${required} is precached`);
    }

    const modules = fs.readdirSync(path.join(root, 'src'), { recursive: true })
        .filter((entry) => String(entry).endsWith('.js'))
        .map((entry) => './src/' + String(entry).split(path.sep).join('/'));
    for (const module of modules) {
        assert.ok(list.includes(module), `${module} is precached for offline boot`);
    }

    for (const url of list) {
        if (url === './') continue;
        assert.ok(fs.existsSync(path.join(root, url)), `${url} exists`);
    }
});

test('the service worker loads the precache list and accepts warm messages', () => {
    const sw = read('sw.js');
    assert.match(sw, /precache\.json/);
    assert.match(sw, /readPrecacheList/);
    assert.match(sw, /type === 'WARM'/);
    assert.match(sw, /async function warm\(/);
    assert.match(sw, /apex-v4/);
});

test('collectResourceUrls only keeps real http(s) resource entries', () => {
    const perf = {
        getEntriesByType(type) {
            assert.equal(type, 'resource');
            return [
                { name: 'http://127.0.0.1:8123/src/main.js' },
                { name: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js' },
                { name: 'data:text/plain,no' },
                { name: '' },
                { name: null }
            ];
        }
    };
    const urls = collectResourceUrls({ perf });
    assert.deepEqual(urls, [
        'http://127.0.0.1:8123/src/main.js',
        'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
    ]);
    assert.deepEqual(collectResourceUrls({ perf: null }), []);
});

test('warmRuntimeCache posts the URL list to the active worker', async () => {
    const messages = [];
    const worker = { postMessage: (message) => messages.push(message) };
    const nav = { serviceWorker: { ready: Promise.resolve({ active: worker }) } };

    const count = await warmRuntimeCache({ nav, urls: ['http://x/a.js', 'http://x/b.png'] });
    assert.equal(count, 2);
    assert.deepEqual(messages, [{ type: 'WARM', urls: ['http://x/a.js', 'http://x/b.png'] }]);

    const noNav = await warmRuntimeCache({ nav: null, urls: ['http://x/a.js'] });
    assert.equal(noNav, 0);
});

test('the game warms the runtime cache after registering', () => {
    const main = read('src/main.js');
    assert.match(main, /warmRuntimeCache/);
    assert.match(main, /warmRuntimeCache\(\{ registration \}\)/);
});
