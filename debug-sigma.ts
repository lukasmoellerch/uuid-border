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
  return gfExp[(gfLog[x] * power) % 255];
}

// σ(x) = 1 + 29*x (low-to-high coefficients: [1, 29])
// Evaluate at α^8 = 29
const alpha8 = gfPow(2, 8);
console.log('α^8 =', alpha8);

const sigma_at_alpha8 = 1 ^ gfMul(29, alpha8);
console.log('σ(α^8) = 1 + 29*α^8 =', sigma_at_alpha8);

// Wait, we want σ(α^8) = 0
// If σ(x) = 1 + c*x and σ(α^8) = 0, then c*α^8 = 1, so c = α^{-8} = α^{247}
console.log('α^{-8} = α^{247} =', gfPow(2, 247));

// So σ(x) should be 1 + α^{-8}*x = 1 + 131*x
// Let's verify:
const sigma2 = 1 ^ gfMul(131, alpha8);
console.log('σ(α^8) = 1 + 131*α^8 =', sigma2);

// OK so the error locator for a single error at polynomial position 8 is:
// σ(x) = 1 + α^{-8}*x = [1, 131] in low-to-high

// But BM gave us [1, 29]. Why?
// Let me check the syndrome relationship...
// For single error e at position j: S_i = e * X^i where X = α^j
// Here j = 8 (polynomial position), so X = α^8 = 29
// S_0 = e * X^0 = e = 251
// S_1 = e * X^1 = 251 * 29 = ?
console.log('\nExpected syndromes for error at poly position 8:');
const e = 251; // error magnitude (255 XOR 4)
const X = gfPow(2, 8); // = 29
for (let i = 0; i < 4; i++) {
  console.log(`S_${i} = ${e} * ${X}^${i} = ${gfMul(e, gfPow(X, i))}`);
}

// Actual syndromes: [251, 176, 108, 8]
// Let me check if they match...
