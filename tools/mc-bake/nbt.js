/**
 * Minimal, dependency-free NBT reader (Java Edition).
 *
 * Supports every tag type used by Minecraft region files, including the
 * 1.18+ `block_states` palettes and long-array bit packing.
 *
 * Values are plain JS structures:
 *   compound -> object
 *   list     -> array
 *   byte/short/int/float/double -> number
 *   long     -> number when safe, BigInt otherwise
 *   byteArray/intArray -> Int8Array/Int32Array
 *   longArray -> BigInt64Array
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const TAG = {
    END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
    BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12
};

class Reader {
    constructor(buffer, offset = 0) {
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.u8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.offset = offset;
        this.decoder = new TextDecoder('utf-8');
    }

    need(bytes) {
        if (this.offset + bytes > this.u8.length) {
            throw new Error(`NBT truncated at ${this.offset} (+${bytes} of ${this.u8.length})`);
        }
    }

    i8() { this.need(1); return this.view.getInt8(this.offset++); }
    u16() { this.need(2); const v = this.view.getUint16(this.offset); this.offset += 2; return v; }
    i32() { this.need(4); const v = this.view.getInt32(this.offset); this.offset += 4; return v; }
    i64() { this.need(8); const v = this.view.getBigInt64(this.offset); this.offset += 8; return v; }
    f32() { this.need(4); const v = this.view.getFloat32(this.offset); this.offset += 4; return v; }
    f64() { this.need(8); const v = this.view.getFloat64(this.offset); this.offset += 8; return v; }

    str() {
        const len = this.u16();
        this.need(len);
        const s = this.decoder.decode(this.u8.subarray(this.offset, this.offset + len));
        this.offset += len;
        return s;
    }

    longNumber() {
        const v = this.i64();
        const n = Number(v);
        return Number.isSafeInteger(n) ? n : v;
    }

    tag(type) {
        switch (type) {
            case TAG.BYTE: return this.i8();
            case TAG.SHORT: return this.u16() << 16 >> 16;
            case TAG.INT: return this.i32();
            case TAG.LONG: return this.longNumber();
            case TAG.FLOAT: return this.f32();
            case TAG.DOUBLE: return this.f64();
            case TAG.BYTE_ARRAY: {
                const len = this.i32();
                this.need(len);
                const out = this.u8.slice(this.offset, this.offset + len);
                this.offset += len;
                return out;
            }
            case TAG.STRING: return this.str();
            case TAG.LIST: {
                const itemType = this.i8();
                const len = this.i32();
                const out = new Array(len);
                for (let i = 0; i < len; i++) out[i] = this.tag(itemType);
                return out;
            }
            case TAG.COMPOUND: return this.compound();
            case TAG.INT_ARRAY: {
                const len = this.i32();
                const out = new Int32Array(len);
                for (let i = 0; i < len; i++) out[i] = this.i32();
                return out;
            }
            case TAG.LONG_ARRAY: {
                const len = this.i32();
                const out = new BigInt64Array(len);
                for (let i = 0; i < len; i++) out[i] = this.i64();
                return out;
            }
            case TAG.END: return null;
            default: throw new Error(`Unknown NBT tag ${type} at ${this.offset}`);
        }
    }

    compound() {
        const out = {};
        for (;;) {
            const type = this.i8();
            if (type === TAG.END) return out;
            const name = this.str();
            out[name] = this.tag(type);
        }
    }
}

/** Parse a raw (uncompressed) NBT buffer. Returns the root compound. */
export function parseNbt(buffer, offset = 0) {
    const reader = new Reader(buffer, offset);
    const type = reader.i8();
    if (type !== TAG.COMPOUND) throw new Error(`Root tag must be compound, got ${type}`);
    reader.str(); // root name, always ""
    return reader.compound();
}

/** Parse a file that may be gzip-compressed (level.dat) or plain NBT. */
export function readNbtFile(file) {
    const raw = readFileSync(file);
    const plain = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
    return parseNbt(plain);
}

export { TAG };
