/**
 * Visual QA harness: drives a headless Chrome (CDP) through the four baked
 * worlds and writes one screenshot per world.
 *
 * Usage:
 *   node tools/preview/capture.mjs --port 9223 --out tools/preview/shots --tag before
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}

const port = Number(args.get('port') || 9223);
const outDir = path.resolve(args.get('out') || 'tools/preview/shots');
const tag = args.get('tag') || 'shot';
const base = args.get('base') || 'http://127.0.0.1:8123/index.html';
const width = Number(args.get('width') || 1440);
const height = Number(args.get('height') || 810);
const worlds = (args.get('worlds') || 'neo_tazader,chiang_tung,curitiba,nantwich').split(',');
const waitMs = Number(args.get('wait') || 5500);
const extraQuery = args.get('query') ? '&' + args.get('query') : '';

await mkdir(outDir, { recursive: true });

async function createTarget() {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    if (!res.ok) throw new Error(`create target: ${res.status}`);
    return res.json();
}

class CDP {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 0;
        this.pending = new Map();
        this.events = [];
        this.ready = new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            } else if (msg.method) {
                this.events.push(msg);
            }
        };
    }

    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    close() { this.ws.close(); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const world of worlds) {
    const target = await createTarget();
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;

    await cdp.send('Page.enable');
    await cdp.send('Page.bringToFront');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    // A stale service worker would serve yesterday's modules; clear it so the
    // screenshots always show the current working tree.
    await cdp.send('Storage.clearDataForOrigin', {
        origin: 'http://127.0.0.1:8123',
        storageTypes: 'service_workers,cache_storage'
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: false
    });

    const url = `${base}?autostart=1&world=${world}&telemetry=1&touch=0${extraQuery}`;
    await cdp.send('Page.navigate', { url });

    // Wait until the game has streamed its first ring.
    let state = null;
    let fatal = null;
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
        await sleep(1000);
        const res = await cdp.send('Runtime.evaluate', {
            expression: `(() => {
                const g = window.__apex;
                if (!g || !g.mapLoader || !g.mapLoader.stats) return null;
                return {
                    ready: !!g.physics,
                    chunks: g.mapLoader.stats.loadedChunks,
                    world: g.currentWorldId,
                    z: g.physics ? g.physics.z : null,
                    title: document.title,
                    loading: (document.getElementById('loading-screen') || {}).style?.display
                };
            })()`,
            returnByValue: true
        });
        state = res.result?.value;
        if (state && state.ready && state.chunks > 8 && state.world === world &&
            Math.abs(state.z) < 2000 && state.loading === 'none') break;
        const err = cdp.events.find(e => e.method === 'Runtime.exceptionThrown');
        if (err) {
            fatal = err.params.exceptionDetails?.exception?.description || JSON.stringify(err.params).slice(0, 600);
            break;
        }
    }

    if (fatal) {
        console.error(`[${world}] fatal: ${fatal.slice(0, 1200)}`);
        cdp.close();
        await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
        process.exitCode = 1;
        continue;
    }

    // Let tile streaming settle and the first frames stabilise.
    await sleep(waitMs);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(outDir, `${tag}_${world}.png`);
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    console.log(`${world}: ${file} ${state ? `chunks=${state.chunks} title=${state.title}` : 'no state'}`);

    const errors = cdp.events
        .filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded')
        .map(e => e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text)
        .filter(Boolean);
    if (errors.length) console.log(`  console: ${errors.slice(0, 5).join(' | ').slice(0, 800)}`);

    cdp.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
