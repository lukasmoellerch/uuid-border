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

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  if (a === 0) return 0;
  return gfExp[(gfLog[a] + 255 - gfLog[b]) % 255];
}

function gfPow(x: number, power: number): number {
  if (x === 0) return power === 0 ? 1 : 0;
  return gfExp[(gfLog[x] * power) % 255];
}

function gfInverse(x: number): number {
  return gfExp[255 - gfLog[x]];
}

function polyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

const synd = [167, 15, 176, 233];
const nsym = 4;
const errLoc = [1, 42, 135]; // From BM
const errPos = [7, 2]; // From Chien search
const n = 12;

// Original: [1, 2, 3, 4, 5, 6, 7, 8, ...]
// Corrupted: [1, 2, 100, 4, 5, 6, 7, 200, ...]
// Expected errors: pos 2: 3 XOR 100 = 103, pos 7: 8 XOR 200 = 192

console.log('Syndromes:', synd);
console.log('Error locator:', errLoc);
console.log('Error positions:', errPos);
console.log('Expected error magnitudes: pos2=103, pos7=192');

// Calculate omega
const syndPoly = [...synd].reverse();
console.log('S(x) poly:', syndPoly);

const omegaFull = polyMul(syndPoly, errLoc);
console.log('S(x) * σ(x):', omegaFull);

const omega = omegaFull.slice(omegaFull.length - nsym);
console.log('Ω(x) mod x^4:', omega);

// Calculate derivative
// errLoc = [1, 42, 135] represents 1*x^2 + 42*x + 135
// Actually let me think: what polynomial does it represent?
// In my BM, C is indexed as [σ_0, σ_1, σ_2] = [1, 42, 135]
// σ(x) = σ_0 + σ_1*x + σ_2*x^2 = 1 + 42*x + 135*x^2
// Derivative: σ'(x) = σ_1 + 2*σ_2*x = σ_1 (since 2=0 in GF(2^m))
// So σ'(x) = 42 (constant)
console.log("\nDerivative of σ(x) = 1 + 42*x + 135*x^2:");
console.log("σ'(x) = 42 (constant in GF(2^m))");
const errLocDeriv = [42];

// Correct each error
for (const pos of errPos) {
  const Xl = gfPow(2, n - 1 - pos);
  const XlInv = gfInverse(Xl);
  
  console.log(`\nPosition ${pos}:`);
  console.log(`  X_l = α^${n-1-pos} = ${Xl}`);
  console.log(`  X_l^(-1) = ${XlInv}`);
  
  const omegaVal = polyEval(omega, XlInv);
  const derivVal = polyEval(errLocDeriv, XlInv);
  console.log(`  Ω(X_l^(-1)) = ${omegaVal}`);
  console.log(`  σ'(X_l^(-1)) = ${derivVal}`);
  
  const magnitude = gfMul(Xl, gfDiv(omegaVal, derivVal));
  console.log(`  Magnitude = X_l * Ω/σ' = ${magnitude}`);
}
