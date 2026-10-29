import fs from 'node:fs';
const ROOT = '.';
for (const id of ['neo_tazader','chiang_tung','curitiba','nantwich']) {
  const m = JSON.parse(fs.readFileSync(`assets/worlds/${id}/manifest.json`,'utf8'));
  const cols = m.tiles.cols, step = m.step, tm = m.tileMeters;
  const route = m.route;
  const at = z => { let best=route[0]; for (const p of route) if (Math.abs(p[2]-z)<Math.abs(best[2]-z)) best=p; return best; };
  console.log(`\n== ${id}  tiles ${m.tiles.x}x${m.tiles.z}  origin ${m.origin.x},${m.origin.z}  route z ${route[0][2]}..${route[route.length-1][2]}`);
  for (const frac of [0,0.25,0.5,0.75,1]) {
    const z = route[route.length-1][2] + (route[0][2]-route[route.length-1][2])*frac;
    const p = at(z);
    console.log(`  t=${frac.toFixed(2)} z=${p[2]} x=${p[0].toFixed(0)} y=${p[1].toFixed(1)}`);
  }
  // height stats across all tiles and where the highest ground is
  let maxY=-9999, maxAt=null, hiCols=0, totCols=0;
  for (let tz=0;tz<m.tiles.z;tz++) for (let tx=0;tx<m.tiles.x;tx++) {
    const buf = fs.readFileSync(`assets/worlds/${id}/tiles/t_${tx}_${tz}.bin`);
    const view = new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
    for (let i=0;i<cols*cols;i++){ const h=view.getInt16(i*3,true); if(h===-32768) continue; totCols++; if(h>maxY){maxY=h; const cx=i%cols, cz=(i/cols)|0; maxAt=[m.origin.x+tx*tm+(cx+0.5)*step, m.origin.z+tz*tm+(cz+0.5)*step];} }
  }
  console.log(`  terrain maxY=${maxY} at ${maxAt?.map(v=>v.toFixed(0))}`);
}
