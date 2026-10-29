/**
 * Generate the PWA icons (pure Node, no image dependencies).
 *
 *   node tools/make-pwa-icons.mjs
 *
 * Draws the APEX pixel "A" on the game's dark background and writes PNGs to
 * assets/pwa/. The maskable variant keeps the glyph inside the safe zone so
 * Android can crop it to a circle/squircle.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('assets/pwa');

const GLYPH = [
    '....###....',
    '...#####...',
    '..##...##..',
    '..##...##..',
    '.##.....##.',
    '.#########.',
    '.##.....##.',
    '##.......##',
    '##.......##',
    '##.......##'
];

function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        crc ^= buffer[i];
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filter: none
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // RGBA
    ihdr[10] = 0;  // deflate
    ihdr[11] = 0;  // adaptive filtering
    ihdr[12] = 0;  // no interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function setPixel(buf, size, x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

function fillRect(buf, size, x0, y0, w, h, r, g, b, a = 255) {
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) setPixel(buf, size, x0 + x, y0 + y, r, g, b, a);
    }
}

function renderIcon(size, { maskable = false } = {}) {
    const buf = Buffer.alloc(size * size * 4);

    // Background: subtle vertical gradient from deep blue-black to black.
    for (let y = 0; y < size; y++) {
        const t = y / Math.max(1, size - 1);
        const r = Math.round(11 * (1 - t) + 4 * t);
        const g = Math.round(18 * (1 - t) + 6 * t);
        const b = Math.round(32 * (1 - t) + 10 * t);
        for (let x = 0; x < size; x++) setPixel(buf, size, x, y, r, g, b);
    }

    const scale = maskable ? 0.46 : 0.64;
    const cell = Math.max(4, Math.floor((size * scale) / GLYPH[0].length));
    const glyphW = cell * GLYPH[0].length;
    const glyphH = cell * GLYPH.length;
    const ox = Math.round((size - glyphW) / 2);
    const oy = Math.round((size - glyphH) / 2) - Math.round(cell * 0.35);

    for (let row = 0; row < GLYPH.length; row++) {
        const t = row / (GLYPH.length - 1);
        const r = Math.round(104 * (1 - t) + 0 * t);
        const g = Math.round(255 * (1 - t) + 214 * t);
        const b = Math.round(228 * (1 - t) + 170 * t);
        for (let col = 0; col < GLYPH[row].length; col++) {
            if (GLYPH[row][col] !== '#') continue;
            fillRect(buf, size, ox + col * cell, oy + row * cell, cell, cell, r, g, b);
        }
    }

    // Gold underline, slightly narrower than the glyph.
    const barW = Math.round(glyphW * 0.62);
    const barH = Math.max(3, Math.round(cell * 0.34));
    fillRect(
        buf, size,
        Math.round((size - barW) / 2),
        oy + glyphH + Math.round(cell * 0.55),
        barW, barH,
        255, 230, 0
    );

    return buf;
}

fs.mkdirSync(OUT, { recursive: true });

const files = [
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'icon-maskable-512.png', size: 512, maskable: true },
    { name: 'apple-touch-icon-180.png', size: 180, maskable: false }
];

for (const file of files) {
    const png = encodePng(file.size, file.size, renderIcon(file.size, file));
    fs.writeFileSync(path.join(OUT, file.name), png);
    console.log(`wrote assets/pwa/${file.name} (${png.length} bytes)`);
}
