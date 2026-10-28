/**
 * RealMap — loads baked Minecraft terrain tiles for one world.
 *
 * Everything here is transport-agnostic: pass a `fetchImpl` (defaults to the
 * browser fetch) so the module can be unit tested in Node without a server.
 */
import { RoutePath } from './RoutePath.js';

const TILE_CACHE_LIMIT = 96;

export class RealMap {
    constructor(manifest, options = {}) {
        this.manifest = manifest;
        this.id = manifest.id;
        this.baseUrl = options.baseUrl || `assets/worlds/${manifest.id}`;
        this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
        this.step = manifest.step;
        this.cols = manifest.tiles.cols;
        this.tileMeters = manifest.tileMeters;
        this.origin = manifest.origin;
        this.size = manifest.size;

        this.palette = (manifest.palette || ['#000000']).map(hexToRgb);
        this.route = new RoutePath(manifest.route || []);
        this.waterLevel = manifest.waterLevel;

        this.tiles = new Map();
        this._pending = new Map();
        this._order = [];
        this.loadedBytes = 0;
    }

    static async load(worldId, options = {}) {
        const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
        const baseUrl = options.baseUrl || `assets/worlds/${worldId}`;
        const res = await fetchImpl(`${baseUrl}/manifest.json`, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`manifest ${worldId}: HTTP ${res.status}`);
        const manifest = await res.json();
        return new RealMap(manifest, { ...options, baseUrl, fetchImpl });
    }

    /* ------------------------------------------------------------------ */
    /* Geometry helpers                                                    */
    /* ------------------------------------------------------------------ */

    /** Column index inside a tile, or -1 when outside the baked area. */
    tileCoordAt(x, z) {
        const lx = Math.floor((x - this.origin.x) / this.step);
        const lz = Math.floor((z - this.origin.z) / this.step);
        if (lx < 0 || lz < 0) return null;
        if (lx >= this.manifest.columns || lz >= this.manifest.columns) return null;
        return {
            tx: Math.floor(lx / this.cols),
            tz: Math.floor(lz / this.cols),
            cx: lx % this.cols,
            cz: lz % this.cols
        };
    }

    tileKey(tx, tz) { return `${tx},${tz}`; }

    getTile(tx, tz) { return this.tiles.get(this.tileKey(tx, tz)) || null; }

    /** Stream a tile in (idempotent, de-duplicated). */
    async ensureTile(tx, tz) {
        const key = this.tileKey(tx, tz);
        if (this.tiles.has(key)) return this.tiles.get(key);
        if (this._pending.has(key)) return this._pending.get(key);
        if (tx < 0 || tz < 0 || tx >= this.manifest.tiles.x || tz >= this.manifest.tiles.z) return null;

        const job = (async () => {
            const res = await this.fetchImpl(`${this.baseUrl}/tiles/t_${tx}_${tz}.bin`, { cache: 'force-cache' });
            if (!res.ok) throw new Error(`tile ${tx},${tz}: HTTP ${res.status}`);
            const buffer = await res.arrayBuffer();
            const tile = decodeTile(buffer, this.cols);
            tile.tx = tx;
            tile.tz = tz;
            this.tiles.set(key, tile);
            this._order.push(key);
            this.loadedBytes += buffer.byteLength;
            while (this._order.length > TILE_CACHE_LIMIT) {
                const old = this._order.shift();
                if (old === key) continue;
                const t = this.tiles.get(old);
                if (t) this.loadedBytes -= this.cols * this.cols * 3;
                this.tiles.delete(old);
            }
            return tile;
        })();

        this._pending.set(key, job);
        try {
            return await job;
        } finally {
            this._pending.delete(key);
        }
    }

    /** Height at world (x,z) using loaded tiles, or null when not streamed. */
    heightAt(x, z) {
        const c = this.tileCoordAt(x, z);
        if (!c) return null;
        const tile = this.getTile(c.tx, c.tz);
        if (!tile) return null;
        return tile.heights[c.cz * this.cols + c.cx];
    }

    /** Colour (0..1 rgb) at world (x,z), or null. */
    colorAt(x, z) {
        const c = this.tileCoordAt(x, z);
        if (!c) return null;
        const tile = this.getTile(c.tx, c.tz);
        if (!tile) return null;
        return this.palette[tile.colors[c.cz * this.cols + c.cx]] || [0.5, 0.5, 0.5];
    }

    /** Route-based fallback so physics never falls through unloaded terrain. */
    groundAt(x, z) {
        const h = this.heightAt(x, z);
        if (h !== null && h > -32768) return h;
        return this.route.yAt(z);
    }

    /** True when the world is large enough that the given z is inside it. */
    contains(x, z) {
        return this.tileCoordAt(x, z) !== null;
    }

    /** Tile range needed for a Z window (used by the streaming ring). */
    tilesInRange(zFrom, zTo) {
        const out = [];
        const tzMin = Math.max(0, Math.floor((Math.min(zFrom, zTo) - this.origin.z) / this.tileMeters));
        const tzMax = Math.min(this.manifest.tiles.z - 1, Math.floor((Math.max(zFrom, zTo) - this.origin.z) / this.tileMeters));
        for (let tz = tzMin; tz <= tzMax; tz++) {
            for (let tx = 0; tx < this.manifest.tiles.x; tx++) out.push({ tx, tz });
        }
        return out;
    }

    dispose() {
        this.tiles.clear();
        this._order.length = 0;
        this.loadedBytes = 0;
    }
}

function decodeTile(buffer, cols) {
    const bytes = new Uint8Array(buffer);
    const count = cols * cols;
    const heights = new Int16Array(count);
    const colors = new Uint8Array(count);
    const view = new DataView(buffer);
    for (let i = 0; i < count; i++) {
        heights[i] = view.getInt16(i * 3, true);
        colors[i] = bytes[i * 3 + 2];
    }
    return { heights, colors };
}

export function hexToRgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export { decodeTile };
