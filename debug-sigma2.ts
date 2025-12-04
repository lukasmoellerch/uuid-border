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

function gfPow(x: number, p: number): number {
  return gfExp[(gfLog[x] * p) % 255];
}

function gfInverse(x: number): number {
  return gfExp[255 - gfLog[x]];
}

const sigma = [1, 29]; // low-to-high: 1 + 29*x
const alpha8 = gfPow(2, 8); // = 29
const alpha8Inv = gfInverse(alpha8); // = α^{-8} = α^{247}

console.log('σ = [1, 29] means σ(x) = 1 + 29*x');
console.log('α^8 =', alpha8);
console.log('α^{-8} =', alpha8Inv);

// Evaluate σ(α^{-8})
const sigmaAtAlpha8Inv = sigma[0] ^ gfMul(sigma[1], alpha8Inv);
console.log('σ(α^{-8}) = 1 + 29*α^{-8} =', sigmaAtAlpha8Inv);

// So if σ(X^{-1}) = 0 where X = α^j, we have:
// For our σ(x) = 1 + 29*x:
// σ(X^{-1}) = 1 + 29*X^{-1} = 0
// => X^{-1} = 29^{-1} = ?
const inv29 = gfInverse(29);
console.log('29^{-1} =', inv29);
console.log('α^? = 131');
// So X^{-1} = 131 = α^{247}
// X = α^{255-247} = α^8

// That means the error is at polynomial position 8, which is array position 12-1-8 = 3!
// So the Chien search should find the root at X^{-1} = 131

console.log('\nChien search: looking for σ(Y) = 0');
for (let i = 0; i < 12; i++) {
  const Y = gfPow(2, i);
  const val = sigma[0] ^ gfMul(sigma[1], Y);
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0`);
    // Y = X^{-1}, so X = Y^{-1}
    // X = α^j means polynomial position j
    // array position = n-1-j
    const XInv = gfInverse(Y);
    console.log(`  X^{-1} = α^${i} = ${Y}`);
    console.log(`  X = ${XInv}`);
    // If Y = α^i, then X = α^{-i} = α^{255-i}
    // Position = 255-i modulo something... let me think
    // Actually for the message, position j means X = α^j
    // If Y = α^i and Y = X^{-1}, then X = α^{-i}
    // α^{-i} = α^{255-i} but we use 0-254 as the exponent range
    // So if Y = α^{247}, then X = α^{-247} = α^{255-247} = α^8
    // Position j where X = α^j means j = 8 (polynomial position)
    // Array position = n-1-j = 12-1-8 = 3
  }
}
