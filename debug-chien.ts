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
  if (x === 0) return p === 0 ? 1 : 0;
  return gfExp[(gfLog[x] * p) % 255];
}

const sigma = [1, 29]; // σ(x) = 1 + 29*x
const n = 12; // message length

// Convention 1: σ(α^i) = 0 means error at position n-1-i
console.log('Convention 1: σ(α^i) = 0 means error at position n-1-i');
for (let i = 0; i < n; i++) {
  const Y = gfPow(2, i);
  const val = sigma[0] ^ gfMul(sigma[1], Y);
  if (val === 0) {
    console.log(`  σ(α^${i}) = 0, position = ${n-1-i}`);
  }
}

// Convention 2: σ(α^{-i}) = 0 means error at position i
// α^{-i} = α^{255-i}
console.log('\nConvention 2: σ(α^{-i}) = 0 means error at position i');
for (let i = 0; i < n; i++) {
  const Y = gfPow(2, 255 - i); // α^{-i}
  const val = sigma[0] ^ gfMul(sigma[1], Y);
  if (val === 0) {
    console.log(`  σ(α^{-${i}}) = 0, position = ${i}`);
  }
}

// Let me also try the array position directly
// Error at array position 3 means polynomial position n-1-3 = 8
// X = α^8 is the error locator
// σ should have root at X^{-1} = α^{-8} = α^{247}
console.log('\nDirect check:');
const alpha247 = gfPow(2, 247);
const valAt247 = sigma[0] ^ gfMul(sigma[1], alpha247);
console.log('σ(α^{247}) =', valAt247);

// But wait, what's log(131)?
console.log('log(131) =', gfLog[131]);
// So α^{247} = 131, and σ(131) should be 0
console.log('σ(131) = 1 + 29*131 =', 1 ^ gfMul(29, 131));
