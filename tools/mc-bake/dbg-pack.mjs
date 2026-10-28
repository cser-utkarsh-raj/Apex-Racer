import { decodePacked } from './chunk-blocks.js';
function packPadded(indices, bits) {
    const longs = new BigInt64Array(Math.ceil((indices.length * bits) / 64));
    for (let i = 0; i < indices.length; i++) {
        const start = i * bits;
        const li = Math.floor(start / 64);
        const offset = start % 64;
        longs[li] |= BigInt(indices[i]) << BigInt(offset);
        const spill = offset + bits - 64;
        if (spill > 0) longs[li + 1] |= BigInt(indices[i]) >> BigInt(64 - offset);
    }
    return longs;
}
const values = Array.from({length:4096},(_,i)=>i%7);
const bits=5;
const longs=packPadded(values,bits);
const i=25,start=i*bits,li=(start/64)|0,off=start%64;
const mask=(1n<<BigInt(bits))-1n;
const shifted=(longs[li] >> BigInt(off));
const low=(shifted & mask);
const spill = off + bits - 64;
const spillMask=(1n<<BigInt(spill))-1n;
const next=(longs[li+1] & spillMask);
console.log('shifted&mask', low.toString(2), Number(low));
console.log('spillMask', spillMask.toString(2), 'next', next.toString(2), Number(next));
console.log('combined', Number(low | (next << BigInt(64-off))));
console.log('module out', decodePacked(longs,bits)[i], 'expected', values[i]);
console.log('lengths', longs.length, Math.ceil(4096*5/64), Math.ceil(4096/12));
