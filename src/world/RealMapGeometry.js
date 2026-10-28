import * as THREE from 'three';
import { hexToRgb } from './RealMap.js';

/**
 * Builds one streamed terrain tile from baked Minecraft data.
 *
 * - greedy row merging for roof/ground quads
 * - one quad per visible wall face instead of per voxel step
 * - flattens a corridor along the race route, with a raised sidewalk/curb
 * - optional emissive window quads for night cities
 */
export function buildTileGeometry(tile, ctx) {
    const {
        manifest, route, tx, tz,
        palette, road, windows = false, windowColors = ['#ffcf8a', '#9fe7ff'],
        night = false
    } = ctx;

    const cols = manifest.tiles.cols;
    const step = manifest.step;
    const ox = manifest.origin.x + tx * cols * step;
    const oz = manifest.origin.z + tz * cols * step;
    const originX = manifest.origin.x;
    const originZ = manifest.origin.z;

    const half = road.width / 2;
    const shoulder = road.shoulder;
    const sidewalk = road.sidewalk;
    const shelf = road.shelf;

    const surface = new Float32Array(cols * cols);
    const colour = new Uint8Array(cols * cols);
    const raw = tile.heights;
    const rawColour = tile.colors;

    const roadRGB = road.roadColor || [0.10, 0.105, 0.115];
    const walkRGB = road.sidewalkColor || [0.62, 0.62, 0.6];

    // 0 = untouched map, 1 = asphalt, 2 = shoulder, 3 = raised sidewalk.
    const surfaceKind = new Uint8Array(cols * cols);

    // Per-column surface pass: copy real data, then carve the corridor.
    for (let cz = 0; cz < cols; cz++) {
        const wz = oz + (cz + 0.5) * step;
        const centre = route.empty ? null : route.atZ(wz);
        for (let cx = 0; cx < cols; cx++) {
            const i = cz * cols + cx;
            const wx = ox + (cx + 0.5) * step;
            const h = raw[i];
            surface[i] = h === -32768 ? -32768 : h;
            colour[i] = rawColour[i];

            if (!centre) continue;
            const abs = Math.abs(wx - centre.x);

            if (abs <= half + 0.35) {
                surface[i] = centre.y;
                surfaceKind[i] = 1;
            } else if (abs <= half + shoulder + 0.35) {
                surface[i] = centre.y + 0.02;
                surfaceKind[i] = 2;
            } else if (abs <= half + shoulder + sidewalk + 0.35) {
                surface[i] = centre.y + 0.16;
                surfaceKind[i] = 3;
            } else if (abs <= half + shoulder + sidewalk + shelf) {
                // Leave the map alone beyond the kerb: buildings should rise
                // straight out of the pavement. Only fill genuine holes so the
                // car never drops into a canal right beside the road.
                if (surface[i] < centre.y - 1.2) surface[i] = centre.y - 1.2;
            }
        }
    }

    const lit = new GeoBuilder();
    const glow = new GeoBuilder();

    const mapTint = night ? 0.68 : 1.0;
    const get = (x, z) => (x < 0 || z < 0 || x >= cols || z >= cols) ? null : surface[z * cols + x];
    const baseColour = (i) => {
        if (surfaceKind[i] === 1) return roadRGB;
        if (surfaceKind[i] === 2) return [roadRGB[0] * 1.35, roadRGB[1] * 1.35, roadRGB[2] * 1.35];
        if (surfaceKind[i] === 3) return walkRGB;
        const p = palette[colour[i]] || [0.5, 0.5, 0.5];
        return [p[0] * mapTint, p[1] * mapTint, p[2] * mapTint];
    };

    /* ---------------- top faces (greedy along X) ---------------- */
    for (let cz = 0; cz < cols; cz++) {
        let cx = 0;
        while (cx < cols) {
            const i = cz * cols + cx;
            const h = surface[i];
            if (h === -32768) { cx++; continue; }
            let run = 1;
            while (cx + run < cols) {
                const j = i + run;
                if (surface[j] !== h) break;
                if (colour[j] !== colour[i]) break;
                if (surfaceKind[j] !== surfaceKind[i]) break;
                run++;
            }

            const jitter = hash2(cx, cz, 101) % 9;
            const shade = 0.94 + jitter * 0.012;
            const c = baseColour(i);
            const x0 = cx * step, x1 = (cx + run) * step;
            const z0 = cz * step, z1 = (cz + 1) * step;
            lit.quad(
                [x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0],
                [0, 1, 0], c[0] * shade, c[1] * shade, c[2] * shade
            );
            cx += run;
        }
    }

    /* ---------------- walls ---------------- */
    // A column's top block says what is *on* it, not what its cliff face is
    // made of. Without this, grass hills become 20 m bright-green slabs and
    // stone towns glow pink. Vegetation and soil faces blend towards a
    // neutral rock/earth tone; built materials keep their real colour.
    const wallShade = 0.8;
    const wallTopShade = wallShade * 0.86;
    const EARTH = [0.3, 0.27, 0.24];
    const wallBase = (c) => {
        const vegetation = c[1] > c[0] * 1.06 && c[1] > c[2] * 1.12;
        const soil = c[0] > c[1] * 1.06 && c[1] > c[2] * 1.02;
        const k = vegetation ? 0.82 : soil ? 0.42 : 0.14;
        return [
            c[0] * (1 - k) + EARTH[0] * k,
            c[1] * (1 - k) + EARTH[1] * k,
            c[2] * (1 - k) + EARTH[2] * k
        ];
    };
    const bottomColour = (c) => [c[0] * wallShade, c[1] * wallShade, c[2] * wallShade];
    const topColour = (c) => [c[0] * wallTopShade, c[1] * wallTopShade, c[2] * wallTopShade];
    for (let cz = 0; cz < cols; cz++) {
        for (let cx = 0; cx < cols; cx++) {
            const i = cz * cols + cx;
            const h = surface[i];
            if (h === -32768) continue;
            const cbase = wallBase(baseColour(i));
            const cxw = cx * step, czw = cz * step;

            const inward = get(cx - 1, cz);
            if (inward !== null && h - inward !== 0) {
                if (h > inward) {
                    const lo = inward === -32768 ? h - 2 : inward;
                    if (h - lo > 0.22) {
                        lit.quadGradient(
                            [cxw, lo, czw], [cxw, lo, czw + step],
                            [cxw, h, czw + step], [cxw, h, czw],
                            [-1, 0, 0], bottomColour(cbase), topColour(cbase)
                        );
                        maybeWindow(glow, windows, cx, cz, [cxw, lo, czw], [-1, 0, 0], h - lo, windowColors, step);
                    }
                }
            }
            const outward = get(cx + 1, cz);
            if (outward !== null && h > outward && h - outward > 0.22) {
                const lo = outward === -32768 ? h - 2 : outward;
                lit.quadGradient(
                    [cxw + step, lo, czw + step], [cxw + step, lo, czw],
                    [cxw + step, h, czw], [cxw + step, h, czw + step],
                    [1, 0, 0], bottomColour(cbase), topColour(cbase)
                );
                maybeWindow(glow, windows, cx, cz, [cxw + step, lo, czw], [1, 0, 0], h - lo, windowColors, step);
            }
            const back = get(cx, cz - 1);
            if (back !== null && h > back && h - back > 0.22) {
                const lo = back === -32768 ? h - 2 : back;
                lit.quadGradient(
                    [cxw + step, lo, czw], [cxw, lo, czw],
                    [cxw, h, czw], [cxw + step, h, czw],
                    [0, 0, -1], bottomColour(cbase), topColour(cbase)
                );
                maybeWindow(glow, windows, cx, cz, [cxw, lo, czw], [0, 0, -1], h - lo, windowColors, step);
            }
            const front = get(cx, cz + 1);
            if (front !== null && h > front && h - front > 0.22) {
                const lo = front === -32768 ? h - 2 : front;
                lit.quadGradient(
                    [cxw, lo, czw + step], [cxw + step, lo, czw + step],
                    [cxw + step, h, czw + step], [cxw, h, czw + step],
                    [0, 0, 1], bottomColour(cbase), topColour(cbase)
                );
                maybeWindow(glow, windows, cx, cz, [cxw, lo, czw + step], [0, 0, 1], h - lo, windowColors, step);
            }
        }
    }

    const litGeometry = lit.build();
    const glowGeometry = glow.count ? glow.build() : null;
    return { litGeometry, glowGeometry, ox, oz };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

class GeoBuilder {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.colors = [];
        this.count = 0;
    }

    quad(p0, p1, p2, p3, n, r, g, b) {
        const P = this.positions, N = this.normals, C = this.colors;
        const verts = [p0, p1, p2, p0, p2, p3];
        for (const p of verts) {
            P.push(p[0], p[1], p[2]);
            N.push(n[0], n[1], n[2]);
            C.push(r, g, b);
        }
        this.count++;
    }

    /**
     * Wall quad with a vertical light gradient: the bottom two vertices use
     * `bottom`, the top two `top`. Cheap way to suggest street-lamp spill
     * without extra geometry or lights.
     */
    quadGradient(p0, p1, p2, p3, n, bottom, top) {
        const P = this.positions, N = this.normals, C = this.colors;
        const verts = [p0, p1, p2, p0, p2, p3];
        const cols = [bottom, bottom, top, bottom, top, top];
        for (let i = 0; i < verts.length; i++) {
            const p = verts[i];
            P.push(p[0], p[1], p[2]);
            N.push(n[0], n[1], n[2]);
            const c = cols[i];
            C.push(c[0], c[1], c[2]);
        }
        this.count++;
    }

    build() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
        geo.computeBoundingSphere();
        return geo;
    }
}

function maybeWindow(glow, enabled, cx, cz, base, normal, height, colours, step) {
    // Only real façades get windows; terrain steps and kerbs stay solid.
    if (!enabled || height < 8) return;

    const seed = hash2(cx, cz, 977);
    const rows = Math.min(12, Math.max(2, Math.floor((height - 2.4) / 3.6)));
    const rowGap = (height - 2.8) / rows;
    const tall = Math.min(1.15, rowGap * 0.44);
    const wide = step * 0.2;

    const nx = normal[0], nz = normal[2];
    const px = -nz, pz = nx; // tangent along the wall
    const inset = 0.07;
    const bx = base[0] + nx * inset;
    const bz = base[2] + nz * inset;

    for (let row = 0; row < rows; row++) {
        const r = (seed + row * 2246822519) >>> 0;
        if (r % 100 > 52) continue;
        const bottom = base[1] + 1.6 + row * rowGap;
        const a = [bx - px * wide, bottom, bz - pz * wide];
        const b = [bx + px * wide, bottom, bz + pz * wide];
        const d = [bx + px * wide, bottom + tall, bz + pz * wide];
        const e = [bx - px * wide, bottom + tall, bz - pz * wide];
        const colour = colours[r % colours.length];
        const tint = typeof colour === 'string' ? hexToRgb(colour) : colour;
        // Vary brightness per room so towers read as hundreds of windows
        // instead of a uniform light grid.
        const gain = 0.42 + ((r >>> 8) % 46) / 100;
        const c = [tint[0] * gain, tint[1] * gain, tint[2] * gain];

        if (nx === 0 && nz === -1) glow.quad(a, b, d, e, normal, c[0], c[1], c[2]);
        else if (nx === 0) glow.quad(b, a, e, d, normal, c[0], c[1], c[2]);
        else if (nx === -1) glow.quad(a, b, d, e, normal, c[0], c[1], c[2]);
        else glow.quad(b, a, e, d, normal, c[0], c[1], c[2]);
    }
}

export function hash2(x, z, salt = 0) {
    let h = (x * 374761393 + z * 668265263 + salt * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0);
}
