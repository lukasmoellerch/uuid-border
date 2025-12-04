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

const synd = [251, 176, 108, 8];

// Message: [1, 2, 3, 255, 5, 6, 7, 8, 69, 83, 235, 245]
// As polynomial: m[0]*x^11 + m[1]*x^10 + ... + m[11]*x^0
// Error at array index 3 = coefficient of x^(11-3) = x^8

// For error e at position p (power of x): S_i = e * (α^p)^i = e * α^(p*i)
// Error position p = 8
// Error value e = 255 - 4 = 251 (corrupted from 4 to 255)

const errPos = 8;  // polynomial position (power of x)
const errVal = 251; // error magnitude (255 XOR 4)

console.log('Error at polynomial position:', errPos);
console.log('Error value:', errVal);

// X = α^errPos
const X = gfPow(2, errPos);
console.log('X = α^8 =', X);

// Verify syndromes: S_i = e * X^i
console.log('\nSyndrome verification:');
for (let i = 0; i < 4; i++) {
  const expected = gfMul(errVal, gfPow(X, i));
  console.log(`S_${i}: expected = ${expected}, actual = ${synd[i]}, match = ${expected === synd[i]}`);
}

// So for the error locator:
// σ(x) = 1 - X^(-1) * x  (where X^(-1) = α^(-errPos) = α^(255-errPos))
// The root is X^(-1)
const XInv = gfPow(2, 255 - errPos);
console.log('\nX^(-1) = α^(255-8) = α^247 =', XInv);

// Error locator: σ(x) = 1 + X^(-1)*x = [X^(-1), 1] in standard order [coef of x, coef of 1]
// Or in my high-to-low format: [1, X^(-1)]
const errLoc = [1, XInv];
console.log('Error locator σ(x) = 1 + α^247 * x = [1,', XInv + ']');

// Chien search: find roots by evaluating σ(α^(-i)) for i = 0..n-1
console.log('\nChien search (should find root at inverse error position):');
for (let i = 0; i < 12; i++) {
  // We want σ(α^(-j)) = 0 where α^(-j) = X^(-1), so j = errPos
  const testVal = gfPow(2, 255 - i); // α^(-i) = α^(255-i)
  // σ(testVal) = 1 + X^(-1) * testVal
  const result = 1 ^ gfMul(XInv, testVal);
  if (result === 0) {
    console.log(`  Found root at i=${i}, meaning error at position ${i}`);
  }
}
