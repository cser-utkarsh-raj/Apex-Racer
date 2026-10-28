/**
 * RoutePath — the race centreline baked from the real map.
 *
 * Points are sorted by Z and the path is monotonic along Z, which keeps every
 * query O(log n) and lets the streaming world reuse the same Z-chunk model as
 * the rest of the game. Forward driving direction is -Z (canonical APEX).
 */
export class RoutePath {
    /** @param {Array<{x:number,y:number,z:number}>|Array<number[]>} points */
    constructor(points) {
        const pts = (points || []).map(p => Array.isArray(p)
            ? { x: p[0], y: p[1], z: p[2] }
            : { x: p.x, y: p.y, z: p.z });
        pts.sort((a, b) => a.z - b.z);
        this.points = pts;
        this.cumulative = new Float64Array(pts.length);
        for (let i = 1; i < pts.length; i++) {
            this.cumulative[i] = this.cumulative[i - 1]
                + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        }
        this.length = pts.length ? this.cumulative[pts.length - 1] : 0;
        this.zMin = pts.length ? pts[0].z : 0;
        this.zMax = pts.length ? pts[pts.length - 1].z : 0;
    }

    get empty() { return this.points.length < 2; }

    /** Index of the segment containing z (clamped). */
    _segment(z) {
        const pts = this.points;
        if (z <= pts[0].z) return 0;
        if (z >= pts[pts.length - 1].z) return pts.length - 2;
        let lo = 0, hi = pts.length - 1;
        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            if (pts[mid].z <= z) lo = mid; else hi = mid;
        }
        return lo;
    }

    /** Sample the centreline at a given Z. */
    atZ(z) {
        const pts = this.points;
        if (!pts.length) return { x: 0, y: 0, z, heading: 0, dx: 0, slope: 0 };
        if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, z, heading: 0, dx: 0, slope: 0 };

        const i = this._segment(z);
        const a = pts[i], b = pts[i + 1];
        const span = b.z - a.z || 1;
        const t = Math.max(0, Math.min(1, (z - a.z) / span));
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const dx = (b.x - a.x) / span;
        const dy = (b.y - a.y) / span;
        // Forward vector points towards -Z: f = (-dx, -1) / |(-dx, -1)|.
        // Canonical heading satisfies f = (-sin(angle), -cos(angle)), so
        // angle = atan2(dx, 1).
        const heading = Math.atan2(dx, 1);
        return { x, y, z, heading, dx, slope: dy };
    }

    xAt(z) { return this.atZ(z).x; }
    yAt(z) { return this.atZ(z).y; }
    headingAt(z) { return this.atZ(z).heading; }

    /** Road bounds used by vehicle physics, traffic and the minimap. */
    bounds(z, width) {
        const s = this.atZ(z);
        const half = width / 2;
        const dx = s.dx;
        const len = Math.hypot(dx, 1);
        return {
            centerX: s.x,
            width,
            halfWidth: half,
            y: s.y,
            heading: s.heading,
            // Unit normal pointing to +X side of travel.
            nx: 1 / len,
            nz: -dx / len,
            minX: s.x - half,
            maxX: s.x + half,
            left: s.x - half,
            right: s.x + half
        };
    }

    /** Road segments (for traffic AI + minimap) between z0 and z1. */
    segments(width, z0 = this.zMin, z1 = this.zMax, step = 96) {
        const out = [];
        for (let z = z0; z < z1; z += step) {
            const zEnd = Math.min(z1, z + step);
            const a = this.atZ(z);
            const b = this.atZ(zEnd);
            out.push({
                startX: a.x,
                startZ: z,
                endX: b.x,
                endZ: zEnd,
                width,
                y: a.y
            });
        }
        return out;
    }
}
