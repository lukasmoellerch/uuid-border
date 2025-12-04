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

function gfInverse(x: number): number {
  return gfExp[255 - gfLog[x]];
}

const synd = [251, 176, 108, 8];

// Manual BM trace
console.log('S =', synd);

// n=0
let d = synd[0]; // 251
console.log('\nn=0: d =', d);
// 2*L=0 <= n=0, so update
// sigma = sigma + (d/b) * x * B = [1] + 251*[0,1] = [1, 251]
let sigma = [1, 251];
let L = 1;
let B = [1];
let b = 251;
console.log('  sigma =', sigma, 'L =', L);

// n=1
d = synd[1];
for (let i = 1; i <= L; i++) {
  d ^= gfMul(sigma[i], synd[1-i]);
}
console.log('\nn=1: d =', d);
console.log('  gfMul(251, 251) =', gfMul(251, 251));
console.log('  176 ^ gfMul(251, 251) =', 176 ^ gfMul(251, 251));

// 2*L=2 > n=1, so don't update L
// sigma = sigma + (d/b) * x^m * B
// m=1 initially after L update, so x^1 * B = [0, 1]
let m = 1;
const scale1 = gfMul(d, gfInverse(b));
console.log('  scale = d/b =', scale1);
sigma = [...sigma]; // [1, 251]
while (sigma.length <= 0 + m) sigma.push(0);
sigma[0 + m] ^= gfMul(scale1, B[0]);
console.log('  sigma =', sigma);
m = 2;

// n=2
d = synd[2];
for (let i = 1; i <= L; i++) {
  d ^= gfMul(sigma[i], synd[2-i]);
}
console.log('\nn=2: d =', d);
console.log('  gfMul(sigma[1], S_1) =', gfMul(sigma[1], synd[1]));
// If d=0, just increment m
console.log('  m =', m+1);

// n=3
m = 3;
d = synd[3];
for (let i = 1; i <= L; i++) {
  d ^= gfMul(sigma[i], synd[3-i]);
}
console.log('\nn=3: d =', d);

console.log('\nFinal sigma:', sigma);

// But we want sigma such that sigma(α^8) = 0
// For that we need sigma = [1, 131]
// Let me verify what sigma(α^8) is with our result
function gfPow(x: number, p: number): number {
  return gfExp[(gfLog[x] * p) % 255];
}

const alpha8 = gfPow(2, 8);
const sigmaAtAlpha8 = sigma[0] ^ gfMul(sigma[1], alpha8);
console.log('\nsigma(α^8) =', sigmaAtAlpha8);
console.log('Expected: 0');

// The issue is that BM solves a different problem!
// BM finds sigma such that: sigma_0*S_n + sigma_1*S_{n-1} + ... + sigma_L*S_{n-L} = 0
// This is the KEY EQUATION
// But we want sigma(X^{-1}) = 0 for error location X

// Actually, the connection between BM output and error locator involves
// the definition of the syndromes and how we use them.
// Let me check the actual relationship...
