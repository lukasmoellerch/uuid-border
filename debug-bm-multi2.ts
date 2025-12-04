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

function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

// BM output: [1, 42, 135] which represents σ(x) = 1 + 42*x + 135*x^2
// My polyEval expects high-to-low, so I need [135, 42, 1]

const errLocBM = [1, 42, 135]; // From BM (low-to-high)
const errLocHighToLow = [...errLocBM].reverse(); // Convert to high-to-low

console.log('errLoc from BM (low-to-high):', errLocBM);
console.log('errLoc high-to-low:', errLocHighToLow);

// Test Chien search with both
const msgLen = 12;
console.log('\nChien search with high-to-low [135, 42, 1]:');
for (let i = 0; i < msgLen; i++) {
  const x = gfPow(2, i);
  const val = polyEval(errLocHighToLow, x);
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0 at array pos ${msgLen - 1 - i}`);
  }
}

console.log('\nChien search with low-to-high [1, 42, 135] (WRONG for my polyEval):');
for (let i = 0; i < msgLen; i++) {
  const x = gfPow(2, i);
  const val = polyEval(errLocBM, x);
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0 at array pos ${msgLen - 1 - i}`);
  }
}
