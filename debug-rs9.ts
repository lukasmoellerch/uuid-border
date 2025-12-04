// Full trace of rsDecode

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

function calcSyndromes(msg: number[], nsym: number): number[] {
  const synd = new Array(nsym).fill(0);
  for (let i = 0; i < nsym; i++) {
    synd[i] = polyEval(msg, gfPow(2, i));
  }
  return synd;
}

function findErrorLocator(synd: number[], nsym: number): number[] {
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  
  for (let n = 0; n < nsym; n++) {
    let d = synd[n];
    for (let i = 1; i <= L; i++) {
      d ^= gfMul(C[i], synd[n - i]);
    }
    
    if (d === 0) {
      m++;
    } else if (2 * L <= n) {
      const T = [...C];
      const scale = gfMul(d, gfInverse(b));
      const shiftedB = [...new Array(m).fill(0), ...B];
      while (C.length < shiftedB.length) C.push(0);
      for (let i = 0; i < shiftedB.length; i++) {
        C[C.length - shiftedB.length + i] ^= gfMul(scale, shiftedB[i]);
      }
      L = n + 1 - L;
      B = T;
      b = d;
      m = 1;
    } else {
      const scale = gfMul(d, gfInverse(b));
      const shiftedB = [...new Array(m).fill(0), ...B];
      while (C.length < shiftedB.length) C.push(0);
      for (let i = 0; i < shiftedB.length; i++) {
        C[C.length - shiftedB.length + i] ^= gfMul(scale, shiftedB[i]);
      }
      m++;
    }
  }
  
  while (C.length > 1 && C[0] === 0) C.shift();
  return C;
}

function findErrorPositions(errLoc: number[], msgLen: number): number[] | null {
  const numErrors = errLoc.length - 1;
  const errPos: number[] = [];
  
  for (let i = 0; i < msgLen; i++) {
    const x = gfPow(2, i);
    if (polyEval(errLoc, x) === 0) {
      const pos = msgLen - 1 - i;
      errPos.push(pos);
    }
  }
  
  console.log('  findErrorPositions: numErrors =', numErrors, ', found =', errPos.length);
  console.log('  errPos =', errPos);
  
  if (errPos.length !== numErrors) {
    return null;
  }
  
  return errPos;
}

// Full decode
const corrupted = [1, 2, 3, 255, 5, 6, 7, 8, 69, 83, 235, 245];
const nsym = 4;

console.log('Input:', corrupted);

const synd = calcSyndromes(corrupted, nsym);
console.log('Syndromes:', synd);
console.log('All zero?', synd.every(s => s === 0));

const errLoc = findErrorLocator(synd, nsym);
console.log('Error locator:', errLoc);
console.log('numErrors =', errLoc.length - 1);
console.log('Too many errors?', (errLoc.length - 1) * 2 > nsym);

const errPos = findErrorPositions(errLoc, corrupted.length);
console.log('Error positions:', errPos);

if (errPos) {
  // Compute omega
  const syndPoly = [...synd].reverse();
  const omega = polyMul(syndPoly, errLoc).slice(-nsym);
  console.log('Omega:', omega);
  
  // Compute derivative
  const errLocDeriv: number[] = [];
  for (let i = 0; i < errLoc.length; i++) {
    const power = errLoc.length - 1 - i;
    if (power % 2 === 1) {
      errLocDeriv.push(errLoc[i]);
    } else {
      errLocDeriv.push(0);
    }
  }
  while (errLocDeriv.length > 1 && errLocDeriv[0] === 0) {
    errLocDeriv.shift();
  }
  console.log('Error locator derivative:', errLocDeriv);
  
  // Correct
  const msgArr = [...corrupted];
  for (const pos of errPos) {
    const Xl = gfPow(2, corrupted.length - 1 - pos);
    const XlInv = gfInverse(Xl);
    
    const omegaVal = polyEval(omega, XlInv);
    const derivVal = polyEval(errLocDeriv, XlInv);
    
    console.log(`  pos=${pos}: Xl=${Xl}, XlInv=${XlInv}, omega(XlInv)=${omegaVal}, deriv(XlInv)=${derivVal}`);
    
    if (derivVal === 0) {
      console.log('  FAIL: derivative is zero');
    } else {
      const magnitude = gfMul(Xl, gfDiv(omegaVal, derivVal));
      console.log(`  magnitude = ${magnitude}`);
      msgArr[pos] ^= magnitude;
    }
  }
  
  console.log('Corrected msg:', msgArr);
  
  // Verify
  const checkSynd = calcSyndromes(msgArr, nsym);
  console.log('Check syndromes:', checkSynd);
  console.log('All zero?', checkSynd.every(s => s === 0));
}
