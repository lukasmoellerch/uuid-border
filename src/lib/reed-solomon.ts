// Reed-Solomon Error Correction
// Pure TypeScript implementation for GF(2^8)
// Copyright Anysphere Inc.

/**
 * Galois Field GF(2^8) with primitive polynomial 0x11d
 * Polynomials use high-to-low coefficient order: [a_n, a_{n-1}, ..., a_1, a_0]
 * representing a_n*x^n + a_{n-1}*x^{n-1} + ... + a_1*x + a_0
 */

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
  for (let i = 255; i < 512; i++) {
    gfExp[i] = gfExp[i - 255];
  }
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
  if (x === 0) throw new Error('Inverse of zero');
  return gfExp[255 - gfLog[x]];
}

// Polynomial evaluation using Horner's method (high-to-low order)
function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) {
    y = gfMul(y, x) ^ p[i];
  }
  return y;
}

// Polynomial multiplication (high-to-low order)
function polyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

// Polynomial addition (high-to-low order)
function polyAdd(p: number[], q: number[]): number[] {
  const result = new Array(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) {
    result[result.length - p.length + i] ^= p[i];
  }
  for (let i = 0; i < q.length; i++) {
    result[result.length - q.length + i] ^= q[i];
  }
  return result;
}

// Scale polynomial by scalar
function polyScale(p: number[], scale: number): number[] {
  return p.map(c => gfMul(c, scale));
}

/**
 * Generate RS generator polynomial g(x) = (x - α^0)(x - α^1)...(x - α^(nsym-1))
 * Returns in high-to-low order
 */
function rsGeneratorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    // (x - α^i) in high-to-low = [1, α^i] since -α^i = α^i in GF(2^m)
    g = polyMul(g, [1, gfPow(2, i)]);
  }
  return g;
}

/**
 * Encode data with Reed-Solomon (systematic encoding)
 */
export function rsEncode(data: Uint8Array, nsym: number): Uint8Array {
  const gen = rsGeneratorPoly(nsym);
  const result = new Uint8Array(data.length + nsym);
  result.set(data);
  
  // Polynomial division: divide (data * x^nsym) by g(x)
  // The remainder becomes the parity bytes
  for (let i = 0; i < data.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        result[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  
  // Put original data back (systematic encoding)
  result.set(data);
  return result;
}

/**
 * Calculate syndromes S_i = r(α^i) for i = 0..nsym-1
 */
function calcSyndromes(msg: number[], nsym: number): number[] {
  const synd: number[] = [];
  for (let i = 0; i < nsym; i++) {
    synd.push(polyEval(msg, gfPow(2, i)));
  }
  return synd;
}

/**
 * Berlekamp-Massey algorithm to find error locator polynomial
 * Uses syndromes directly (not reversed)
 * Returns σ(x) where σ(X^(-1)) = 0 for each error location X
 */
function findErrorLocator(synd: number[], nsym: number): number[] {
  // Error locator σ(x) - starts as [1]
  let errLoc = [1];
  let oldLoc = [1];
  
  for (let i = 0; i < nsym; i++) {
    // Compute discrepancy
    let delta = synd[i];
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[i - j]);
    }
    
    // Shift oldLoc (multiply by x)
    oldLoc = [...oldLoc, 0];
    
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        // Need to swap
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, gfInverse(delta));
        errLoc = newLoc;
      }
      // errLoc += delta * oldLoc
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  
  // Remove leading zeros
  while (errLoc.length > 1 && errLoc[0] === 0) {
    errLoc.shift();
  }
  
  return errLoc;
}

/**
 * Find error positions using Chien search
 * For each position i, check if σ(α^i) = 0
 */
function findErrorPositions(errLoc: number[], msgLen: number): number[] | null {
  const numErrors = errLoc.length - 1;
  const positions: number[] = [];
  
  for (let i = 0; i < msgLen; i++) {
    if (polyEval(errLoc, gfPow(2, i)) === 0) {
      positions.push(msgLen - 1 - i);
    }
  }
  
  if (positions.length !== numErrors) {
    return null;
  }
  
  return positions;
}

/**
 * Calculate error evaluator polynomial Ω(x) = S(x) * σ(x) mod x^nsym
 */
function calcOmega(synd: number[], errLoc: number[], nsym: number): number[] {
  // S(x) in high-to-low: [S_{nsym-1}, ..., S_1, S_0]
  const syndPoly = [...synd].reverse();
  
  // Multiply and truncate
  let omega = polyMul(syndPoly, errLoc);
  if (omega.length > nsym) {
    omega = omega.slice(omega.length - nsym);
  }
  
  return omega;
}

/**
 * Forney algorithm to compute error magnitudes
 */
function correctErrors(msg: number[], synd: number[], errLoc: number[], positions: number[]): boolean {
  const n = msg.length;
  const nsym = synd.length;
  
  // Calculate Ω(x)
  const omega = calcOmega(synd, errLoc, nsym);
  
  // Calculate σ'(x) - formal derivative
  // For σ(x) = σ_n*x^n + ... + σ_1*x + σ_0
  // σ'(x) = n*σ_n*x^{n-1} + ... + σ_1
  // In characteristic 2, only odd powers survive
  const degree = errLoc.length - 1;
  const errLocDeriv: number[] = [];
  for (let i = 0; i < errLoc.length - 1; i++) {
    const power = degree - i;
    if (power % 2 === 1) {
      errLocDeriv.push(errLoc[i]);
    } else {
      errLocDeriv.push(0);
    }
  }
  // Remove leading zeros
  while (errLocDeriv.length > 1 && errLocDeriv[0] === 0) {
    errLocDeriv.shift();
  }
  if (errLocDeriv.length === 0) errLocDeriv.push(0);
  
  // Correct each error using Forney formula
  for (const pos of positions) {
    // X = α^(n-1-pos) is the error locator value
    const X = gfPow(2, n - 1 - pos);
    const XInv = gfInverse(X);
    
    // e = X * Ω(X^{-1}) / σ'(X^{-1})
    const omegaVal = polyEval(omega, XInv);
    const derivVal = polyEval(errLocDeriv, XInv);
    
    if (derivVal === 0) return false;
    
    const magnitude = gfMul(X, gfDiv(omegaVal, derivVal));
    msg[pos] ^= magnitude;
  }
  
  return true;
}

/**
 * Decode Reed-Solomon encoded message
 */
export function rsDecode(msg: Uint8Array, nsym: number): Uint8Array | null {
  if (msg.length < nsym + 1) return null;
  
  const msgArr = Array.from(msg);
  
  // Calculate syndromes
  const synd = calcSyndromes(msgArr, nsym);
  
  // No errors if all syndromes are zero
  if (synd.every(s => s === 0)) {
    return new Uint8Array(msgArr.slice(0, msgArr.length - nsym));
  }
  
  // Find error locator polynomial
  const errLoc = findErrorLocator(synd, nsym);
  const numErrors = errLoc.length - 1;
  
  // Check for too many errors
  if (numErrors * 2 > nsym) {
    return null;
  }
  
  // Find error positions
  const positions = findErrorPositions(errLoc, msgArr.length);
  if (positions === null) {
    return null;
  }
  
  // Correct errors
  if (!correctErrors(msgArr, synd, errLoc, positions)) {
    return null;
  }
  
  // Verify correction
  const checkSynd = calcSyndromes(msgArr, nsym);
  if (!checkSynd.every(s => s === 0)) {
    return null;
  }
  
  return new Uint8Array(msgArr.slice(0, msgArr.length - nsym));
}

// ========== Public API ==========

export interface RSConfig {
  /** Redundancy factor: 2.0 means 100% overhead (default) */
  redundancyFactor: number;
}

export const DEFAULT_RS_CONFIG: RSConfig = {
  redundancyFactor: 2.0,
};

export function calculateParityBytes(dataLen: number, redundancyFactor: number): number {
  const parityBytes = Math.ceil(dataLen * (redundancyFactor - 1));
  return Math.min(parityBytes, 255 - dataLen);
}

export function rsEncodeUuid(uuidBytes: Uint8Array, config: RSConfig = DEFAULT_RS_CONFIG): Uint8Array {
  if (uuidBytes.length !== 16) {
    throw new Error('UUID must be exactly 16 bytes');
  }
  const nsym = calculateParityBytes(16, config.redundancyFactor);
  return rsEncode(uuidBytes, nsym);
}

export function rsDecodeUuid(encodedBytes: Uint8Array, config: RSConfig = DEFAULT_RS_CONFIG): Uint8Array | null {
  const nsym = calculateParityBytes(16, config.redundancyFactor);
  if (encodedBytes.length !== 16 + nsym) {
    return null;
  }
  return rsDecode(encodedBytes, nsym);
}

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (hex.length !== 32) {
    throw new Error('Invalid UUID format');
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error('UUID must be exactly 16 bytes');
  }
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
