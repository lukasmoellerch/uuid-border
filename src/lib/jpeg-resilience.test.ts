/**
 * JPEG Resilience Tests
 * 
 * Tests different encoding strategies for surviving JPEG compression:
 * 1. Wider segments (more pixels per segment)
 * 2. Luminance-based grayscale encoding (survives chroma subsampling)
 * 3. Byte interleaving (spreads errors across DCT blocks)
 * 4. Reduced symbol set (4 colors instead of 8)
 */

import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import {
  RGB,
  generateUuid,
  TOTAL_SEGMENTS,
  DEFAULT_RS_CONFIG,
  calculateTotalSegments,
} from './uuid-border';
import {
  rsEncode,
  rsDecode,
  calculateParityBytes,
  uuidToBytes,
  bytesToUuid,
} from './reed-solomon';

// ============================================================================
// JPEG COMPRESSION UTILITIES
// ============================================================================

/**
 * Create a PNG image buffer from pixel data
 */
function createPngBuffer(pixels: RGB[], width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const pixel = pixels[y * width + x] || { r: 255, g: 255, b: 255 };
      png.data[idx] = pixel.r;
      png.data[idx + 1] = pixel.g;
      png.data[idx + 2] = pixel.b;
      png.data[idx + 3] = 255; // Alpha
    }
  }
  
  return PNG.sync.write(png);
}

/**
 * Apply JPEG compression to pixel data
 * Returns the compressed/decompressed pixels
 */
function applyJpegCompression(
  pixels: RGB[],
  width: number,
  height: number,
  quality: number
): RGB[] {
  // Create raw frame data for jpeg-js
  const frameData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const pixel = pixels[i] || { r: 128, g: 128, b: 128 };
    frameData[i * 4] = pixel.r;
    frameData[i * 4 + 1] = pixel.g;
    frameData[i * 4 + 2] = pixel.b;
    frameData[i * 4 + 3] = 255;
  }
  
  // Encode to JPEG
  const rawImageData = {
    data: frameData,
    width,
    height,
  };
  const jpegData = jpeg.encode(rawImageData, quality);
  
  // Decode back
  const decoded = jpeg.decode(jpegData.data, { useTArray: true });
  
  // Extract pixels
  const result: RGB[] = [];
  for (let i = 0; i < width * height; i++) {
    result.push({
      r: decoded.data[i * 4],
      g: decoded.data[i * 4 + 1],
      b: decoded.data[i * 4 + 2],
    });
  }
  
  return result;
}

// ============================================================================
// APPROACH 1: LUMINANCE-BASED GRAYSCALE ENCODING
// ============================================================================

/**
 * Generate 8 grayscale colors with good separation
 * Using luminance-only means we survive JPEG chroma subsampling
 */
function generateGrayscaleColors(baseLevel: number = 100, step: number = 10): RGB[] {
  const colors: RGB[] = [];
  for (let i = 0; i < 8; i++) {
    const level = baseLevel + i * step;
    colors.push({ r: level, g: level, b: level });
  }
  return colors;
}

/**
 * Decode grayscale index from a pixel using luminance
 */
function decodeGrayscaleIndex(
  pixel: RGB,
  baseLevel: number,
  step: number
): number {
  // Use luminance (simple average for grayscale)
  const lum = (pixel.r + pixel.g + pixel.b) / 3;
  
  // Find closest level
  const normalized = (lum - baseLevel) / step;
  const index = Math.round(normalized);
  return Math.max(0, Math.min(7, index));
}

// ============================================================================
// APPROACH 2: BYTE INTERLEAVING
// ============================================================================

/**
 * Interleave bytes to spread errors across JPEG DCT blocks
 * Instead of: byte0, byte1, byte2, byte3, ...
 * Use: byte0, byte4, byte8, ..., byte1, byte5, byte9, ...
 */
function interleaveBytes(data: Uint8Array, stride: number = 4): Uint8Array {
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
 * Deinterleave bytes (reverse of interleaveBytes)
 */
function deinterleaveBytes(data: Uint8Array, stride: number = 4): Uint8Array {
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
// APPROACH 3: REDUCED SYMBOL SET (4 COLORS)
// ============================================================================

/**
 * Generate 4 grayscale colors with maximum separation
 */
function generate4LevelColors(minLevel: number = 80, maxLevel: number = 200): RGB[] {
  const step = (maxLevel - minLevel) / 3;
  const colors: RGB[] = [];
  for (let i = 0; i < 4; i++) {
    const level = Math.round(minLevel + i * step);
    colors.push({ r: level, g: level, b: level });
  }
  return colors;
}

/**
 * Decode 4-level grayscale index
 */
function decode4LevelIndex(
  pixel: RGB,
  minLevel: number,
  maxLevel: number
): number {
  const lum = (pixel.r + pixel.g + pixel.b) / 3;
  const step = (maxLevel - minLevel) / 3;
  const normalized = (lum - minLevel) / step;
  const index = Math.round(normalized);
  return Math.max(0, Math.min(3, index));
}

// ============================================================================
// COMBINED JPEG-RESILIENT ENCODER/DECODER
// ============================================================================

interface JpegResilientConfig {
  // Encoding approach
  useGrayscale: boolean;      // Use luminance-only encoding
  use4Levels: boolean;        // Use 4 colors instead of 8
  useInterleaving: boolean;   // Interleave bytes across DCT blocks
  
  // Color parameters
  grayscaleBase: number;      // Base level for grayscale (default 90)
  grayscaleStep: number;      // Step between levels (default 12)
  
  // 4-level parameters
  minLevel: number;           // Min grayscale (default 70)
  maxLevel: number;           // Max grayscale (default 190)
  
  // Interleaving
  interleaveStride: number;   // Interleave stride (default 4)
}

const DEFAULT_JPEG_CONFIG: JpegResilientConfig = {
  useGrayscale: true,
  use4Levels: false,
  useInterleaving: true,
  grayscaleBase: 90,
  grayscaleStep: 12,
  minLevel: 70,
  maxLevel: 190,
  interleaveStride: 4,
};

/**
 * Marker patterns for JPEG-resilient encoding
 * Using distinctive luminance patterns that survive JPEG
 */
const JPEG_MARKER_START = [1, 1, 1, 0, 1, 2]; // Same pattern, different colors
const JPEG_MARKER_END = [2, 1, 0, 1, 1, 1];

/**
 * Calculate total segments for JPEG-resilient encoding
 */
function calculateJpegSegments(config: JpegResilientConfig): number {
  const nsym = calculateParityBytes(16, 2.0); // 2x redundancy
  const totalBytes = 16 + nsym; // 32 bytes
  
  if (config.use4Levels) {
    // 4 levels = 2 bits per color, so 4 colors per byte
    const dataSegments = totalBytes * 4;
    return 6 + 8 + dataSegments + 6; // markers + index + data + markers = 148
  } else {
    // 8 levels = 3 bits per color, encoded as 2 colors per hex digit (4 per byte)
    const dataSegments = totalBytes * 4;
    return 6 + 8 + dataSegments + 6; // Same: 148
  }
}

/**
 * Encode UUID to color sequence for JPEG resilience
 */
function encodeUuidJpegResilient(
  uuid: string,
  config: JpegResilientConfig = DEFAULT_JPEG_CONFIG
): RGB[] {
  const colors: RGB[] = [];
  
  // Get the color palette
  let palette: RGB[];
  if (config.use4Levels) {
    palette = generate4LevelColors(config.minLevel, config.maxLevel);
  } else if (config.useGrayscale) {
    palette = generateGrayscaleColors(config.grayscaleBase, config.grayscaleStep);
  } else {
    // Fallback to original RGB encoding with larger offset
    palette = generateGrayscaleColors(100, 10);
  }
  
  // Add start marker
  for (const idx of JPEG_MARKER_START) {
    colors.push(palette[Math.min(idx, palette.length - 1)]);
  }
  
  // Add index colors (calibration sequence)
  for (let i = 0; i < (config.use4Levels ? 4 : 8); i++) {
    colors.push(palette[i]);
  }
  // Pad to 8 if using 4 levels
  if (config.use4Levels) {
    for (let i = 0; i < 4; i++) {
      colors.push(palette[i]);
    }
  }
  
  // Encode UUID with RS
  const uuidBytes = uuidToBytes(uuid);
  const nsym = calculateParityBytes(16, 2.0);
  let rsEncoded = rsEncode(uuidBytes, nsym);
  
  // Apply interleaving if enabled
  if (config.useInterleaving) {
    rsEncoded = interleaveBytes(rsEncoded, config.interleaveStride);
  }
  
  // Encode data
  if (config.use4Levels) {
    // 4 levels = 2 bits per symbol, 4 symbols per byte
    for (const byte of rsEncoded) {
      colors.push(palette[(byte >> 6) & 0x3]);
      colors.push(palette[(byte >> 4) & 0x3]);
      colors.push(palette[(byte >> 2) & 0x3]);
      colors.push(palette[byte & 0x3]);
    }
  } else {
    // 8 levels = 3 bits per symbol, but we use the hex-digit encoding
    // to maintain compatibility (2 colors per hex digit, 4 per byte)
    for (const byte of rsEncoded) {
      const highNibble = (byte >> 4) & 0xF;
      const lowNibble = byte & 0xF;
      
      // Each nibble encoded as 2 colors
      colors.push(palette[(highNibble >> 3) & 0x1]); // 0 or 1
      colors.push(palette[highNibble & 0x7]);        // 0-7
      colors.push(palette[(lowNibble >> 3) & 0x1]);
      colors.push(palette[lowNibble & 0x7]);
    }
  }
  
  // Add end marker
  for (const idx of JPEG_MARKER_END) {
    colors.push(palette[Math.min(idx, palette.length - 1)]);
  }
  
  return colors;
}

/**
 * Decode UUID from pixel row with JPEG resilience
 */
function decodeUuidJpegResilient(
  getPixel: (x: number) => RGB,
  width: number,
  config: JpegResilientConfig = DEFAULT_JPEG_CONFIG
): { uuid: string; errorsCorrected: boolean } | null {
  const totalSegments = calculateJpegSegments(config);
  const pixelsPerSegment = width / totalSegments;
  
  if (pixelsPerSegment < 2) return null;
  
  // Sample segment center
  const sampleSegment = (segIdx: number): RGB => {
    const centerX = Math.floor(segIdx * pixelsPerSegment + pixelsPerSegment / 2);
    return getPixel(Math.min(centerX, width - 1));
  };
  
  // Multi-sample with averaging for noise reduction
  const sampleSegmentAvg = (segIdx: number, numSamples: number = 5): RGB => {
    const startX = segIdx * pixelsPerSegment;
    let r = 0, g = 0, b = 0;
    
    for (let i = 1; i <= numSamples; i++) {
      const x = Math.floor(startX + (i / (numSamples + 1)) * pixelsPerSegment);
      const pixel = getPixel(Math.min(x, width - 1));
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
    }
    
    return {
      r: Math.round(r / numSamples),
      g: Math.round(g / numSamples),
      b: Math.round(b / numSamples),
    };
  };
  
  // Read index colors for calibration (segments 6-13)
  const indexColors: RGB[] = [];
  for (let i = 0; i < 8; i++) {
    indexColors.push(sampleSegmentAvg(6 + i));
  }
  
  // Build calibration thresholds from index
  let decodeIndex: (pixel: RGB) => number;
  
  if (config.use4Levels) {
    // Use first 4 index colors to calibrate
    const levels = indexColors.slice(0, 4).map(c => (c.r + c.g + c.b) / 3);
    const sortedLevels = [...levels].sort((a, b) => a - b);
    
    decodeIndex = (pixel: RGB) => {
      const lum = (pixel.r + pixel.g + pixel.b) / 3;
      // Find closest level
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
    // Calibrate from 8 index colors
    const levels = indexColors.map(c => (c.r + c.g + c.b) / 3);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);
    const step = (maxLevel - minLevel) / 7;
    
    decodeIndex = (pixel: RGB) => {
      const lum = (pixel.r + pixel.g + pixel.b) / 3;
      const normalized = (lum - minLevel) / step;
      return Math.max(0, Math.min(7, Math.round(normalized)));
    };
  }
  
  // Read data bytes
  const nsym = calculateParityBytes(16, 2.0);
  const totalBytes = 16 + nsym;
  const dataStartSegment = 14;
  
  const bytes: number[] = [];
  
  if (config.use4Levels) {
    // 4 symbols per byte
    for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
      const baseSegment = dataStartSegment + byteIdx * 4;
      const s0 = decodeIndex(sampleSegmentAvg(baseSegment));
      const s1 = decodeIndex(sampleSegmentAvg(baseSegment + 1));
      const s2 = decodeIndex(sampleSegmentAvg(baseSegment + 2));
      const s3 = decodeIndex(sampleSegmentAvg(baseSegment + 3));
      
      const byte = ((s0 & 0x3) << 6) | ((s1 & 0x3) << 4) | ((s2 & 0x3) << 2) | (s3 & 0x3);
      bytes.push(byte);
    }
  } else {
    // 4 color segments per byte (hex digit encoding)
    for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
      const baseSegment = dataStartSegment + byteIdx * 4;
      const s0 = decodeIndex(sampleSegmentAvg(baseSegment));
      const s1 = decodeIndex(sampleSegmentAvg(baseSegment + 1));
      const s2 = decodeIndex(sampleSegmentAvg(baseSegment + 2));
      const s3 = decodeIndex(sampleSegmentAvg(baseSegment + 3));
      
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
  const originalBytes = config.useInterleaving 
    ? deinterleaveBytes(new Uint8Array(bytes), config.interleaveStride)
    : new Uint8Array(bytes);
  const errorsCorrected = !originalBytes.slice(0, 16).every((b, i) => b === decoded[i]);
  
  return {
    uuid: bytesToUuid(decoded),
    errorsCorrected,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('JPEG Resilience', () => {
  describe('Utility functions', () => {
    it('should interleave and deinterleave bytes correctly', () => {
      const original = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const interleaved = interleaveBytes(original, 4);
      const restored = deinterleaveBytes(interleaved, 4);
      
      expect(Array.from(restored)).toEqual(Array.from(original));
    });
    
    it('should generate grayscale colors with proper separation', () => {
      const colors = generateGrayscaleColors(90, 12);
      expect(colors.length).toBe(8);
      
      // Check separation
      for (let i = 1; i < colors.length; i++) {
        expect(colors[i].r - colors[i-1].r).toBe(12);
      }
    });
    
    it('should generate 4-level colors with good separation', () => {
      const colors = generate4LevelColors(70, 190);
      expect(colors.length).toBe(4);
      
      // Check min/max
      expect(colors[0].r).toBe(70);
      expect(colors[3].r).toBe(190);
      
      // Check even spacing
      const step = colors[1].r - colors[0].r;
      expect(colors[2].r - colors[1].r).toBe(step);
      expect(colors[3].r - colors[2].r).toBe(step);
    });
  });
  
  describe('Grayscale encoding without JPEG', () => {
    it('should encode and decode UUID correctly', () => {
      const uuid = generateUuid();
      const config: JpegResilientConfig = {
        ...DEFAULT_JPEG_CONFIG,
        useGrayscale: true,
        use4Levels: false,
        useInterleaving: false,
      };
      
      const colors = encodeUuidJpegResilient(uuid, config);
      const width = colors.length * 10; // 10 pixels per segment
      
      // Create pixel row
      const pixels: RGB[] = [];
      for (const color of colors) {
        for (let i = 0; i < 10; i++) {
          pixels.push({ ...color });
        }
      }
      
      const result = decodeUuidJpegResilient(
        (x) => pixels[Math.min(x, pixels.length - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
    });
  });
  
  describe('Grayscale encoding with interleaving', () => {
    it('should encode and decode UUID correctly with interleaving', () => {
      const uuid = generateUuid();
      const config: JpegResilientConfig = {
        ...DEFAULT_JPEG_CONFIG,
        useGrayscale: true,
        use4Levels: false,
        useInterleaving: true,
        interleaveStride: 4,
      };
      
      const colors = encodeUuidJpegResilient(uuid, config);
      const width = colors.length * 10;
      
      const pixels: RGB[] = [];
      for (const color of colors) {
        for (let i = 0; i < 10; i++) {
          pixels.push({ ...color });
        }
      }
      
      const result = decodeUuidJpegResilient(
        (x) => pixels[Math.min(x, pixels.length - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
    });
  });
  
  describe('JPEG compression tests', () => {
    const testConfigs: Array<{
      name: string;
      config: JpegResilientConfig;
      minWidth: number;
    }> = [
      {
        name: '8-level grayscale + interleaving',
        config: {
          ...DEFAULT_JPEG_CONFIG,
          useGrayscale: true,
          use4Levels: false,
          useInterleaving: true,
          grayscaleBase: 80,
          grayscaleStep: 14, // Larger step for JPEG
        },
        minWidth: 1480, // 10 pixels per segment
      },
      {
        name: '8-level grayscale, no interleaving',
        config: {
          ...DEFAULT_JPEG_CONFIG,
          useGrayscale: true,
          use4Levels: false,
          useInterleaving: false,
          grayscaleBase: 80,
          grayscaleStep: 14,
        },
        minWidth: 1480,
      },
      {
        name: '4-level grayscale + interleaving (wider separation)',
        config: {
          ...DEFAULT_JPEG_CONFIG,
          useGrayscale: true,
          use4Levels: true,
          useInterleaving: true,
          minLevel: 60,
          maxLevel: 200,
        },
        minWidth: 1480,
      },
    ];
    
    const jpegQualities = [95, 90, 80, 70, 60];
    const widthMultipliers = [10, 12, 16]; // pixels per segment
    
    for (const { name, config, minWidth } of testConfigs) {
      describe(name, () => {
        for (const pixelsPerSeg of widthMultipliers) {
          const width = TOTAL_SEGMENTS * pixelsPerSeg;
          const height = 10; // Border height
          
          for (const quality of jpegQualities) {
            it(`should survive Q${quality} JPEG at ${width}px width (${pixelsPerSeg}px/seg)`, () => {
              const uuid = generateUuid();
              const colors = encodeUuidJpegResilient(uuid, config);
              
              // Create pixel grid (multiple rows for robustness)
              const pixels: RGB[] = [];
              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const segIdx = Math.floor(x / pixelsPerSeg);
                  const color = colors[Math.min(segIdx, colors.length - 1)];
                  pixels.push({ ...color });
                }
              }
              
              // Apply JPEG compression
              const compressed = applyJpegCompression(pixels, width, height, quality);
              
              // Try to decode from middle row (avoid edge artifacts)
              const midRow = Math.floor(height / 2);
              const result = decodeUuidJpegResilient(
                (x) => compressed[midRow * width + Math.min(x, width - 1)],
                width,
                config
              );
              
              // Log for debugging
              if (!result || result.uuid !== uuid) {
                console.log(`FAILED: ${name} Q${quality} ${width}px`);
                console.log(`  Expected: ${uuid}`);
                console.log(`  Got: ${result?.uuid || 'null'}`);
              }
              
              expect(result).not.toBeNull();
              expect(result!.uuid).toBe(uuid);
            });
          }
        }
      });
    }
  });
  
  describe('Summary test: find optimal configuration', () => {
    it('should find configurations that survive various JPEG qualities', () => {
      const results: Array<{
        config: string;
        width: number;
        quality: number;
        success: boolean;
      }> = [];
      
      const configs: Array<[string, JpegResilientConfig]> = [
        ['8-gray+interleave', {
          ...DEFAULT_JPEG_CONFIG,
          useGrayscale: true,
          use4Levels: false,
          useInterleaving: true,
          grayscaleBase: 80,
          grayscaleStep: 14,
        }],
        ['4-gray+interleave', {
          ...DEFAULT_JPEG_CONFIG,
          useGrayscale: true,
          use4Levels: true,
          useInterleaving: true,
          minLevel: 60,
          maxLevel: 200,
        }],
        ['8-gray-only', {
          ...DEFAULT_JPEG_CONFIG,
          useGrayscale: true,
          use4Levels: false,
          useInterleaving: false,
          grayscaleBase: 80,
          grayscaleStep: 14,
        }],
      ];
      
      const widths = [1480, 1776, 2368]; // 10, 12, 16 px/segment
      const qualities = [90, 80, 70, 60, 50];
      
      for (const [name, config] of configs) {
        for (const width of widths) {
          for (const quality of qualities) {
            const uuid = generateUuid();
            const colors = encodeUuidJpegResilient(uuid, config);
            const height = 10;
            const pixelsPerSeg = width / TOTAL_SEGMENTS;
            
            const pixels: RGB[] = [];
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const segIdx = Math.floor(x / pixelsPerSeg);
                const color = colors[Math.min(segIdx, colors.length - 1)];
                pixels.push({ ...color });
              }
            }
            
            const compressed = applyJpegCompression(pixels, width, height, quality);
            const midRow = Math.floor(height / 2);
            
            const result = decodeUuidJpegResilient(
              (x) => compressed[midRow * width + Math.min(x, width - 1)],
              width,
              config
            );
            
            results.push({
              config: name,
              width,
              quality,
              success: result !== null && result.uuid === uuid,
            });
          }
        }
      }
      
      // Print summary
      console.log('\n=== JPEG RESILIENCE SUMMARY ===\n');
      
      for (const [name] of configs) {
        console.log(`${name}:`);
        for (const width of widths) {
          const configResults = results.filter(r => r.config === name && r.width === width);
          const successQualities = configResults
            .filter(r => r.success)
            .map(r => r.quality);
          const failQualities = configResults
            .filter(r => !r.success)
            .map(r => r.quality);
          
          console.log(`  ${width}px: ✅ Q${successQualities.join(', Q') || 'none'} | ❌ Q${failQualities.join(', Q') || 'none'}`);
        }
        console.log();
      }
      
      // At least one config should work at Q70 with 1776px
      const goodResult = results.find(
        r => r.width >= 1776 && r.quality >= 70 && r.success
      );
      expect(goodResult).toBeDefined();
    });
  });
});
