/**
 * JPEG-Resilient UUID Border Encoding
 * 
 * This module provides encoding/decoding methods optimized for surviving
 * JPEG compression. Key techniques:
 * 
 * 1. Grayscale (luminance-only) encoding - survives JPEG chroma subsampling
 * 2. Self-calibrating thresholds from index sequence
 * 3. Byte interleaving to spread errors across JPEG DCT blocks
 * 4. Reed-Solomon error correction for remaining errors
 * 
 * Two encoding modes:
 * - 8-level: Uses 8 grayscale levels, same segment count as original (148)
 * - 4-level: Uses 4 grayscale levels with wider separation, more robust for narrow images
 * 
 * Copyright Anysphere Inc.
 */

import {
  rsEncode,
  rsDecode,
  calculateParityBytes,
  uuidToBytes,
  bytesToUuid,
} from './reed-solomon';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface JpegResilientConfig {
  /**
   * Use 4-level encoding (more robust for narrow images)
   * 4-level: 60 unit separation between levels
   * 8-level: 14 unit separation between levels
   */
  use4Levels: boolean;
  
  /**
   * Enable byte interleaving to spread errors across DCT blocks
   */
  useInterleaving: boolean;
  
  /**
   * For 8-level: base grayscale value (default 80)
   */
  grayscaleBase: number;
  
  /**
   * For 8-level: step between levels (default 14)
   */
  grayscaleStep: number;
  
  /**
   * For 4-level: minimum grayscale value (default 60)
   */
  minLevel: number;
  
  /**
   * For 4-level: maximum grayscale value (default 200)
   */
  maxLevel: number;
  
  /**
   * Interleaving stride (default 4)
   */
  interleaveStride: number;
  
  /**
   * Reed-Solomon redundancy factor (default 2.0 = 100% overhead)
   */
  rsRedundancy: number;
}

export const DEFAULT_CONFIG: JpegResilientConfig = {
  use4Levels: false,
  useInterleaving: true,
  grayscaleBase: 80,
  grayscaleStep: 14,
  minLevel: 60,
  maxLevel: 200,
  interleaveStride: 4,
  rsRedundancy: 2.0,
};

/**
 * Configuration optimized for narrow images (< 800px)
 * Uses 4-level encoding with maximum separation
 */
export const NARROW_IMAGE_CONFIG: JpegResilientConfig = {
  use4Levels: true,
  useInterleaving: true,
  grayscaleBase: 80,
  grayscaleStep: 14,
  minLevel: 60,
  maxLevel: 200,
  interleaveStride: 4,
  rsRedundancy: 2.0,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** Total segments in the encoding */
export const TOTAL_SEGMENTS = 148;

/** Minimum recommended width for JPEG resilience */
export const MIN_JPEG_WIDTH = 592; // 4 pixels per segment, aligned to 8

/** Recommended width for reliable JPEG decoding */
export const RECOMMENDED_JPEG_WIDTH = 1184; // 8 pixels per segment

/** Marker patterns */
const MARKER_START = [1, 1, 1, 0, 1, 2];
const MARKER_END = [2, 1, 0, 1, 1, 1];

// ============================================================================
// BYTE INTERLEAVING
// ============================================================================

/**
 * Interleave bytes to spread errors across JPEG DCT blocks.
 * 
 * Instead of sequential bytes being damaged together when a DCT block
 * is corrupted, this spreads sequential bytes across different regions.
 */
export function interleaveBytes(data: Uint8Array, stride: number = 4): Uint8Array {
  const result = new Uint8Array(data.length);
  const numGroups = Math.ceil(data.length / stride);
  
  let outIdx = 0;
  for (let offset = 0; offset < stride; offset++) {
    for (let group = 0; group < numGroups; group++) {
      const srcIdx = group * stride + offset;
      if (srcIdx < data.length) {
        result[outIdx++] = data[srcIdx];
      }
    }
  }
  return result;
}

/**
 * Reverse interleaving
 */
export function deinterleaveBytes(data: Uint8Array, stride: number = 4): Uint8Array {
  const result = new Uint8Array(data.length);
  const numGroups = Math.ceil(data.length / stride);
  
  let inIdx = 0;
  for (let offset = 0; offset < stride; offset++) {
    for (let group = 0; group < numGroups; group++) {
      const dstIdx = group * stride + offset;
      if (dstIdx < data.length) {
        result[dstIdx] = data[inIdx++];
      }
    }
  }
  return result;
}

// ============================================================================
// PALETTE GENERATION
// ============================================================================

/**
 * Generate 8-level grayscale palette
 */
export function generate8LevelPalette(base: number, step: number): RGB[] {
  return Array.from({ length: 8 }, (_, i) => {
    const level = Math.round(base + i * step);
    return { r: level, g: level, b: level };
  });
}

/**
 * Generate 4-level grayscale palette with maximum separation
 */
export function generate4LevelPalette(minLevel: number, maxLevel: number): RGB[] {
  const step = (maxLevel - minLevel) / 3;
  return Array.from({ length: 4 }, (_, i) => {
    const level = Math.round(minLevel + i * step);
    return { r: level, g: level, b: level };
  });
}

// ============================================================================
// ENCODING
// ============================================================================

/**
 * Encode a UUID into a color sequence optimized for JPEG compression.
 * 
 * @param uuid - The UUID to encode (with or without dashes)
 * @param config - Configuration options
 * @returns Array of RGB colors representing the encoding
 */
export function encodeUuid(
  uuid: string,
  config: JpegResilientConfig = DEFAULT_CONFIG
): RGB[] {
  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
  if (cleanUuid.length !== 32) {
    throw new Error('Invalid UUID format');
  }
  
  // Generate palette
  const palette = config.use4Levels
    ? generate4LevelPalette(config.minLevel, config.maxLevel)
    : generate8LevelPalette(config.grayscaleBase, config.grayscaleStep);
  
  const colors: RGB[] = [];
  
  // Start marker (6 segments)
  for (const idx of MARKER_START) {
    colors.push(palette[idx % palette.length]);
  }
  
  // Index sequence (8 segments) - used for calibration
  if (config.use4Levels) {
    // Repeat 4 levels twice
    for (let i = 0; i < 4; i++) colors.push(palette[i]);
    for (let i = 0; i < 4; i++) colors.push(palette[i]);
  } else {
    for (let i = 0; i < 8; i++) colors.push(palette[i]);
  }
  
  // Encode UUID with Reed-Solomon
  const uuidBytes = uuidToBytes(uuid);
  const nsym = calculateParityBytes(16, config.rsRedundancy);
  let rsEncoded = rsEncode(uuidBytes, nsym);
  
  // Apply interleaving if enabled
  if (config.useInterleaving) {
    rsEncoded = interleaveBytes(rsEncoded, config.interleaveStride);
  }
  
  // Encode data (128 segments for 32 bytes, 4 segments per byte)
  if (config.use4Levels) {
    // 4 levels = 2 bits per symbol, 4 symbols per byte
    for (const byte of rsEncoded) {
      colors.push(palette[(byte >> 6) & 0x3]);
      colors.push(palette[(byte >> 4) & 0x3]);
      colors.push(palette[(byte >> 2) & 0x3]);
      colors.push(palette[byte & 0x3]);
    }
  } else {
    // 8 levels - hex digit encoding (2 symbols per nibble)
    for (const byte of rsEncoded) {
      const highNibble = (byte >> 4) & 0xF;
      const lowNibble = byte & 0xF;
      
      colors.push(palette[(highNibble >> 3) & 0x1]);
      colors.push(palette[highNibble & 0x7]);
      colors.push(palette[(lowNibble >> 3) & 0x1]);
      colors.push(palette[lowNibble & 0x7]);
    }
  }
  
  // End marker (6 segments)
  for (const idx of MARKER_END) {
    colors.push(palette[idx % palette.length]);
  }
  
  return colors;
}

// ============================================================================
// DECODING
// ============================================================================

export interface DecodeResult {
  uuid: string;
  errorsCorrected: boolean;
  confidence: number; // 0-1, based on calibration quality
}

/**
 * Decode a UUID from a pixel row.
 * 
 * @param getPixel - Function to get pixel at x position
 * @param width - Total width of the encoded region
 * @param config - Configuration (must match encoding config)
 * @returns Decoded result or null if decoding fails
 */
export function decodeUuid(
  getPixel: (x: number) => RGB,
  width: number,
  config: JpegResilientConfig = DEFAULT_CONFIG
): DecodeResult | null {
  const pixelsPerSegment = width / TOTAL_SEGMENTS;
  
  if (pixelsPerSegment < 2) {
    return null;
  }
  
  /**
   * Sample a segment with multi-point averaging for noise reduction.
   * Returns average luminance.
   */
  const sampleSegment = (segIdx: number, numSamples: number = 5): number => {
    const startX = segIdx * pixelsPerSegment;
    let sum = 0;
    
    for (let i = 1; i <= numSamples; i++) {
      const frac = i / (numSamples + 1);
      const x = Math.floor(startX + frac * pixelsPerSegment);
      const pixel = getPixel(Math.min(x, width - 1));
      sum += (pixel.r + pixel.g + pixel.b) / 3;
    }
    
    return sum / numSamples;
  };
  
  // Read index colors for calibration (segments 6-13)
  const indexLevels: number[] = [];
  for (let i = 0; i < 8; i++) {
    indexLevels.push(sampleSegment(6 + i));
  }
  
  // Build decoder based on configuration
  let toIndex: (lum: number) => number;
  let confidence: number;
  
  if (config.use4Levels) {
    // Use first 4 index levels for calibration
    const levels = indexLevels.slice(0, 4);
    const sortedLevels = [...levels].sort((a, b) => a - b);
    
    // Calculate confidence based on level separation
    const minGap = Math.min(
      sortedLevels[1] - sortedLevels[0],
      sortedLevels[2] - sortedLevels[1],
      sortedLevels[3] - sortedLevels[2]
    );
    confidence = Math.min(1, minGap / 20); // 20+ gap = full confidence
    
    toIndex = (lum: number) => {
      let closest = 0;
      let minDist = Math.abs(lum - sortedLevels[0]);
      for (let i = 1; i < 4; i++) {
        const dist = Math.abs(lum - sortedLevels[i]);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      return closest;
    };
  } else {
    // 8-level: calibrate using min/max
    const minLevel = Math.min(...indexLevels);
    const maxLevel = Math.max(...indexLevels);
    const step = (maxLevel - minLevel) / 7;
    
    // Confidence based on step size
    confidence = Math.min(1, step / 8); // 8+ step = full confidence
    
    if (step < 3) {
      return null; // Insufficient separation
    }
    
    toIndex = (lum: number) => {
      const normalized = (lum - minLevel) / step;
      return Math.max(0, Math.min(7, Math.round(normalized)));
    };
  }
  
  // Read data bytes
  const nsym = calculateParityBytes(16, config.rsRedundancy);
  const totalBytes = 16 + nsym;
  const dataStartSegment = 14;
  
  const bytes: number[] = [];
  
  if (config.use4Levels) {
    // 4 symbols per byte
    for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
      const base = dataStartSegment + byteIdx * 4;
      const s0 = toIndex(sampleSegment(base));
      const s1 = toIndex(sampleSegment(base + 1));
      const s2 = toIndex(sampleSegment(base + 2));
      const s3 = toIndex(sampleSegment(base + 3));
      
      const byte = ((s0 & 0x3) << 6) | ((s1 & 0x3) << 4) | ((s2 & 0x3) << 2) | (s3 & 0x3);
      bytes.push(byte);
    }
  } else {
    // 4 color segments per byte (hex digit encoding)
    for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
      const base = dataStartSegment + byteIdx * 4;
      const s0 = toIndex(sampleSegment(base));
      const s1 = toIndex(sampleSegment(base + 1));
      const s2 = toIndex(sampleSegment(base + 2));
      const s3 = toIndex(sampleSegment(base + 3));
      
      const highNibble = ((s0 & 1) << 3) | (s1 & 7);
      const lowNibble = ((s2 & 1) << 3) | (s3 & 7);
      bytes.push((highNibble << 4) | lowNibble);
    }
  }
  
  // Deinterleave if needed
  let encodedBytes = new Uint8Array(bytes);
  if (config.useInterleaving) {
    encodedBytes = deinterleaveBytes(encodedBytes, config.interleaveStride);
  }
  
  // Apply RS decoding
  const decoded = rsDecode(encodedBytes, nsym);
  
  if (!decoded) {
    return null;
  }
  
  // Check if errors were corrected
  const originalFirst16 = config.useInterleaving
    ? deinterleaveBytes(new Uint8Array(bytes), config.interleaveStride).slice(0, 16)
    : bytes.slice(0, 16);
  const errorsCorrected = !originalFirst16.every((b, i) => b === decoded[i]);
  
  return {
    uuid: bytesToUuid(decoded),
    errorsCorrected,
    confidence,
  };
}

// ============================================================================
// DRAWING UTILITIES
// ============================================================================

/**
 * Draw encoded border on a canvas context with JPEG-resilient encoding.
 * 
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param uuid - UUID to encode
 * @param borderWidth - Border thickness in pixels
 * @param config - Encoding configuration
 */
export function drawEncodedBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  uuid: string,
  borderWidth: number = 3,
  config: JpegResilientConfig = DEFAULT_CONFIG
): void {
  const colors = encodeUuid(uuid, config);
  const pixelsPerSegment = Math.floor(width / colors.length);
  
  // Draw top border with encoded colors
  let x = 0;
  for (const color of colors) {
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.fillRect(x, 0, pixelsPerSegment, borderWidth);
    x += pixelsPerSegment;
  }
  
  // Fill remaining with last color
  if (x < width) {
    const lastColor = colors[colors.length - 1];
    ctx.fillStyle = `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})`;
    ctx.fillRect(x, 0, width - x, borderWidth);
  }
  
  // Draw other borders with neutral gray
  const neutralGray = 'rgb(133, 133, 133)';
  ctx.fillStyle = neutralGray;
  
  // Right border
  ctx.fillRect(width - borderWidth, borderWidth, borderWidth, height - borderWidth * 2);
  
  // Bottom border
  ctx.fillRect(0, height - borderWidth, width, borderWidth);
  
  // Left border
  ctx.fillRect(0, borderWidth, borderWidth, height - borderWidth * 2);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 + 8) | 0];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  
  return uuid;
}

/**
 * Select optimal configuration based on image width
 */
export function getOptimalConfig(imageWidth: number): JpegResilientConfig {
  if (imageWidth < 700) {
    // Very narrow: use 4-level for maximum robustness
    return NARROW_IMAGE_CONFIG;
  }
  
  // Standard config works well for wider images
  return DEFAULT_CONFIG;
}

/**
 * Recommend image width for reliable JPEG decoding
 */
export function getRecommendedWidth(minWidth: number = 0): number {
  // Round up to nearest multiple of 8 * TOTAL_SEGMENTS for DCT alignment
  const minRequired = Math.max(minWidth, MIN_JPEG_WIDTH);
  const blockAligned = Math.ceil(minRequired / 8) * 8;
  return Math.max(blockAligned, RECOMMENDED_JPEG_WIDTH);
}
