/**
 * Minimal three.js stand-in for Node unit tests.
 *
 * The meshers only need buffer containers and colours, so this stub keeps the
 * real algorithms under test without pulling a 600 kB renderer into the test
 * process. Tests assert on the raw attribute arrays.
 */

export class BufferAttribute {
    constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
        this.count = itemSize ? Math.floor(array.length / itemSize) : array.length;
    }
}

export class Float32BufferAttribute extends BufferAttribute {
    constructor(array, itemSize) {
        super(array instanceof Float32Array ? array : Float32Array.from(array), itemSize);
    }
}

export class BufferGeometry {
    constructor() {
        this.attributes = {};
        this.boundingSphere = null;
    }

    setAttribute(name, attribute) {
        this.attributes[name] = attribute;
        return this;
    }

    getAttribute(name) {
        return this.attributes[name];
    }

    computeVertexNormals() {
        const position = this.attributes.position;
        if (!position) return;
        const p = position.array;
        const normals = new Float32Array(p.length);
        for (let i = 0; i < p.length; i += 9) {
            const ax = p[i], ay = p[i + 1], az = p[i + 2];
            const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
            const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            for (let k = 0; k < 9; k += 3) {
                normals[i + k] = nx;
                normals[i + k + 1] = ny;
                normals[i + k + 2] = nz;
            }
        }
        this.attributes.normal = new Float32BufferAttribute(normals, 3);
    }

    computeBoundingSphere() {
        const position = this.attributes.position;
        let radius = 0;
        if (position) {
            for (let i = 0; i < position.array.length; i += 3) {
                const x = position.array[i];
                const y = position.array[i + 1];
                const z = position.array[i + 2];
                radius = Math.max(radius, Math.hypot(x, y, z));
            }
        }
        this.boundingSphere = { radius };
    }

    dispose() { this.disposed = true; }
}

export class Color {
    constructor(value = 0xffffff) {
        if (Array.isArray(value)) this.fromArray(value);
        else this.setHex(value);
    }

    setHex(value) {
        if (typeof value === 'string') {
            const hex = value.replace('#', '');
            const n = parseInt(hex.length === 3
                ? hex.split('').map(c => c + c).join('')
                : hex, 16);
            this.r = ((n >> 16) & 255) / 255;
            this.g = ((n >> 8) & 255) / 255;
            this.b = (n & 255) / 255;
            return this;
        }
        this.r = ((value >> 16) & 255) / 255;
        this.g = ((value >> 8) & 255) / 255;
        this.b = (value & 255) / 255;
        return this;
    }

    fromArray(array) {
        this.r = array[0];
        this.g = array[1];
        this.b = array[2];
        return this;
    }

    clone() {
        const c = new Color();
        c.r = this.r; c.g = this.g; c.b = this.b;
        return c;
    }

    multiplyScalar(s) {
        this.r *= s; this.g *= s; this.b *= s;
        return this;
    }
}

export class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
}

export class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

export class Group {
    constructor() {
        this.children = [];
        this.position = new Vector3();
        this.userData = {};
    }
    add(child) { this.children.push(child); }
    remove(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
    }
    traverse(fn) { fn(this); for (const child of this.children) child.traverse?.(fn); }
}

export class Mesh extends Group {
    constructor(geometry, material) {
        super();
        this.isMesh = true;
        this.geometry = geometry;
        this.material = material;
    }
}

export class MeshBasicMaterial {
    constructor(options = {}) { Object.assign(this, options); }
}

export class MeshStandardMaterial {
    constructor(options = {}) { Object.assign(this, options); }
}
