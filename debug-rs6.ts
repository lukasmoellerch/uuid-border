import { rsEncode, rsDecode } from './src/lib/reed-solomon';

// Copy the internal functions here for debugging

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

function gfInverse(x: number): number {
  return gfExp[255 - gfLog[x]];
}

function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

function calcSyndromes(msg: number[], nsym: number): number[] {
  const synd = new Array(nsym).fill(0);
  for (let i = 0; i < nsym; i++) {
    synd[i] = polyEval(msg, gfPow(2, i));
  }
  return synd;
}

function findErrorLocator(synd: number[], nsym: number): number[] {
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  
  for (let n = 0; n < nsym; n++) {
    let d = synd[n];
    for (let i = 1; i <= L; i++) {
      d ^= gfMul(C[i], synd[n - i]);
    }
    
    console.log(`n=${n}: d=${d}, L=${L}, C=${JSON.stringify(C)}, B=${JSON.stringify(B)}`);
    
    if (d === 0) {
      m++;
    } else if (2 * L <= n) {
      const T = [...C];
      const scale = gfMul(d, gfInverse(b));
      const shiftedB = [...new Array(m).fill(0), ...B];
      while (C.length < shiftedB.length) C.push(0);
      for (let i = 0; i < shiftedB.length; i++) {
        C[C.length - shiftedB.length + i] ^= gfMul(scale, shiftedB[i]);
      }
      L = n + 1 - L;
      B = T;
      b = d;
      m = 1;
    } else {
      const scale = gfMul(d, gfInverse(b));
      const shiftedB = [...new Array(m).fill(0), ...B];
      while (C.length < shiftedB.length) C.push(0);
      for (let i = 0; i < shiftedB.length; i++) {
        C[C.length - shiftedB.length + i] ^= gfMul(scale, shiftedB[i]);
      }
      m++;
    }
  }
  
  while (C.length > 1 && C[0] === 0) C.shift();
  return C;
}

// Test
const corrupted = [1, 2, 3, 255, 5, 6, 7, 8, 69, 83, 235, 245];
const nsym = 4;

const synd = calcSyndromes(corrupted, nsym);
console.log('\nSyndromes:', synd);

const errLoc = findErrorLocator(synd, nsym);
console.log('\nError locator:', errLoc);

// Expected: σ(x) = 1 + α^(-8)*x = 1 + 131*x = [1, 131]
// where α^(-8) is the inverse of α^8 = 29
console.log('Expected error locator: [1, 131]');
console.log('α^(-8) =', gfInverse(gfPow(2, 8)));

// Check if it finds the right root
console.log('\nChien search with actual errLoc:');
for (let i = 0; i < 12; i++) {
  const x = gfPow(2, i);
  const val = polyEval(errLoc, x);
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0, error at position ${12-1-i}`);
  }
}
