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

function calcSyndromes(msg: number[], nsym: number): number[] {
  const synd = new Array(nsym).fill(0);
  for (let i = 0; i < nsym; i++) {
    synd[i] = polyEval(msg, gfPow(2, i));
  }
  return synd;
}

// Corrupted message with 2 errors at positions 2 and 7
const corrupted = [1, 2, 100, 4, 5, 6, 7, 200, 69, 83, 235, 245];
const nsym = 4;
const msgLen = 12;

// Original: [1, 2, 3, 4, 5, 6, 7, 8, 69, 83, 235, 245]
// Errors: pos 2: 3->100 (e1=103), pos 7: 8->200 (e2=192)

const synd = calcSyndromes(corrupted, nsym);
console.log('Syndromes:', synd);

// Expected error locator for 2 errors:
// σ(x) = (1 + X1*x)(1 + X2*x) where Xi = α^(position_i)
// For positions 2 and 7: polynomial positions are 9 and 4
// X1 = α^9, X2 = α^4
const X1 = gfPow(2, msgLen - 1 - 2); // = α^9
const X2 = gfPow(2, msgLen - 1 - 7); // = α^4
console.log('X1 = α^9 =', X1);
console.log('X2 = α^4 =', X2);

// σ(x) = 1 + (X1+X2)*x + X1*X2*x^2
const sigma1 = X1 ^ X2;
const sigma2 = gfMul(X1, X2);
console.log('Expected σ(x) = 1 +', sigma1, '*x +', sigma2, '*x^2');
console.log('Expected σ coefficients [high-to-low]:', [sigma2, sigma1, 1]);

// Verify roots
const expectedErrLoc = [sigma2, sigma1, 1];
console.log('\nVerify expected σ roots:');
for (let i = 0; i < msgLen; i++) {
  const x = gfPow(2, i);
  const val = polyEval(expectedErrLoc, x);
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0 at array pos ${msgLen - 1 - i}`);
  }
}

// Now run BM
console.log('\n=== Berlekamp-Massey ===');

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
    
    console.log(`n=${n}: d=${d}, L=${L}, C=[${C}], B=[${B}], m=${m}, b=${b}`);
    
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
      console.log(`  -> Updated: L=${L}, C=[${C}], B=[${B}], b=${b}`);
    } else {
      const scale = gfMul(d, gfInverse(b));
      const shiftedB = [...new Array(m).fill(0), ...B];
      while (C.length < shiftedB.length) C.push(0);
      for (let i = 0; i < shiftedB.length; i++) {
        C[C.length - shiftedB.length + i] ^= gfMul(scale, shiftedB[i]);
      }
      m++;
      console.log(`  -> Just updated C: C=[${C}], m=${m}`);
    }
  }
  
  while (C.length > 1 && C[0] === 0) C.shift();
  return C;
}

const errLoc = findErrorLocator(synd, nsym);
console.log('\nFinal error locator:', errLoc);
console.log('Number of errors detected:', errLoc.length - 1);
