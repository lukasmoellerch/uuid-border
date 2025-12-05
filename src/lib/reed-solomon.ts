// Reed-Solomon Error Correction
// Pure TypeScript implementation for GF(2^8)
// Copyright Anysphere Inc.

/**
 * Galois Field GF(2^8) with primitive polynomial 0x11d
 */

const gfExp: number[] = new Array(512);
const gfLog: number[] = new Array(256);

// Initialize GF tables
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

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return gfExp[gfLog[x] + gfLog[y]];
}

function gfDiv(x: number, y: number): number {
  if (y === 0) throw new Error('Division by zero');
  if (x === 0) return 0;
  return gfExp[(gfLog[x] + 255 - gfLog[y]) % 255];
}

function gfPow(x: number, power: number): number {
  if (x === 0) return power === 0 ? 1 : 0;
  return gfExp[(gfLog[x] * power) % 255];
}

function gfInverse(x: number): number {
  if (x === 0) throw new Error('Inverse of zero');
  return gfExp[255 - gfLog[x]];
}

/** Polynomial evaluation using Horner's method (high-to-low order) */
function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) {
    y = gfMul(y, x) ^ p[i];
  }
  return y;
}

/** Polynomial multiplication (high-to-low order) */
function polyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

/** Polynomial addition (same-length or padded) */
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

/** Scale polynomial by scalar */
function polyScale(p: number[], scale: number): number[] {
  return p.map(c => gfMul(c, scale));
}

/** Generate RS generator polynomial g(x) = (x - α^0)(x - α^1)...(x - α^(nsym-1)) */
function rsGeneratorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    g = polyMul(g, [1, gfPow(2, i)]);
  }
  return g;
}

/** Encode data with Reed-Solomon (systematic encoding) */
export function rsEncode(data: Uint8Array, nsym: number): Uint8Array {
  const gen = rsGeneratorPoly(nsym);
  const result = new Uint8Array(data.length + nsym);
  result.set(data);
  
  for (let i = 0; i < data.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        result[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  
  result.set(data);
  return result;
}

/** Calculate syndromes S_i = r(α^i) for i = 0..nsym-1 */
function calcSyndromes(msg: number[], nsym: number): number[] {
  const synd: number[] = [0]; // Leading 0 for padding (like reedsolo)
  for (let i = 0; i < nsym; i++) {
    synd.push(polyEval(msg, gfPow(2, i)));
  }
  return synd;
}

/**
 * Berlekamp-Massey algorithm to find error locator polynomial
 * Returns polynomial in low-to-high order: [σ_0, σ_1, ...] where σ_0 = constant term
 */
function findErrorLocator(synd: number[], nsym: number): number[] {
  let errLoc = [1];  // σ(x) = 1
  let oldLoc = [1];  // B(x) = 1
  
  const syndShift = synd.length > nsym ? synd.length - nsym : 0;
  
  for (let i = 0; i < nsym; i++) {
    const K = i + syndShift;
    
    // Compute discrepancy Δ
    let delta = synd[K];
    for (let j = 1; j < errLoc.length; j++) {
      // Index from end of errLoc (low-to-high means last element is highest degree)
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[K - j]);
    }
    
    // Shift old_loc (multiply by x)
    oldLoc = [...oldLoc, 0];
    
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
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
 * errLoc is in low-to-high order from BM, but we need to reverse for evaluation
 */
function findErrorPositions(errLoc: number[], nmess: number): number[] | null {
  const errLocRev = [...errLoc].reverse(); // Convert to high-to-low for polyEval
  const numErrors = errLoc.length - 1;
  const positions: number[] = [];
  
  for (let i = 0; i < nmess; i++) {
    if (polyEval(errLocRev, gfPow(2, i)) === 0) {
      positions.push(nmess - 1 - i);
    }
  }
  
  if (positions.length !== numErrors) {
    return null;
  }
  
  return positions;
}

/** Calculate error evaluator polynomial Ω(x) = S(x) * σ(x) mod x^nsym */
function calcErrorEvaluator(synd: number[], errLoc: number[], nsym: number): number[] {
  // synd includes leading 0 padding, so reverse synd[0:]
  // errLoc is in low-to-high order
  const syndRev = [...synd].reverse();  // high-to-low
  const errLocRev = [...errLoc].reverse();  // high-to-low
  
  let omega = polyMul(syndRev, errLocRev);
  
  // Keep only the nsym+1 lowest degree terms (mod x^{nsym+1})
  // In high-to-low, these are the last nsym+1 elements
  if (omega.length > nsym + 1) {
    omega = omega.slice(omega.length - nsym - 1);
  }
  
  // Return in low-to-high order (reversed back)
  return omega.reverse();
}

/** 
 * Build errata locator polynomial from coefficient positions
 * coef_pos are the polynomial degrees of the errors
 */
function buildErrataLocator(coefPos: number[]): number[] {
  // σ(x) = ∏(1 - α^{coef_pos[i]} * x)
  let errataLoc = [1];  // low-to-high: constant term 1
  for (const cp of coefPos) {
    // Multiply by (1 - α^cp * x) = 1 + α^cp * x (in GF(2))
    // In low-to-high: [1, α^cp]
    const factor = [1, gfPow(2, cp)];
    // Convolve
    const newLoc = new Array(errataLoc.length + 1).fill(0);
    for (let i = 0; i < errataLoc.length; i++) {
      for (let j = 0; j < factor.length; j++) {
        newLoc[i + j] ^= gfMul(errataLoc[i], factor[j]);
      }
    }
    errataLoc = newLoc;
  }
  return errataLoc;
}

/** Forney algorithm to compute error magnitudes and correct errors */
function correctErrors(msg: number[], synd: number[], errLoc: number[], positions: number[]): boolean {
  const nmess = msg.length;
  const nsym = synd.length - 1;
  
  // Convert error positions to coefficient degrees
  const coefPos = positions.map(p => nmess - 1 - p);
  
  // Build errata locator from positions (more reliable than using BM output directly)
  const errataLoc = buildErrataLocator(coefPos);
  
  // Calculate error evaluator polynomial Ω(x)
  const omega = calcErrorEvaluator(synd, errataLoc, nsym);
  const omegaRev = [...omega].reverse();  // high-to-low for polyEval
  
  // Calculate X values: X[i] = α^{coef_pos[i]}
  const X = coefPos.map(cp => gfPow(2, cp));
  
  // Apply Forney algorithm for each error
  for (let i = 0; i < positions.length; i++) {
    const Xi = X[i];
    const XiInv = gfInverse(Xi);
    
    // Compute denominator: ∏(1 - X_j * X_i^{-1}) for j ≠ i
    let errLocPrime = 1;
    for (let j = 0; j < X.length; j++) {
      if (j !== i) {
        const term = 1 ^ gfMul(XiInv, X[j]);  // 1 - X_j * X_i^{-1}
        errLocPrime = gfMul(errLocPrime, term);
      }
    }
    
    if (errLocPrime === 0) return false;
    
    // Compute numerator: y = Ω(X_i^{-1}) * X_i^{1-fcr}
    // With fcr=0: y = Ω(X_i^{-1}) * X_i
    const omegaVal = polyEval(omegaRev, XiInv);
    const y = gfMul(Xi, omegaVal);
    
    // Error magnitude
    const magnitude = gfDiv(y, errLocPrime);
    msg[positions[i]] ^= magnitude;
  }
  
  return true;
}

/** Decode Reed-Solomon encoded message */
export function rsDecode(msg: Uint8Array, nsym: number): Uint8Array | null {
  if (msg.length < nsym + 1) return null;
  
  const msgArr = Array.from(msg);
  
  // Calculate syndromes (with leading 0 padding)
  const synd = calcSyndromes(msgArr, nsym);
  
  // No errors if all syndromes are zero
  if (synd.slice(1).every(s => s === 0)) {
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
  if (!checkSynd.slice(1).every(s => s === 0)) {
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
