// Rewrite BM to understand the indexing

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

const synd = [251, 176, 108, 8];
const nsym = 4;

// Standard BM that maintains σ = [σ_0, σ_1, ..., σ_L] in low-to-high order
// σ(x) = σ_0 + σ_1*x + σ_2*x^2 + ... with σ_0 = 1
let sigma = [1];      // σ(x) = 1
let B = [1];          // B(x) = 1
let L = 0;            // Number of errors
let b = 1;            // Previous discrepancy
let m = 1;            // Number of iterations since L changed

for (let n = 0; n < nsym; n++) {
  // Discrepancy: d = S_n + Σ_{i=1}^L σ_i * S_{n-i}
  let d = synd[n];
  for (let i = 1; i <= L; i++) {
    d ^= gfMul(sigma[i], synd[n - i]);
  }
  
  console.log(`n=${n}: d=${d}, L=${L}, sigma=[${sigma}], B=[${B}], m=${m}, b=${b}`);
  
  if (d === 0) {
    m++;
  } else if (2 * L <= n) {
    // Connection polynomial update
    const T = [...sigma];
    
    // σ(x) = σ(x) - (d/b) * x^m * B(x)
    // In low-to-high: x^m * B shifts B by m positions
    const scale = gfMul(d, gfInverse(b));
    for (let i = 0; i < B.length; i++) {
      if (sigma.length <= i + m) {
        while (sigma.length <= i + m) sigma.push(0);
      }
      sigma[i + m] ^= gfMul(scale, B[i]);
    }
    
    L = n + 1 - L;
    B = T;
    b = d;
    m = 1;
  } else {
    // σ(x) = σ(x) - (d/b) * x^m * B(x)
    const scale = gfMul(d, gfInverse(b));
    for (let i = 0; i < B.length; i++) {
      if (sigma.length <= i + m) {
        while (sigma.length <= i + m) sigma.push(0);
      }
      sigma[i + m] ^= gfMul(scale, B[i]);
    }
    m++;
  }
}

// Remove trailing zeros
while (sigma.length > 1 && sigma[sigma.length - 1] === 0) sigma.pop();

console.log('\nFinal sigma (low-to-high):', sigma);
console.log('Degree:', sigma.length - 1);

// Now convert to high-to-low for polyEval
const sigmaHTL = [...sigma].reverse();
console.log('Final sigma (high-to-low):', sigmaHTL);

// Chien search
console.log('\nChien search:');
function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

for (let i = 0; i < 12; i++) {
  const val = polyEval(sigmaHTL, gfPow(2, i));
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0, position = ${12 - 1 - i}`);
  }
}
