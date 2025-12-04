// Compare with working encoding algorithm

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

// High-to-low polynomial multiplication
function polyMulHTL(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

// High-to-low polynomial evaluation (Horner)
function polyEvalHTL(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

// Generator polynomial in HIGH-TO-LOW order
function rsGeneratorPolyHTL(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    g = polyMulHTL(g, [1, gfPow(2, i)]);
  }
  return g;
}

// Original encoding that works (high-to-low convention)
function rsEncodeHTL(data: Uint8Array, nsym: number): Uint8Array {
  const gen = rsGeneratorPolyHTL(nsym);
  const result = new Uint8Array(data.length + nsym);
  result.set(data);
  
  for (let i = 0; i < data.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        result[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  
  result.set(data);
  return result;
}

const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const nsym = 4;

const gen = rsGeneratorPolyHTL(nsym);
console.log('Generator (high-to-low):', gen);

const encoded = rsEncodeHTL(data, nsym);
console.log('Encoded (HTL):', Array.from(encoded));

// Check syndromes with high-to-low eval
console.log('\nSyndromes (HTL):');
for (let i = 0; i < nsym; i++) {
  const alpha_i = gfPow(2, i);
  const s = polyEvalHTL(Array.from(encoded), alpha_i);
  console.log(`S_${i} = ${s}`);
}
