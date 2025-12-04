import { rsEncode, rsDecode } from './src/lib/reed-solomon';

const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const nsym = 4;

console.log('Data:', Array.from(data));
const encoded = rsEncode(data, nsym);
console.log('Encoded:', Array.from(encoded));

// Check syndromes manually
const gfExp: number[] = new Array(512);
const gfLog: number[] = new Array(256);
(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return gfExp[gfLog[a] + gfLog[b]];
}

function gfPow(x: number, power: number): number {
  if (x === 0) return power === 0 ? 1 : 0;
  return gfExp[(gfLog[x] * power) % 255];
}

// Polynomial eval in low-to-high order
function polyEval(p: number[], x: number): number {
  let result = 0;
  let xPow = 1;
  for (let i = 0; i < p.length; i++) {
    result ^= gfMul(p[i], xPow);
    xPow = gfMul(xPow, x);
  }
  return result;
}

// Calculate syndromes
const msg = Array.from(encoded);
console.log('\nSyndromes:');
for (let i = 0; i < nsym; i++) {
  const alpha_i = gfPow(2, i);
  const s = polyEval(msg, alpha_i);
  console.log(`S_${i} = r(α^${i}) = ${s}`);
}
