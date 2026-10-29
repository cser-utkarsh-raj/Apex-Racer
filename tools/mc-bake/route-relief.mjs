import fs from "node:fs";
const id = process.argv[2] || "nantwich";
const dir = `assets/worlds/${id}`;
const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
const cols = m.tiles.cols, step = m.step, tm = m.tileMeters;
const cache = new Map();
function tile(tx,tz){const k=`${tx},${tz}`; if(!cache.has(k)){const b=fs.readFileSync(`${dir}/tiles/t_${tx}_${tz}.bin`); cache.set(k,new DataView(b.buffer,b.byteOffset,b.byteLength));} return cache.get(k);}
function hAt(x,z){const tx=Math.floor((x-m.origin.x)/tm),tz=Math.floor((z-m.origin.z)/tm); if(tx<0||tz<0||tx>=m.tiles.x||tz>=m.tiles.z)return null; const v=tile(tx,tz); const cx=Math.floor((x-m.origin.x-tx*tm)/step),cz=Math.floor((z-m.origin.z-tz*tm)/step); if(cx<0||cz<0||cx>=cols||cz>=cols)return null; const y=v.getInt16((cz*cols+cx)*3,true); return y===-32768?null:y;}
const hs=[];
for (let i=0;i<m.route.length;i+=4){const [x,y,z]=m.route[i]; let mx=y; for(let dx=-24;dx<=24;dx+=4) for(let dz=-24;dz<=24;dz+=4){const h=hAt(x+dx,z+dz); if(h!==null&&h>mx)mx=h;} hs.push(mx-y);}
hs.sort((a,b)=>a-b);
const pct=p=>hs[Math.floor(hs.length*p)].toFixed(1);
console.log(id,'nearby max height above road: p10',pct(0.1),'p25',pct(0.25),'median',pct(0.5),'p75',pct(0.75),'p90',pct(0.9),'max',hs[hs.length-1].toFixed(1));
