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

const synd = [251, 176, 108, 8];
const nsym = 4;
const errLoc = [1, 29];
const Xl = 29;
const XlInv = gfInverse(Xl);

console.log('X_l =', Xl);
console.log('X_l^(-1) =', XlInv);

const syndPoly = [...synd].reverse();
const omega = polyMul(syndPoly, errLoc).slice(-nsym);
console.log('Ω(x) =', omega);

// Try: e = X_l * Ω(X_l^(-1)) / σ'(X_l^(-1))
const omegaAtXlInv = polyEval(omega, XlInv);
const derivAtXlInv = polyEval([1], XlInv); // σ' = 1
const mag1 = gfMul(Xl, gfDiv(omegaAtXlInv, derivAtXlInv));
console.log('e = X_l * Ω(X_l^(-1)) / σ\'(X_l^(-1)) =', mag1);

// Try: e = Ω(X_l^(-1)) / σ'(X_l^(-1))  
const mag2 = gfDiv(omegaAtXlInv, derivAtXlInv);
console.log('e = Ω(X_l^(-1)) / σ\'(X_l^(-1)) =', mag2);

// Try: e = X_l^(-1) * Ω(X_l) / σ'(X_l)
const omegaAtXl = polyEval(omega, Xl);
const derivAtXl = polyEval([1], Xl);
const mag3 = gfMul(XlInv, gfDiv(omegaAtXl, derivAtXl));
console.log('e = X_l^(-1) * Ω(X_l) / σ\'(X_l) =', mag3);

console.log('\nExpected:', 251);
