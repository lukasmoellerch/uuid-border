/**
 * Tests for JPEG-resilient UUID border encoding
 */

import { describe, it, expect } from 'vitest';
import jpeg from 'jpeg-js';
import {
  RGB,
  encodeUuid,
  decodeUuid,
  generateUuid,
  interleaveBytes,
  deinterleaveBytes,
  generate8LevelPalette,
  generate4LevelPalette,
  getOptimalConfig,
  DEFAULT_CONFIG,
  NARROW_IMAGE_CONFIG,
  TOTAL_SEGMENTS,
  MIN_JPEG_WIDTH,
} from './uuid-border-jpeg';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function applyJpegCompression(
  pixels: RGB[],
  width: number,
  height: number,
  quality: number
): RGB[] {
  const frameData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const pixel = pixels[i] || { r: 128, g: 128, b: 128 };
    frameData[i * 4] = pixel.r;
    frameData[i * 4 + 1] = pixel.g;
    frameData[i * 4 + 2] = pixel.b;
    frameData[i * 4 + 3] = 255;
  }
  
  const jpegData = jpeg.encode({ data: frameData, width, height }, quality);
  const decoded = jpeg.decode(jpegData.data, { useTArray: true });
  
  return Array.from({ length: width * height }, (_, i) => ({
    r: decoded.data[i * 4],
    g: decoded.data[i * 4 + 1],
    b: decoded.data[i * 4 + 2],
  }));
}

function createPixelRow(colors: RGB[], width: number, height: number = 10): RGB[] {
  const pixelsPerSegment = width / colors.length;
  const pixels: RGB[] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const segIdx = Math.floor(x / pixelsPerSegment);
      pixels.push({ ...colors[Math.min(segIdx, colors.length - 1)] });
    }
  }
  
  return pixels;
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('uuid-border-jpeg', () => {
  describe('interleaveBytes', () => {
    it('should interleave and deinterleave correctly', () => {
      const original = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const interleaved = interleaveBytes(original, 4);
      const restored = deinterleaveBytes(interleaved, 4);
      
      expect(Array.from(restored)).toEqual(Array.from(original));
    });
    
    it('should handle non-multiple-of-stride lengths', () => {
      const original = new Uint8Array([0, 1, 2, 3, 4, 5, 6]);
      const interleaved = interleaveBytes(original, 4);
      const restored = deinterleaveBytes(interleaved, 4);
      
      expect(Array.from(restored)).toEqual(Array.from(original));
    });
  });
  
  describe('palette generation', () => {
    it('should generate 8-level palette with correct separation', () => {
      const palette = generate8LevelPalette(80, 14);
      expect(palette.length).toBe(8);
      expect(palette[0].r).toBe(80);
      expect(palette[7].r).toBe(80 + 7 * 14);
      
      // All should be grayscale
      for (const color of palette) {
        expect(color.r).toBe(color.g);
        expect(color.g).toBe(color.b);
      }
    });
    
    it('should generate 4-level palette with correct separation', () => {
      const palette = generate4LevelPalette(60, 200);
      expect(palette.length).toBe(4);
      expect(palette[0].r).toBe(60);
      expect(palette[3].r).toBe(200);
      
      // Roughly even spacing (allow for rounding)
      const step1 = palette[1].r - palette[0].r;
      const step2 = palette[2].r - palette[1].r;
      const step3 = palette[3].r - palette[2].r;
      expect(Math.abs(step1 - step2)).toBeLessThanOrEqual(1);
      expect(Math.abs(step2 - step3)).toBeLessThanOrEqual(1);
    });
  });
  
  describe('encode/decode without compression', () => {
    it('should encode and decode with 8-level config', () => {
      const uuid = generateUuid();
      const config = DEFAULT_CONFIG;
      const colors = encodeUuid(uuid, config);
      
      expect(colors.length).toBe(TOTAL_SEGMENTS);
      
      const width = TOTAL_SEGMENTS * 10;
      const pixels = createPixelRow(colors, width, 1);
      
      const result = decodeUuid(
        (x) => pixels[Math.min(x, pixels.length - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
    });
    
    it('should encode and decode with 4-level config', () => {
      const uuid = generateUuid();
      const config = NARROW_IMAGE_CONFIG;
      const colors = encodeUuid(uuid, config);
      
      expect(colors.length).toBe(TOTAL_SEGMENTS);
      
      const width = TOTAL_SEGMENTS * 10;
      const pixels = createPixelRow(colors, width, 1);
      
      const result = decodeUuid(
        (x) => pixels[Math.min(x, pixels.length - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
    });
    
    it('should handle multiple random UUIDs', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = generateUuid();
        const config = DEFAULT_CONFIG;
        const colors = encodeUuid(uuid, config);
        
        const width = TOTAL_SEGMENTS * 10;
        const pixels = createPixelRow(colors, width, 1);
        
        const result = decodeUuid(
          (x) => pixels[Math.min(x, pixels.length - 1)],
          width,
          config
        );
        
        expect(result).not.toBeNull();
        expect(result!.uuid).toBe(uuid);
      }
    });
  });
  
  describe('JPEG compression resilience', () => {
    const testJpegResilience = (
      name: string,
      config: typeof DEFAULT_CONFIG,
      widths: number[],
      qualities: number[]
    ) => {
      describe(name, () => {
        for (const width of widths) {
          for (const quality of qualities) {
            it(`should survive Q${quality} at ${width}px`, () => {
              const uuid = generateUuid();
              const colors = encodeUuid(uuid, config);
              
              const height = 10;
              const pixels = createPixelRow(colors, width, height);
              
              // Apply JPEG compression
              const compressed = applyJpegCompression(pixels, width, height, quality);
              
              // Decode from middle row
              const midRow = Math.floor(height / 2);
              const result = decodeUuid(
                (x) => compressed[midRow * width + Math.min(x, width - 1)],
                width,
                config
              );
              
              expect(result).not.toBeNull();
              expect(result!.uuid).toBe(uuid);
            });
          }
        }
      });
    };
    
    // Test 8-level config at various widths
    testJpegResilience(
      '8-level grayscale',
      DEFAULT_CONFIG,
      [740, 1184, 1480],
      [90, 70, 50]
    );
    
    // Test 4-level config for narrow images
    testJpegResilience(
      '4-level grayscale (narrow)',
      NARROW_IMAGE_CONFIG,
      [592, 740, 1184],
      [90, 70, 50]
    );
  });
  
  describe('extreme JPEG compression', () => {
    it('should survive Q30 JPEG at 1480px with 8-level', () => {
      const uuid = generateUuid();
      const config = DEFAULT_CONFIG;
      const colors = encodeUuid(uuid, config);
      
      const width = 1480;
      const height = 10;
      const pixels = createPixelRow(colors, width, height);
      
      const compressed = applyJpegCompression(pixels, width, height, 30);
      
      const midRow = Math.floor(height / 2);
      const result = decodeUuid(
        (x) => compressed[midRow * width + Math.min(x, width - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
    });
    
    it('should survive Q50 JPEG at 592px with 4-level', () => {
      const uuid = generateUuid();
      const config = NARROW_IMAGE_CONFIG;
      const colors = encodeUuid(uuid, config);
      
      const width = 592;
      const height = 10;
      const pixels = createPixelRow(colors, width, height);
      
      const compressed = applyJpegCompression(pixels, width, height, 50);
      
      const midRow = Math.floor(height / 2);
      const result = decodeUuid(
        (x) => compressed[midRow * width + Math.min(x, width - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
    });
  });
  
  describe('getOptimalConfig', () => {
    it('should return narrow config for small widths', () => {
      expect(getOptimalConfig(500).use4Levels).toBe(true);
      expect(getOptimalConfig(600).use4Levels).toBe(true);
    });
    
    it('should return default config for larger widths', () => {
      expect(getOptimalConfig(800).use4Levels).toBe(false);
      expect(getOptimalConfig(1200).use4Levels).toBe(false);
    });
  });
  
  describe('error correction', () => {
    it('should correct errors and report errorsCorrected', () => {
      const uuid = generateUuid();
      const config = DEFAULT_CONFIG;
      const colors = encodeUuid(uuid, config);
      
      const width = TOTAL_SEGMENTS * 10;
      const pixels = createPixelRow(colors, width, 1);
      
      // Corrupt some pixels (simulating damage)
      const pixelsPerSegment = width / TOTAL_SEGMENTS;
      const corruptColor = { r: 255, g: 0, b: 0 };
      
      // Corrupt 4 segments
      for (let seg = 20; seg < 24; seg++) {
        for (let i = 0; i < pixelsPerSegment; i++) {
          const x = Math.floor(seg * pixelsPerSegment + i);
          if (x < pixels.length) {
            pixels[x] = { ...corruptColor };
          }
        }
      }
      
      const result = decodeUuid(
        (x) => pixels[Math.min(x, pixels.length - 1)],
        width,
        config
      );
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(uuid);
      expect(result!.errorsCorrected).toBe(true);
    });
  });
});
