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
  
  // Read 8 index colors (positions 6-13)
  const indexColors: RGB[] = [];
  for (let i = 0; i < 8; i++) {
    const segmentCenterX = startX + (6 + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
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
    const segmentCenterX = startX + i * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
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
      const segmentCenterX = startX + (baseSegment + s) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
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
    const segmentCenterX = startX + (endMarkerStart + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
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
