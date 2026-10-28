/**
 * Anvil (.mca) region reader.
 *
 * Region file layout: 4 KiB location table, 4 KiB timestamp table, then
 * chunk payloads. Each payload is length-prefixed and compressed with either
 * gzip (1), zlib (2) or "none" (3).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';
import { parseNbt } from './nbt.js';

const SECTOR = 4096;

export class RegionFile {
    constructor(buffer, name = 'region') {
        this.buf = buffer;
        this.name = name;
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        if (buffer.length < SECTOR * 2) {
            this.empty = true;
        }
    }

    static open(file) {
        return new RegionFile(readFileSync(file), file);
    }

    /** List of `{ localX, localZ }` chunks present in this region. */
    keys() {
        const out = [];
        if (this.empty) return out;
        for (let i = 0; i < 1024; i++) {
            const entry = this.view.getUint32(i * 4);
            if (entry === 0) continue;
            out.push({ localX: i % 32, localZ: (i / 32) | 0, offset: (entry >>> 8) * SECTOR, sectors: entry & 0xff });
        }
        return out;
    }

    /** Read and parse the chunk at local (0..31) coordinates, or null. */
    readChunk(localX, localZ) {
        if (this.empty) return null;
        if (localX < 0 || localZ < 0 || localX > 31 || localZ > 31) return null;
        const entry = this.view.getUint32((localX + localZ * 32) * 4);
        if (entry === 0) return null;
        const offset = (entry >>> 8) * SECTOR;
        if (offset + 5 > this.buf.length) return null;
        const length = this.view.getInt32(offset);
        if (length <= 1 || offset + 4 + length > this.buf.length) return null;
        const compression = this.buf[offset + 4];
        const payload = this.buf.subarray(offset + 5, offset + 4 + length);
        let raw;
        try {
            if (compression === 1) raw = gunzipSync(payload);
            else if (compression === 2) raw = inflateSync(payload);
            else if (compression === 3) raw = payload;
            else return null;
        } catch {
            return null;
        }
        try {
            return parseNbt(raw);
        } catch {
            return null;
        }
    }
}

/** Yields `{ cx, cz, data }` for every generated chunk inside a tile. */
export function* regionChunks(regionFile, regionX, regionZ) {
    for (const key of regionFile.keys()) {
        const data = regionFile.readChunk(key.localX, key.localZ);
        if (!data) continue;
        yield {
            cx: regionX * 32 + key.localX,
            cz: regionZ * 32 + key.localZ,
            data
        };
    }
}
