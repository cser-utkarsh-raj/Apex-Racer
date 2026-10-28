import fs from "node:fs";
const id = process.argv[2] || "nantwich";
const dir = `assets/worlds/${id}`;
const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
const cols = m.tiles.cols, step = m.step, tm = m.tileMeters;
const cache = new Map();
function hAt(x, z) {
  const tx = Math.floor((x - m.origin.x) / tm), tz = Math.floor((z - m.origin.z) / tm);
  if (tx < 0 || tz < 0 || tx >= m.tiles.x || tz >= m.tiles.z) return null;
  const key = `${tx},${tz}`;
  if (!cache.has(key)) {
    const buf = fs.readFileSync(`${dir}/tiles/t_${key.replace(",","_")}.bin`);
    cache.set(key, new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
  }
  const view = cache.get(key);
  const cx = Math.floor((x - m.origin.x - tx * tm) / step);
  const cz = Math.floor((z - m.origin.z - tz * tm) / step);
  if (cx < 0 || cz < 0 || cx >= cols || cz >= cols) return null;
  const y = view.getInt16((cz * cols + cx) * 3, true);
  return y === -32768 ? null : y;
}
let above = 0, n = 0, maxDelta = 0, sum = 0;
const rows = [];
for (let i = 0; i < m.route.length; i += 8) {
  const [x, y, z] = m.route[i];
  const ring = [];
  for (const [dx, dz] of [[10,0],[-10,0],[0,10],[0,-10],[16,16],[-16,-16]]) {
    const h = hAt(x+dx, z+dz); if (h !== null) ring.push(h);
  }
  ring.sort((a,b)=>a-b);
  const med = ring[Math.floor(ring.length/2)] ?? y;
  const d = y - med;
  n++; sum += d; maxDelta = Math.max(maxDelta, Math.abs(d));
  if (d > 1.5) above++;
  rows.push(`z=${z.toFixed(0)} x=${x.toFixed(0)} y=${y.toFixed(1)} ground=${med} delta=${d.toFixed(1)}`);
}
console.log(rows.join("\n"));
console.log(`route points sampled ${n}, above ground >1.5m: ${above}, mean delta ${(sum/n).toFixed(2)}, max |delta| ${maxDelta.toFixed(1)}`);

