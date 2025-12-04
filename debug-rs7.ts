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

// Test case
const synd = [251, 176, 108, 8];
const nsym = 4;
const errLoc = [1, 29]; // From BM
const Xl = 29; // The root of σ, also α^8
const errPos = 3; // Array position

console.log('=== Forney Algorithm Debug ===');
console.log('Syndromes:', synd);
console.log('Error locator σ(x) = [1, 29] = x + 29');
console.log('X_l = α^8 =', Xl);

// S(x) = S_0 + S_1*x + S_2*x^2 + S_3*x^3
// In high-to-low: [S_3, S_2, S_1, S_0] = [8, 108, 176, 251]
const syndPoly = [...synd].reverse();
console.log('S(x) poly (high-to-low):', syndPoly);

// σ(x) = [1, 29] in high-to-low = x + 29
// Ω(x) = S(x) * σ(x) mod x^4
const product = polyMul(syndPoly, errLoc);
console.log('S(x) * σ(x) =', product);

// mod x^4: keep last 4 coefficients (lowest degree terms)
const omega = product.slice(product.length - nsym);
console.log('Ω(x) = S(x)*σ(x) mod x^4 =', omega);

// Evaluate Ω(X_l)
const omegaVal = polyEval(omega, Xl);
console.log('Ω(X_l) =', omegaVal);

// σ'(x): derivative of σ(x) = x + 29
// σ'(x) = 1 (constant polynomial)
// In high-to-low format: [1]
console.log("σ'(x) = [1]");
const derivVal = polyEval([1], Xl);
console.log("σ'(X_l) =", derivVal);

// Error magnitude = Ω(X_l) / σ'(X_l)
const magnitude = gfDiv(omegaVal, derivVal);
console.log('Error magnitude = Ω(X_l) / σ\'(X_l) =', magnitude);

// Expected error magnitude: corrupted[3] XOR original[3] = 255 XOR 4 = 251
console.log('Expected error magnitude:', 255 ^ 4);
