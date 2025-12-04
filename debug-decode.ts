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

function polyAdd(p: number[], q: number[]): number[] {
  const result = new Array(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) result[result.length - p.length + i] ^= p[i];
  for (let i = 0; i < q.length; i++) result[result.length - q.length + i] ^= q[i];
  return result;
}

function polyScale(p: number[], scale: number): number[] {
  return p.map(c => gfMul(c, scale));
}

const corrupted = [1, 2, 3, 255, 5, 6, 7, 8, 69, 83, 235, 245];
const nsym = 4;
const msgLen = 12;

// Calculate syndromes
const synd: number[] = [];
for (let i = 0; i < nsym; i++) {
  synd.push(polyEval(corrupted, gfPow(2, i)));
}
console.log('Syndromes:', synd);

// BM algorithm
let errLoc = [1];
let oldLoc = [1];

for (let i = 0; i < nsym; i++) {
  let delta = synd[i];
  for (let j = 1; j < errLoc.length; j++) {
    delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[i - j]);
  }
  
  console.log(`i=${i}: delta=${delta}, errLoc=${errLoc}, oldLoc=${oldLoc}`);
  
  oldLoc = [...oldLoc, 0];
  
  if (delta !== 0) {
    if (oldLoc.length > errLoc.length) {
      const newLoc = polyScale(oldLoc, delta);
      oldLoc = polyScale(errLoc, gfInverse(delta));
      errLoc = newLoc;
    }
    errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
  }
}

while (errLoc.length > 1 && errLoc[0] === 0) errLoc.shift();
console.log('\nError locator:', errLoc);
console.log('Number of errors:', errLoc.length - 1);

// Chien search
console.log('\nChien search:');
for (let i = 0; i < msgLen; i++) {
  const val = polyEval(errLoc, gfPow(2, i));
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0, position = ${msgLen - 1 - i}`);
  }
}

// What should the error locator be?
// Error at position 3, which means polynomial coefficient of x^(n-1-3) = x^8
// X = α^8 = 29
// σ(x) = 1 + X^{-1}*x for single error, root at X
// Wait, let me think about this differently...
// The error locator σ(x) satisfies σ(X^{-1}) = 0 where X = α^(position in polynomial)
// Position 3 in array = position 8 in polynomial (x^8 coefficient)
// So X = α^8
// σ(X^{-1}) = 0, meaning σ(α^{-8}) = σ(α^{247}) = 0
// For single error, σ(x) = 1 + X*x = 1 + α^8 * x = [1, 29] (high-to-low: [29, 1])
// Wait that's wrong direction...
// High-to-low: [coef of x^1, coef of x^0] = [29, 1] means 29*x + 1
// σ(α^{-8}) = 29*α^{-8} + 1
// α^{-8} = α^{247}
// 29*α^{247} + 1 = ?

const alpha8 = gfPow(2, 8); // 29
const alpha247 = gfPow(2, 247);
console.log('\nα^8 =', alpha8);
console.log('α^247 =', alpha247);
console.log('29 * α^247 + 1 =', gfMul(29, alpha247) ^ 1);

// Let's try: σ(x) should have σ(α^i) = 0 for error at msgLen-1-i position
// Error at position 3 means i = msgLen - 1 - 3 = 8
// So σ(α^8) = 0
// For single error at polynomial position 8: σ(x) = (x + α^8) = [1, 29] high-to-low
console.log('\nCheck σ(x) = [1, 29]:');
console.log('σ(α^8) =', polyEval([1, 29], gfPow(2, 8)));
