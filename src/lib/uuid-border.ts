// UUID Border Encoding/Decoding
// Uses a self-calibrating 8-color index followed by data
// Marker pattern uses index colors: BBBABC (start) and CBABBB (end)
// Now with Reed-Solomon error correction for robustness

import {
  rsEncode,
  rsDecode,
  DEFAULT_RS_CONFIG,
  calculateParityBytes,
  uuidToBytes,
  bytesToUuid,
} from './reed-solomon';
import type { RSConfig } from './reed-solomon';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

// Re-export RS config types for external use
export type { RSConfig };
export { DEFAULT_RS_CONFIG };

// Generate 8 distinct colors for the index (0-7)
// Using all three channels (R, G, B) for better differentiation
// Each bit of the index controls one channel: bit0=R, bit1=G, bit2=B
// Subtle appearance: 24-unit separation (121 vs 145) - visually subtle gray
const BASE = 133;
const OFFSET = 12; // Balanced: visible enough for decoding, subtle enough to look good

function generateIndexColors(): RGB[] {
  const colors: RGB[] = [];
  for (let i = 0; i < 8; i++) {
    colors.push({
      r: BASE + ((i & 1) ? OFFSET : -OFFSET),       // bit 0
      g: BASE + ((i & 2) ? OFFSET : -OFFSET),       // bit 1
      b: BASE + ((i & 4) ? OFFSET : -OFFSET),       // bit 2
    });
  }
  return colors;
  // Results in (with OFFSET=12):
  // 0: (121, 121, 121) - all low
  // 1: (145, 121, 121) - R high
  // 2: (121, 145, 121) - G high
  // 3: (145, 145, 121) - R,G high
  // 4: (121, 121, 145) - B high
  // 5: (145, 121, 145) - R,B high
  // 6: (121, 145, 145) - G,B high
  // 7: (145, 145, 145) - all high
}

export const INDEX_COLORS = generateIndexColors();

// Marker patterns using index colors
// Start: BBBABC = [1,1,1,0,1,2]
// End: CBABBB = [2,1,0,1,1,1]
export const MARKER_START_PATTERN = [1, 1, 1, 0, 1, 2];
export const MARKER_END_PATTERN = [2, 1, 0, 1, 1, 1];

/**
 * Convert a hex digit (0-15) to two index colors
 * First color: digit >> 3 (0-1)
 * Second color: digit & 7 (0-7)
 */
export function hexDigitToColors(digit: number): [RGB, RGB] {
  const high = (digit >> 3) & 1;
  const low = digit & 7;
  return [INDEX_COLORS[high], INDEX_COLORS[low]];
}

/**
 * Convert two color indices back to a hex digit
 */
export function indicesToHexDigit(high: number, low: number): number {
  return ((high & 1) << 3) | (low & 7);
}

/**
 * Generate the color sequence for a UUID with Reed-Solomon error correction
 * Format: [START: BBBABC] [INDEX: 8 colors] [DATA: 2*(16+nsym)*2 colors] [END: CBABBB]
 * With default 2x redundancy: 6 + 8 + 128 + 6 = 148 segments
 */
export function uuidToColorSequence(uuid: string, rsConfig: RSConfig = DEFAULT_RS_CONFIG): RGB[] {
  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
  
  if (cleanUuid.length !== 32) {
    throw new Error('Invalid UUID format');
  }
  
  // Convert UUID to bytes and apply RS encoding
  const uuidBytes = uuidToBytes(uuid);
  const nsym = calculateParityBytes(16, rsConfig.redundancyFactor);
  const rsEncoded = rsEncode(uuidBytes, nsym);
  
  const colors: RGB[] = [];
  
  // Add start marker: BBBABC
  for (const idx of MARKER_START_PATTERN) {
    colors.push(INDEX_COLORS[idx]);
  }
  
  // Add the 8 index colors (0-7)
  for (let i = 0; i < 8; i++) {
    colors.push(INDEX_COLORS[i]);
  }
  
  // Add the RS-encoded data colors (2 colors per byte = 4 colors per hex byte)
  // Each byte is encoded as 2 hex digits, each digit as 2 colors
  for (const byte of rsEncoded) {
    const highNibble = (byte >> 4) & 0xF;
    const lowNibble = byte & 0xF;
    
    const [highHigh, highLow] = hexDigitToColors(highNibble);
    const [lowHigh, lowLow] = hexDigitToColors(lowNibble);
    
    colors.push(highHigh);
    colors.push(highLow);
    colors.push(lowHigh);
    colors.push(lowLow);
  }
  
  // Add end marker: CBABBB
  for (const idx of MARKER_END_PATTERN) {
    colors.push(INDEX_COLORS[idx]);
  }
  
  return colors;
}

/**
 * Calculate total segments for a given RS config
 */
export function calculateTotalSegments(rsConfig: RSConfig = DEFAULT_RS_CONFIG): number {
  const nsym = calculateParityBytes(16, rsConfig.redundancyFactor);
  const totalBytes = 16 + nsym;
  const dataSegments = totalBytes * 4; // 4 color segments per byte
  return 6 + 8 + dataSegments + 6; // markers + index + data + markers
}

/**
 * Find the closest index color to a given color
 * Returns the index (0-7)
 */
export function findClosestIndexColor(color: RGB, indexColors: RGB[]): number {
  let minDist = Infinity;
  let closest = 0;
  
  for (let i = 0; i < indexColors.length; i++) {
    const ic = indexColors[i];
    // Euclidean distance in RGB space
    const dist = Math.sqrt(
      Math.pow(color.r - ic.r, 2) +
      Math.pow(color.g - ic.g, 2) +
      Math.pow(color.b - ic.b, 2)
    );
    
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }
  
  return closest;
}

/**
 * Calibrated index finder that uses adaptive thresholds from detected colors
 * This is more robust to JPEG compression which shifts absolute color values
 * but preserves relative ordering
 */
export interface CalibratedIndex {
  // Per-channel thresholds (midpoint between low and high values)
  rThreshold: number;
  gThreshold: number;
  bThreshold: number;
  // Detected color ranges for validation
  rRange: number;
  gRange: number;
  bRange: number;
}

/**
 * Build a calibrated index from the 8 detected index colors
 * The index colors encode bits in R, G, B channels:
 * - Index 0: all low, Index 7: all high
 * - Bit 0 (R): indices 1,3,5,7 have high R
 * - Bit 1 (G): indices 2,3,6,7 have high G  
 * - Bit 2 (B): indices 4,5,6,7 have high B
 */
export function buildCalibratedIndex(indexColors: RGB[]): CalibratedIndex | null {
  if (indexColors.length !== 8) return null;
  
  // Extract R values from colors where bit 0 is 0 vs 1
  const rLowIndices = [0, 2, 4, 6]; // bit 0 = 0
  const rHighIndices = [1, 3, 5, 7]; // bit 0 = 1
  const rLow = rLowIndices.map(i => indexColors[i].r);
  const rHigh = rHighIndices.map(i => indexColors[i].r);
  
  // Extract G values from colors where bit 1 is 0 vs 1
  const gLowIndices = [0, 1, 4, 5]; // bit 1 = 0
  const gHighIndices = [2, 3, 6, 7]; // bit 1 = 1
  const gLow = gLowIndices.map(i => indexColors[i].g);
  const gHigh = gHighIndices.map(i => indexColors[i].g);
  
  // Extract B values from colors where bit 2 is 0 vs 1
  const bLowIndices = [0, 1, 2, 3]; // bit 2 = 0
  const bHighIndices = [4, 5, 6, 7]; // bit 2 = 1
  const bLow = bLowIndices.map(i => indexColors[i].b);
  const bHigh = bHighIndices.map(i => indexColors[i].b);
  
  // Calculate median of each group
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return (sorted[1] + sorted[2]) / 2; // Middle two of 4 values
  };
  
  const rLowMedian = median(rLow);
  const rHighMedian = median(rHigh);
  const gLowMedian = median(gLow);
  const gHighMedian = median(gHigh);
  const bLowMedian = median(bLow);
  const bHighMedian = median(bHigh);
  
  // Thresholds are midpoints between low and high medians
  const rThreshold = (rLowMedian + rHighMedian) / 2;
  const gThreshold = (gLowMedian + gHighMedian) / 2;
  const bThreshold = (bLowMedian + bHighMedian) / 2;
  
  // Ranges for validation
  const rRange = rHighMedian - rLowMedian;
  const gRange = gHighMedian - gLowMedian;
  const bRange = bHighMedian - bLowMedian;
  
  return { rThreshold, gThreshold, bThreshold, rRange, gRange, bRange };
}

/**
 * Decode a color index using calibrated thresholds
 * More robust to JPEG compression than absolute color matching
 */
export function findIndexCalibrated(color: RGB, calibration: CalibratedIndex): number {
  const rBit = color.r > calibration.rThreshold ? 1 : 0;
  const gBit = color.g > calibration.gThreshold ? 1 : 0;
  const bBit = color.b > calibration.bThreshold ? 1 : 0;
  
  return rBit | (gBit << 1) | (bBit << 2);
}

/**
 * Sample multiple pixels from a segment and average for better noise resistance
 */
export function sampleSegmentColor(
  getPixel: (x: number) => RGB,
  segmentStart: number,
  segmentWidth: number,
  numSamples: number = 3
): RGB {
  if (numSamples <= 1 || segmentWidth < 3) {
    return getPixel(Math.floor(segmentStart + segmentWidth / 2));
  }
  
  let r = 0, g = 0, b = 0;
  const step = segmentWidth / (numSamples + 1);
  
  for (let i = 1; i <= numSamples; i++) {
    const x = Math.floor(segmentStart + i * step);
    const pixel = getPixel(x);
    r += pixel.r;
    g += pixel.g;
    b += pixel.b;
  }
  
  return {
    r: Math.round(r / numSamples),
    g: Math.round(g / numSamples),
    b: Math.round(b / numSamples),
  };
}

/**
 * Check if a color looks like an encoded color (channels near 121 or 145)
 */
export function isEncodedColor(c: RGB, tolerance: number = 15): boolean {
  const LOW = 121;
  const HIGH = 145;
  
  const isLowOrHigh = (val: number) =>
    Math.abs(val - LOW) < tolerance || Math.abs(val - HIGH) < tolerance;
  
  return isLowOrHigh(c.r) && isLowOrHigh(c.g) && isLowOrHigh(c.b);
}

/**
 * Represents a "run" of pixels with similar color characteristics.
 * Like how barcode scanners detect bars by measuring run lengths.
 */
interface ColorRun {
  startX: number;
  endX: number;
  length: number;
  rHigh: boolean;  // Is R channel high (>threshold)?
  gHigh: boolean;  // Is G channel high?
  bHigh: boolean;  // Is B channel high?
}

/**
 * Scan pixels and group them into runs of similar colors.
 * This is the foundation for ratio-based marker detection.
 */
function scanColorRuns(
  getPixel: (x: number) => RGB,
  startX: number,
  endX: number
): ColorRun[] {
  const runs: ColorRun[] = [];
  const MID = 133; // Midpoint between 121 and 145
  
  let currentRun: ColorRun | null = null;
  
  for (let x = startX; x < endX; x++) {
    const pixel = getPixel(x);
    
    // Skip non-encoded colors
    if (!isEncodedColor(pixel, 20)) {
      if (currentRun) {
        currentRun.endX = x;
        currentRun.length = currentRun.endX - currentRun.startX;
        if (currentRun.length > 0) runs.push(currentRun);
        currentRun = null;
      }
      continue;
    }
    
    const rHigh = pixel.r > MID;
    const gHigh = pixel.g > MID;
    const bHigh = pixel.b > MID;
    
    // Check if this pixel continues the current run
    if (currentRun && 
        currentRun.rHigh === rHigh && 
        currentRun.gHigh === gHigh && 
        currentRun.bHigh === bHigh) {
      // Continue the run
      continue;
    }
    
    // End previous run and start new one
    if (currentRun) {
      currentRun.endX = x;
      currentRun.length = currentRun.endX - currentRun.startX;
      if (currentRun.length > 0) runs.push(currentRun);
    }
    
    currentRun = {
      startX: x,
      endX: x + 1,
      length: 1,
      rHigh,
      gHigh,
      bHigh,
    };
  }
  
  // Don't forget the last run
  if (currentRun) {
    currentRun.endX = endX;
    currentRun.length = currentRun.endX - currentRun.startX;
    if (currentRun.length > 0) runs.push(currentRun);
  }
  
  return runs;
}

/**
 * Convert RGB high/low flags to an index (0-7)
 */
function flagsToIndex(rHigh: boolean, gHigh: boolean, bHigh: boolean): number {
  return (rHigh ? 1 : 0) | (gHigh ? 2 : 0) | (bHigh ? 4 : 0);
}

/**
 * Find the start marker using ratio-based detection, similar to how 
 * QR codes and barcodes work. Instead of looking at fixed pixel positions,
 * we analyze runs of similar colors and look for the characteristic
 * pattern [1,1,1,0,1,2] by examining:
 * 
 * 1. The sequence of color indices in consecutive runs
 * 2. The relative lengths (ratios) of the runs - they should all be ~equal
 *    since each segment in the marker is the same width
 * 
 * This approach is scale-invariant and doesn't require any hardcoded offsets.
 * 
 * Returns the start position and calculated segment width.
 */
export function findEncodingStartByRatio(
  getPixel: (x: number) => RGB,
  searchStart: number,
  searchEnd: number
): { startX: number; segmentWidth: number } | null {
  // Get color runs in the search region
  const runs = scanColorRuns(getPixel, searchStart, searchEnd);
  
  if (runs.length < 6) return null;
  
  // The start marker [1,1,1,0,1,2] has this pattern of indices:
  // Index 1 = R high, G low, B low
  // Index 0 = R low, G low, B low  
  // Index 2 = R low, G high, B low
  //
  // So the run pattern is: [1], [1], [1], [0], [1], [2]
  // But consecutive identical indices merge into single runs!
  // [1,1,1] merges to one run, so we get: [1], [0], [1], [2] = 4 runs
  //
  // Actually, let's think more carefully:
  // If segments are wide enough, we get 6 separate runs
  // If anti-aliasing causes merging, we might get fewer
  
  // Look for the pattern by examining sequences of runs
  for (let i = 0; i <= runs.length - 4; i++) {
    // Try to match the marker pattern starting at run i
    // We need to handle both cases:
    // Case 1: Each marker segment is a separate run (6 runs for marker)
    // Case 2: Consecutive same-index segments merged (4 runs: 111, 0, 1, 2)
    
    // First, try the merged case (more common with narrow segments)
    // Pattern: [index 1 (3x width)], [index 0 (1x)], [index 1 (1x)], [index 2 (1x)]
    const r0 = runs[i];
    const r1 = runs[i + 1];
    const r2 = runs[i + 2];
    const r3 = runs[i + 3];
    
    const idx0 = flagsToIndex(r0.rHigh, r0.gHigh, r0.bHigh);
    const idx1 = flagsToIndex(r1.rHigh, r1.gHigh, r1.bHigh);
    const idx2 = flagsToIndex(r2.rHigh, r2.gHigh, r2.bHigh);
    const idx3 = flagsToIndex(r3.rHigh, r3.gHigh, r3.bHigh);
    
    // Check for merged pattern: [1 (3x)], [0], [1], [2]
    if (idx0 === 1 && idx1 === 0 && idx2 === 1 && idx3 === 2) {
      // The first run should be ~3x the width of the others
      // Calculate expected segment width from the runs
      const singleSegmentRuns = [r1, r2, r3];
      const avgSingleWidth = singleSegmentRuns.reduce((sum, r) => sum + r.length, 0) / 3;
      
      // r0 should be approximately 3x avgSingleWidth
      const expectedTripleWidth = avgSingleWidth * 3;
      const tripleRatio = r0.length / expectedTripleWidth;
      
      // Allow 30% tolerance on the ratio
      if (tripleRatio > 0.7 && tripleRatio < 1.3) {
        // Verify all single runs are similar width (within 50% of each other)
        const minSingle = Math.min(r1.length, r2.length, r3.length);
        const maxSingle = Math.max(r1.length, r2.length, r3.length);
        
        if (maxSingle <= minSingle * 2) {
          // Calculate segment width from the pattern
          // Total marker width = 6 segments = r0 + r1 + r2 + r3
          const totalMarkerWidth = r0.length + r1.length + r2.length + r3.length;
          const segmentWidth = totalMarkerWidth / 6;
          
          // The encoding starts at the beginning of the first run
          return {
            startX: r0.startX,
            segmentWidth: Math.round(segmentWidth),
          };
        }
      }
    }
    
    // Also try the non-merged case (6 separate runs)
    if (i + 5 < runs.length) {
      const runs6 = [runs[i], runs[i+1], runs[i+2], runs[i+3], runs[i+4], runs[i+5]];
      const indices = runs6.map(r => flagsToIndex(r.rHigh, r.gHigh, r.bHigh));
      
      // Check for pattern [1,1,1,0,1,2]
      if (indices[0] === 1 && indices[1] === 1 && indices[2] === 1 &&
          indices[3] === 0 && indices[4] === 1 && indices[5] === 2) {
        // All runs should be similar width
        const lengths = runs6.map(r => r.length);
        const avgLen = lengths.reduce((a, b) => a + b, 0) / 6;
        const minLen = Math.min(...lengths);
        const maxLen = Math.max(...lengths);
        
        // Within 50% tolerance
        if (maxLen <= avgLen * 1.5 && minLen >= avgLen * 0.5) {
          return {
            startX: runs6[0].startX,
            segmentWidth: Math.round(avgLen),
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find the END marker using ratio-based detection.
 * This is useful as a fallback when the start marker is damaged.
 * The end marker pattern is [2,1,0,1,1,1] which has a distinctive pattern.
 * 
 * Returns the END position (last pixel of the encoding) and segment width.
 */
export function findEncodingEndByRatio(
  getPixel: (x: number) => RGB,
  searchStart: number,
  searchEnd: number
): { endX: number; segmentWidth: number } | null {
  // Get color runs in the search region
  const runs = scanColorRuns(getPixel, searchStart, searchEnd);
  
  if (runs.length < 4) return null;
  
  // The end marker [2,1,0,1,1,1] has this run pattern:
  // If segments are merged: [index 2 (1x)], [index 1 (1x)], [index 0 (1x)], [index 1 (3x width)]
  // Non-merged: [2], [1], [0], [1], [1], [1] = 6 separate runs
  
  // Search from the end backwards (since end marker is at the end)
  for (let i = runs.length - 4; i >= 0; i--) {
    // Try merged case: [2], [1], [0], [1 (3x)]
    const r0 = runs[i];
    const r1 = runs[i + 1];
    const r2 = runs[i + 2];
    const r3 = runs[i + 3];
    
    const idx0 = flagsToIndex(r0.rHigh, r0.gHigh, r0.bHigh);
    const idx1 = flagsToIndex(r1.rHigh, r1.gHigh, r1.bHigh);
    const idx2 = flagsToIndex(r2.rHigh, r2.gHigh, r2.bHigh);
    const idx3 = flagsToIndex(r3.rHigh, r3.gHigh, r3.bHigh);
    
    // Check for merged pattern: [2], [1], [0], [1 (3x)]
    if (idx0 === 2 && idx1 === 1 && idx2 === 0 && idx3 === 1) {
      const singleSegmentRuns = [r0, r1, r2];
      const avgSingleWidth = singleSegmentRuns.reduce((sum, r) => sum + r.length, 0) / 3;
      
      // r3 should be approximately 3x avgSingleWidth
      const expectedTripleWidth = avgSingleWidth * 3;
      const tripleRatio = r3.length / expectedTripleWidth;
      
      if (tripleRatio > 0.7 && tripleRatio < 1.3) {
        const minSingle = Math.min(r0.length, r1.length, r2.length);
        const maxSingle = Math.max(r0.length, r1.length, r2.length);
        
        if (maxSingle <= minSingle * 2) {
          const totalMarkerWidth = r0.length + r1.length + r2.length + r3.length;
          const segmentWidth = totalMarkerWidth / 6;
          
          // End position is at the end of the last run
          return {
            endX: r3.endX,
            segmentWidth: Math.round(segmentWidth),
          };
        }
      }
    }
    
    // Try non-merged case: [2], [1], [0], [1], [1], [1]
    if (i + 5 < runs.length) {
      const runs6 = [runs[i], runs[i+1], runs[i+2], runs[i+3], runs[i+4], runs[i+5]];
      const indices = runs6.map(r => flagsToIndex(r.rHigh, r.gHigh, r.bHigh));
      
      // Check for pattern [2,1,0,1,1,1]
      if (indices[0] === 2 && indices[1] === 1 && indices[2] === 0 &&
          indices[3] === 1 && indices[4] === 1 && indices[5] === 1) {
        const lengths = runs6.map(r => r.length);
        const avgLen = lengths.reduce((a, b) => a + b, 0) / 6;
        const minLen = Math.min(...lengths);
        const maxLen = Math.max(...lengths);
        
        if (maxLen <= avgLen * 1.5 && minLen >= avgLen * 0.5) {
          return {
            endX: runs6[5].endX,
            segmentWidth: Math.round(avgLen),
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find the INDEX sequence [0,1,2,3,4,5,6,7] which comes right after the start marker.
 * This is a distinctive pattern where all 8 colors appear exactly once in order.
 * 
 * This serves as a fallback when both start and end markers are damaged.
 */
export function findIndexSequence(
  getPixel: (x: number) => RGB,
  searchStart: number,
  searchEnd: number
): { indexStartX: number; segmentWidth: number } | null {
  const runs = scanColorRuns(getPixel, searchStart, searchEnd);
  
  if (runs.length < 8) return null;
  
  // Look for 8 consecutive runs with indices 0,1,2,3,4,5,6,7
  for (let i = 0; i <= runs.length - 8; i++) {
    const candidateRuns = runs.slice(i, i + 8);
    const indices = candidateRuns.map(r => flagsToIndex(r.rHigh, r.gHigh, r.bHigh));
    
    // Check if indices are [0,1,2,3,4,5,6,7]
    let matches = 0;
    for (let j = 0; j < 8; j++) {
      if (indices[j] === j) matches++;
    }
    
    // Allow 1 error (damage might corrupt one color)
    if (matches >= 7) {
      // Verify run widths are similar
      const lengths = candidateRuns.map(r => r.length);
      const avgLen = lengths.reduce((a, b) => a + b, 0) / 8;
      const minLen = Math.min(...lengths);
      const maxLen = Math.max(...lengths);
      
      // Within 60% tolerance (more lenient for damaged images)
      if (maxLen <= avgLen * 1.6 && minLen >= avgLen * 0.4) {
        return {
          indexStartX: candidateRuns[0].startX,
          segmentWidth: Math.round(avgLen),
        };
      }
    }
  }
  
  return null;
}

/**
 * Combined marker detection that tries multiple methods in order:
 * 1. Start marker (preferred - at the beginning)
 * 2. End marker (fallback - at the end, work backwards)
 * 3. Index sequence (last resort - distinctive 8-color pattern)
 * 
 * All methods use ratio-based detection (like QR codes) - no hardcoded offsets.
 */
export function findEncodingByMarkers(
  getPixel: (x: number) => RGB,
  searchStart: number,
  searchEnd: number
): { startX: number; segmentWidth: number } | null {
  // Method 1: Try finding start marker first (preferred)
  const startResult = findEncodingStartByRatio(getPixel, searchStart, searchEnd);
  if (startResult) {
    return startResult;
  }
  
  // Method 2: Try finding end marker and working backwards
  const endResult = findEncodingEndByRatio(getPixel, searchStart, searchEnd);
  if (endResult) {
    const encodingWidth = endResult.segmentWidth * TOTAL_SEGMENTS;
    const startX = endResult.endX - encodingWidth;
    
    if (startX >= searchStart) {
      return {
        startX,
        segmentWidth: endResult.segmentWidth,
      };
    }
  }
  
  // Method 3: Try finding the index sequence [0,1,2,3,4,5,6,7]
  // The index starts 6 segments after the encoding start
  const indexResult = findIndexSequence(getPixel, searchStart, searchEnd);
  if (indexResult) {
    // Index sequence starts at segment 6 (after 6-segment start marker)
    const startX = indexResult.indexStartX - (6 * indexResult.segmentWidth);
    
    if (startX >= searchStart) {
      return {
        startX,
        segmentWidth: indexResult.segmentWidth,
      };
    }
  }
  
  return null;
}

// Keep the old function name as an alias for backward compatibility
export const findEncodingStart = findEncodingStartByRatio;

/**
 * Generate a random UUID v4
 */
export function generateUuid(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // Version 4
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 + 8) | 0]; // Variant bits
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  
  return uuid;
}

// Default total segments with 2x redundancy: 6 + 8 + 128 + 6 = 148
export const TOTAL_SEGMENTS = calculateTotalSegments(DEFAULT_RS_CONFIG);

// Minimum pixels per segment for reliable JPEG decoding
// JPEG uses 8x8 DCT blocks, so segments should be at least 8 pixels wide
// For best JPEG robustness, use MIN_JPEG_ROBUST_WIDTH
export const MIN_SEGMENT_WIDTH = 3; // Minimum for lossless formats
export const MIN_JPEG_SEGMENT_WIDTH = 8; // Minimum for JPEG robustness
export const MIN_JPEG_ROBUST_WIDTH = TOTAL_SEGMENTS * MIN_JPEG_SEGMENT_WIDTH; // 1184 pixels

/**
 * Draw encoded border on a canvas context
 * Layout with RS: START(6) + INDEX(8) + DATA(4*totalBytes) + END(6)
 * With default 2x redundancy: 6 + 8 + 128 + 6 = 148 segments
 * 
 * @param borderRadius - Radius for rounded corners (default 0)
 * @param rsConfig - Reed-Solomon configuration
 * @returns Object with offset information for positioning content inside the border
 */
export function drawEncodedBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  uuid: string,
  borderWidth: number = 3,
  borderRadius: number = 0,
  rsConfig: RSConfig = DEFAULT_RS_CONFIG
): { offsetX: number; offsetY: number } {
  const colors = uuidToColorSequence(uuid, rsConfig);
  const neutralGray = 'rgb(133, 133, 133)';
  
  // The offset needed for content to clear the rounded corners
  const offset = borderRadius > 0 ? borderRadius : 0;
  
  if (borderRadius > 0) {
    // Draw rounded border frame
    
    // First, draw the full rounded rectangle outline in gray
    ctx.fillStyle = neutralGray;
    
    // Draw outer rounded rectangle
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, borderRadius);
    ctx.fill();
    
    // Cut out inner area (creating the border frame)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    const innerRadius = Math.max(0, borderRadius - borderWidth);
    ctx.roundRect(
      borderWidth,
      borderWidth,
      width - borderWidth * 2,
      height - borderWidth * 2,
      innerRadius
    );
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    
    // Now draw encoded colors on the straight portion of the top border
    // The straight portion starts after the corner radius and ends before the other corner
    const straightStartX = borderRadius;
    const straightEndX = width - borderRadius;
    const straightWidth = straightEndX - straightStartX;
    
    if (straightWidth > 0) {
      const pixelsPerSegment = Math.floor(straightWidth / colors.length);
      
      let x = straightStartX;
      for (let colorIdx = 0; colorIdx < colors.length && x < straightEndX; colorIdx++) {
        const color = colors[colorIdx];
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        
        const segmentWidth = pixelsPerSegment;
        ctx.fillRect(x, 0, segmentWidth, borderWidth);
        x += segmentWidth;
      }
      
      // Fill remaining with last color
      if (x < straightEndX) {
        const lastColor = colors[colors.length - 1];
        ctx.fillStyle = `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})`;
        ctx.fillRect(x, 0, straightEndX - x, borderWidth);
      }
    }
  } else {
    // Original rectangular border implementation
    const pixelsPerSegment = Math.floor(width / colors.length);
    
    // Draw top border with encoded colors
    let x = 0;
    for (let colorIdx = 0; colorIdx < colors.length && x < width; colorIdx++) {
      const color = colors[colorIdx];
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      
      const segmentWidth = pixelsPerSegment;
      ctx.fillRect(x, 0, segmentWidth, borderWidth);
      x += segmentWidth;
    }
    
    // Fill remaining top border with last color if needed
    if (x < width) {
      const lastColor = colors[colors.length - 1];
      ctx.fillStyle = `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})`;
      ctx.fillRect(x, 0, width - x, borderWidth);
    }
    
    // Draw other borders with neutral gray
    ctx.fillStyle = neutralGray;
    
    // Right border
    ctx.fillRect(width - borderWidth, borderWidth, borderWidth, height - borderWidth * 2);
    
    // Bottom border
    ctx.fillRect(0, height - borderWidth, width, borderWidth);
    
    // Left border
    ctx.fillRect(0, borderWidth, borderWidth, height - borderWidth * 2);
  }
  
  return { offsetX: offset, offsetY: offset };
}

/**
 * Recalibrate the start position AND segment width by finding the index sequence [0,1,2,3,4,5,6,7].
 * When zoom causes fractional pixel offsets, the initial marker detection may be
 * off by up to a full segment, and the segment width may be fractionally different.
 * The index sequence is a known pattern we can use to precisely determine segment boundaries.
 * 
 * Returns the adjusted startX and refined segment width, or null if calibration fails.
 */
function recalibrateStartAndWidth(
  getPixel: (x: number) => RGB,
  approxStartX: number,
  approxPixelsPerSegment: number
): { startX: number; pixelsPerSegment: number } | null {
  const MID = 133;
  
  // Search range: up to 1.5 segments in either direction for offset
  // Also try segment widths from 0.85x to 1.15x of detected width
  const offsetRange = Math.ceil(approxPixelsPerSegment * 1.5);
  const minWidth = Math.floor(approxPixelsPerSegment * 0.85);
  const maxWidth = Math.ceil(approxPixelsPerSegment * 1.15);
  
  let bestOffset = 0;
  let bestWidth = approxPixelsPerSegment;
  let bestScore = -1;
  
  // Try different segment widths
  for (let width = minWidth; width <= maxWidth; width++) {
    // For each width, try different offsets
    for (let offset = -offsetRange; offset <= offsetRange; offset++) {
      const candidateStart = approxStartX + offset;
      let score = 0;
      
      // Read index colors with this offset and width
      for (let i = 0; i < 8; i++) {
        const segmentCenter = candidateStart + (6 + i) * width + Math.floor(width / 2);
        const pixel = getPixel(segmentCenter);
        
        const rBit = pixel.r > MID ? 1 : 0;
        const gBit = pixel.g > MID ? 1 : 0;
        const bBit = pixel.b > MID ? 1 : 0;
        const detected = rBit | (gBit << 1) | (bBit << 2);
        
        if (detected === i) {
          score += 1;
        } else if (Math.abs(detected - i) === 1) {
          score += 0.5;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestOffset = offset;
        bestWidth = width;
      }
    }
  }
  
  // Require at least 6 out of 8 to match
  if (bestScore >= 6) {
    return {
      startX: approxStartX + bestOffset,
      pixelsPerSegment: bestWidth,
    };
  }
  
  // Fallback: if we got at least 5 matches, still use it
  if (bestScore >= 5) {
    return {
      startX: approxStartX + bestOffset,
      pixelsPerSegment: bestWidth,
    };
  }
  
  return null;
}

/**
 * Decode a UUID from a row of pixels with Reed-Solomon error correction
 * Uses adaptive calibration for JPEG robustness
 * @param getPixel - Function to get pixel color at x position
 * @param startX - Starting x position of the encoded border
 * @param width - Width of the encoded border (not the entire image)
 * @param rsConfig - Reed-Solomon configuration
 * @returns Decoded UUID or null if decoding fails
 */
export function decodeFromPixelRow(
  getPixel: (x: number) => RGB,
  startX: number,
  width: number,
  rsConfig: RSConfig = DEFAULT_RS_CONFIG
): { uuid: string; endMarkerMatch: boolean; errorsCorrected: boolean } | null {
  const totalSegments = calculateTotalSegments(rsConfig);
  const pixelsPerSegment = Math.floor(width / totalSegments);
  
  if (pixelsPerSegment < 1) return null;
  
  // Try to recalibrate start position using the index sequence
  // This helps when zoom causes sub-pixel misalignment
  const calibratedStartX = recalibrateStartPosition(getPixel, startX, pixelsPerSegment);
  const effectiveStartX = calibratedStartX ?? startX;
  
  // Read 8 index colors (positions 6-13)
  const indexColors: RGB[] = [];
  for (let i = 0; i < 8; i++) {
    const segmentCenterX = effectiveStartX + (6 + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
    indexColors.push(getPixel(segmentCenterX));
  }
  
  // Build calibrated index for JPEG-robust decoding
  const calibration = buildCalibratedIndex(indexColors);
  if (!calibration) return null;
  
  // Verify we have sufficient color variation
  // With OFFSET=12, original range is 24. Require at least 10 units in each channel.
  const MIN_RANGE = 10;
  if (calibration.rRange < MIN_RANGE || calibration.gRange < MIN_RANGE || calibration.bRange < MIN_RANGE) {
    return null; // Not enough color variation - probably not the encoded border
  }
  
  // Helper to decode index using calibration
  const decodeIndex = (x: number): number => {
    return findIndexCalibrated(getPixel(x), calibration);
  };
  
  // Verify start marker pattern: [1,1,1,0,1,2]
  const startPattern: number[] = [];
  for (let i = 0; i < 6; i++) {
    const segmentCenterX = effectiveStartX + i * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
    startPattern.push(decodeIndex(segmentCenterX));
  }
  
  // Check start marker - allow some tolerance due to compression
  let startMatchCount = 0;
  for (let i = 0; i < 6; i++) {
    if (startPattern[i] === MARKER_START_PATTERN[i]) startMatchCount++;
  }
  // Require at least 4 of 6 to match (allows for some errors)
  if (startMatchCount < 4) return null;
  
  // Calculate data size
  const nsym = calculateParityBytes(16, rsConfig.redundancyFactor);
  const totalBytes = 16 + nsym;
  const dataStartSegment = 14; // After start marker (6) and index (8)
  
  // Read RS-encoded data (4 color segments per byte)
  const bytes: number[] = [];
  for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
    const baseSegment = dataStartSegment + byteIdx * 4;
    
    // Read 4 segments: highHigh, highLow, lowHigh, lowLow
    const segments: number[] = [];
    for (let s = 0; s < 4; s++) {
      const segmentCenterX = effectiveStartX + (baseSegment + s) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
      segments.push(decodeIndex(segmentCenterX));
    }
    
    // Convert to byte
    const highNibble = indicesToHexDigit(segments[0], segments[1]);
    const lowNibble = indicesToHexDigit(segments[2], segments[3]);
    bytes.push((highNibble << 4) | lowNibble);
  }
  
  // Verify end marker pattern: [2,1,0,1,1,1]
  const endMarkerStart = dataStartSegment + totalBytes * 4;
  const endPattern: number[] = [];
  for (let i = 0; i < 6; i++) {
    const segmentCenterX = effectiveStartX + (endMarkerStart + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
    endPattern.push(decodeIndex(segmentCenterX));
  }
  
  let endMatchCount = 0;
  for (let i = 0; i < 6; i++) {
    if (endPattern[i] === MARKER_END_PATTERN[i]) endMatchCount++;
  }
  const endMarkerMatch = endMatchCount >= 4;
  
  // Apply Reed-Solomon error correction
  const encodedBytes = new Uint8Array(bytes);
  const decodedBytes = rsDecode(encodedBytes, nsym);
  
  if (!decodedBytes) {
    return null; // Too many errors to correct
  }
  
  // Check if any errors were corrected
  const errorsCorrected = !bytes.slice(0, 16).every((b, i) => b === decodedBytes[i]);
  
  // Convert decoded bytes to UUID
  const uuid = bytesToUuid(decodedBytes);
  
  return { uuid, endMarkerMatch, errorsCorrected };
}
