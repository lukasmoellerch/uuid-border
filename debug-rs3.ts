// Detailed debugging of BM algorithm

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

// Syndromes from corrupted message
const synd = [251, 176, 108, 8]; // from earlier test
const nsym = 4;
const msgLen = 12;
const errPosition = 3; // We know the error is at position 3

console.log('=== BM Algorithm Debug ===');
console.log('Syndromes:', synd);

// For single error at position p:
// The error locator should be σ(x) = 1 + X·x where X = α^(n-1-p)
// X = α^(12-1-3) = α^8
const expectedX = gfPow(2, msgLen - 1 - errPosition);
console.log('Expected X (error locator root):', expectedX);
console.log('α^8 =', gfPow(2, 8));

// The error locator polynomial is σ(x) = 1 - X·x (in GF, -X = X)
// So σ(x) = [1, X] in high-to-low degree order
const expectedErrLoc = [1, expectedX];
console.log('Expected error locator [1, X]:', expectedErrLoc);

// Verify: σ(X^-1) should be 0
const XInv = gfInverse(expectedX);
console.log('X^-1 =', XInv);
console.log('σ(X^-1) =', polyEval(expectedErrLoc, XInv));

// Also verify via Chien search
console.log('\n=== Chien Search ===');
for (let i = 0; i < msgLen; i++) {
  const testX = gfPow(2, msgLen - 1 - i);
  const val = polyEval(expectedErrLoc, testX);
  if (val === 0) {
    console.log(`Position ${i}: σ(α^${msgLen-1-i}) = 0 -> ERROR HERE`);
  }
}

// Let's also manually verify the syndrome relation:
// For single error e at position p: S_i = e * X^i where X = α^p
// Here p = 3, so X = α^3
console.log('\n=== Syndrome Verification ===');
const X = gfPow(2, errPosition); // α^3
console.log('Error location X = α^3 =', X);
// From S_0 = e, S_1 = e*X, S_2 = e*X^2, S_3 = e*X^3
// e = S_0 = 251
const e = synd[0];
console.log('Error magnitude e = S_0 =', e);
for (let i = 0; i < 4; i++) {
  const expected = gfMul(e, gfPow(X, i));
  console.log(`S_${i}: expected = ${expected}, actual = ${synd[i]}, match = ${expected === synd[i]}`);
}
