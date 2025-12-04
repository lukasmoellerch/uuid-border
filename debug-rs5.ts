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

const X = gfPow(2, 8); // = 29
const XInv = gfInverse(X);
console.log('X = α^8 =', X);
console.log('X^(-1) =', XInv);
console.log('X * X^(-1) =', gfMul(X, XInv)); // Should be 1

// Error locator σ(x) = (1 - X^(-1) * x)
// But in GF(2^m), subtraction = addition, so σ(x) = 1 + X^(-1) * x
// Roots: σ(y) = 0 when 1 + X^(-1) * y = 0, i.e., y = 1/X^(-1) = X
// So the root should be X itself, not X^(-1)!

console.log('\nEvaluate σ at X (should be 0):');
const sigmaAtX = 1 ^ gfMul(XInv, X);
console.log('σ(X) = 1 + X^(-1)*X =', sigmaAtX);

// For Chien search in array index terms:
// If error is at array index j in msg[0..n-1], polynomial position is n-1-j
// For our case: j=3, n=12, so polynomial position is 12-1-3 = 8
// X = α^8
// Chien search: for i = 0 to n-1, evaluate σ(α^i), if 0 then error at position n-1-i
console.log('\nChien search with α^i:');
for (let i = 0; i < 12; i++) {
  const testVal = gfPow(2, i);
  const result = 1 ^ gfMul(XInv, testVal);
  if (result === 0) {
    const arrayPos = 12 - 1 - i;
    console.log(`  σ(α^${i}) = 0, error at array index ${arrayPos}`);
  }
}
