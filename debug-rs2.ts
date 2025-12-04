// Debug the decode process step by step
const gfExp: number[] = new Array(512);
const gfLog: number[] = new Array(256);

// Initialize GF tables
(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    gfExp[i] = gfExp[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return gfExp[gfLog[a] + gfLog[b]];
}

function gfPow(x: number, power: number): number {
  return gfExp[(gfLog[x] * power) % 255];
}

function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) {
    y = gfMul(y, x) ^ p[i];
  }
  return y;
}

// Test data
const corrupted = [1, 2, 3, 255, 5, 6, 7, 8, 69, 83, 235, 245];
const nsym = 4;

// Calculate syndromes
const synd: number[] = [];
for (let i = 0; i < nsym; i++) {
  synd.push(polyEval(corrupted, gfPow(2, i)));
}
console.log('Syndromes:', synd);
console.log('All zero?', synd.every(s => s === 0));

// If syndromes are non-zero, we have errors
// The position of the error is encoded in the syndrome pattern
