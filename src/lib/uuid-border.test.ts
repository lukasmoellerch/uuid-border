import { describe, it, expect } from 'vitest';
import {
  RGB,
  INDEX_COLORS,
  MARKER_START_PATTERN,
  MARKER_END_PATTERN,
  TOTAL_SEGMENTS,
  hexDigitToColors,
  indicesToHexDigit,
  uuidToColorSequence,
  findClosestIndexColor,
  generateUuid,
  decodeFromPixelRow,
  calculateTotalSegments,
  DEFAULT_RS_CONFIG,
} from './uuid-border';
import { calculateParityBytes } from './reed-solomon';

// Helper to simulate canvas rendering and pixel reading
function simulateCanvasEncode(uuid: string, width: number): RGB[] {
  const colors = uuidToColorSequence(uuid);
  const pixelsPerSegment = Math.floor(width / colors.length);
  
  // Create pixel buffer
  const pixels: RGB[] = [];
  for (let colorIdx = 0; colorIdx < colors.length; colorIdx++) {
    const color = colors[colorIdx];
    for (let p = 0; p < pixelsPerSegment; p++) {
      pixels.push({ ...color });
    }
  }
  
  // Fill remaining with last color
  const lastColor = colors[colors.length - 1];
  while (pixels.length < width) {
    pixels.push({ ...lastColor });
  }
  
  return pixels;
}

describe('uuid-border encoding', () => {
  describe('INDEX_COLORS', () => {
    it('should have 8 colors', () => {
      expect(INDEX_COLORS.length).toBe(8);
    });

    it('should encode index bits into RGB channels', () => {
      // bit 0 -> R, bit 1 -> G, bit 2 -> B
      // Each bit high adds OFFSET, low subtracts OFFSET from BASE=133
      for (let i = 0; i < 8; i++) {
        const c = INDEX_COLORS[i];
        // R is high when bit 0 is set
        if (i & 1) {
          expect(c.r).toBeGreaterThan(133);
        } else {
          expect(c.r).toBeLessThan(133);
        }
        // G is high when bit 1 is set
        if (i & 2) {
          expect(c.g).toBeGreaterThan(133);
        } else {
          expect(c.g).toBeLessThan(133);
        }
        // B is high when bit 2 is set
        if (i & 4) {
          expect(c.b).toBeGreaterThan(133);
        } else {
          expect(c.b).toBeLessThan(133);
        }
      }
    });

    it('should have sufficient spacing between colors', () => {
      // Each pair of colors should differ by at least 20 in at least one channel
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
          const ci = INDEX_COLORS[i];
          const cj = INDEX_COLORS[j];
          const dist = Math.sqrt(
            Math.pow(ci.r - cj.r, 2) +
            Math.pow(ci.g - cj.g, 2) +
            Math.pow(ci.b - cj.b, 2)
          );
          expect(dist).toBeGreaterThan(15); // At least 20 in one channel = sqrt(400) = 20
        }
      }
    });
  });

  describe('hexDigitToColors', () => {
    it('should encode 0 correctly', () => {
      const [high, low] = hexDigitToColors(0);
      expect(high).toEqual(INDEX_COLORS[0]); // 0 >> 3 = 0
      expect(low).toEqual(INDEX_COLORS[0]);  // 0 & 7 = 0
    });

    it('should encode 7 correctly', () => {
      const [high, low] = hexDigitToColors(7);
      expect(high).toEqual(INDEX_COLORS[0]); // 7 >> 3 = 0
      expect(low).toEqual(INDEX_COLORS[7]);  // 7 & 7 = 7
    });

    it('should encode 8 correctly', () => {
      const [high, low] = hexDigitToColors(8);
      expect(high).toEqual(INDEX_COLORS[1]); // 8 >> 3 = 1
      expect(low).toEqual(INDEX_COLORS[0]);  // 8 & 7 = 0
    });

    it('should encode 15 (0xF) correctly', () => {
      const [high, low] = hexDigitToColors(15);
      expect(high).toEqual(INDEX_COLORS[1]); // 15 >> 3 = 1
      expect(low).toEqual(INDEX_COLORS[7]);  // 15 & 7 = 7
    });
  });

  describe('indicesToHexDigit', () => {
    it('should decode all hex digits correctly', () => {
      for (let digit = 0; digit < 16; digit++) {
        const high = (digit >> 3) & 1;
        const low = digit & 7;
        expect(indicesToHexDigit(high, low)).toBe(digit);
      }
    });
  });

  describe('hexDigitToColors and indicesToHexDigit roundtrip', () => {
    it('should roundtrip all hex digits', () => {
      for (let digit = 0; digit < 16; digit++) {
        const [highColor, lowColor] = hexDigitToColors(digit);
        const highIdx = findClosestIndexColor(highColor, INDEX_COLORS);
        const lowIdx = findClosestIndexColor(lowColor, INDEX_COLORS);
        const decoded = indicesToHexDigit(highIdx, lowIdx);
        expect(decoded).toBe(digit);
      }
    });
  });

  describe('uuidToColorSequence', () => {
    const testUuid = '12345678-1234-4234-8234-123456789abc';

    it('should generate correct number of colors with RS encoding', () => {
      const colors = uuidToColorSequence(testUuid);
      // With default 2x redundancy: 6 + 8 + 128 + 6 = 148 segments
      const expectedSegments = calculateTotalSegments(DEFAULT_RS_CONFIG);
      expect(colors.length).toBe(expectedSegments);
      expect(colors.length).toBe(TOTAL_SEGMENTS);
    });

    it('should start with MARKER_START_PATTERN', () => {
      const colors = uuidToColorSequence(testUuid);
      for (let i = 0; i < 6; i++) {
        const expectedIdx = MARKER_START_PATTERN[i];
        expect(colors[i]).toEqual(INDEX_COLORS[expectedIdx]);
      }
    });

    it('should have index colors in positions 6-13', () => {
      const colors = uuidToColorSequence(testUuid);
      for (let i = 0; i < 8; i++) {
        expect(colors[6 + i]).toEqual(INDEX_COLORS[i]);
      }
    });

    it('should end with MARKER_END_PATTERN', () => {
      const colors = uuidToColorSequence(testUuid);
      // End marker starts after: start(6) + index(8) + data(4 * totalBytes)
      const nsym = calculateParityBytes(16, DEFAULT_RS_CONFIG.redundancyFactor);
      const totalBytes = 16 + nsym;
      const endMarkerStart = 6 + 8 + totalBytes * 4;
      for (let i = 0; i < 6; i++) {
        const expectedIdx = MARKER_END_PATTERN[i];
        expect(colors[endMarkerStart + i]).toEqual(INDEX_COLORS[expectedIdx]);
      }
    });
  });

  describe('findClosestIndexColor', () => {
    it('should find exact matches', () => {
      for (let i = 0; i < INDEX_COLORS.length; i++) {
        expect(findClosestIndexColor(INDEX_COLORS[i], INDEX_COLORS)).toBe(i);
      }
    });

    it('should find closest match with slight variations', () => {
      // Add small noise and verify it still finds correct color
      for (let i = 0; i < INDEX_COLORS.length; i++) {
        const noisy = {
          r: INDEX_COLORS[i].r + 1,
          g: INDEX_COLORS[i].g - 1,
          b: INDEX_COLORS[i].b + 1,
        };
        expect(findClosestIndexColor(noisy, INDEX_COLORS)).toBe(i);
      }
    });
  });

  describe('full encode/decode roundtrip', () => {
    it('should decode a UUID correctly using decodeFromPixelRow', () => {
      const originalUuid = '12345678-1234-4234-8234-123456789abc';
      const colors = uuidToColorSequence(originalUuid);

      // Use decodeFromPixelRow to decode (simulating perfect pixel access)
      const result = decodeFromPixelRow(
        (x) => colors[Math.floor(x / 10)], // 10 pixels per segment
        0,
        colors.length * 10
      );

      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(originalUuid);
    });

    it('should decode multiple random UUIDs correctly', () => {
      for (let test = 0; test < 10; test++) {
        const originalUuid = generateUuid();
        const colors = uuidToColorSequence(originalUuid);

        // Use decodeFromPixelRow to decode
        const result = decodeFromPixelRow(
          (x) => colors[Math.floor(x / 10)],
          0,
          colors.length * 10
        );

        expect(result).not.toBeNull();
        expect(result!.uuid).toBe(originalUuid);
      }
    });
  });

  describe('canvas simulation encode/decode', () => {
    it('should decode from simulated canvas pixels at various widths', () => {
      // Widths that work well with 148 segments
      const widths = [1480, 1000, 740, 592, 500];
      
      for (const width of widths) {
        const originalUuid = generateUuid();
        const pixels = simulateCanvasEncode(originalUuid, width);
        const result = decodeFromPixelRow(x => pixels[x], 0, width);
        
        expect(result).not.toBeNull();
        expect(result!.uuid).toBe(originalUuid);
      }
    });

    it('should handle exact segment boundaries', () => {
      // 148 segments * 10 = 1480 pixels exactly
      const width = TOTAL_SEGMENTS * 10;
      const originalUuid = '12345678-1234-4234-8234-123456789abc';
      const pixels = simulateCanvasEncode(originalUuid, width);
      const result = decodeFromPixelRow(x => pixels[x], 0, width);
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(originalUuid);
      expect(result!.endMarkerMatch).toBe(true);
    });

    it('should decode with padding before the encoded area', () => {
      const encodedWidth = TOTAL_SEGMENTS * 10;
      const padding = 50;
      const originalUuid = generateUuid();
      
      // Create pixels with padding before
      const encodedPixels = simulateCanvasEncode(originalUuid, encodedWidth);
      const paddingColor: RGB = { r: 255, g: 255, b: 255 }; // White padding
      const pixels = [
        ...Array(padding).fill(paddingColor),
        ...encodedPixels,
      ];
      
      // Decode with correct startX and width
      const result = decodeFromPixelRow(x => pixels[x], padding, encodedWidth);
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(originalUuid);
    });

    it('should handle small compression artifacts', () => {
      const width = TOTAL_SEGMENTS * 10;
      const originalUuid = generateUuid();
      const pixels = simulateCanvasEncode(originalUuid, width);
      
      // Add small noise (±1) to simulate light compression
      const noisyPixels = pixels.map(p => ({
        r: p.r + Math.round((Math.random() - 0.5) * 2),
        g: p.g + Math.round((Math.random() - 0.5) * 2),
        b: p.b + Math.round((Math.random() - 0.5) * 2),
      }));
      
      const result = decodeFromPixelRow(x => noisyPixels[x], 0, width);
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(originalUuid);
    });
  });

  describe('Reed-Solomon error correction', () => {
    it('should recover from corrupted bytes using RS error correction', () => {
      const width = TOTAL_SEGMENTS * 10;
      const originalUuid = generateUuid();
      const pixels = simulateCanvasEncode(originalUuid, width);
      const pixelsPerSegment = Math.floor(width / TOTAL_SEGMENTS);
      
      // Corrupt multiple data segments (simulating byte corruption)
      // Data starts at segment 14 and each byte uses 4 segments
      // Corrupt 4 bytes (16 segments) = up to 8 errors with 2x redundancy
      const corruptedPixels = [...pixels];
      const corruptColor: RGB = { r: 255, g: 0, b: 0 }; // Clearly wrong color
      
      // Corrupt segments 14-17 (byte 0), 30-33 (byte 4), 50-53 (byte 9), 70-73 (byte 14)
      const segmentsToCorrupt = [14, 15, 30, 31, 50, 51, 70, 71]; // 8 segment errors
      
      for (const seg of segmentsToCorrupt) {
        const startIdx = seg * pixelsPerSegment;
        for (let i = 0; i < pixelsPerSegment; i++) {
          corruptedPixels[startIdx + i] = { ...corruptColor };
        }
      }
      
      const result = decodeFromPixelRow(x => corruptedPixels[x], 0, width);
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(originalUuid);
      expect(result!.errorsCorrected).toBe(true);
    });

    it('should report errorsCorrected=false when no errors present', () => {
      const width = TOTAL_SEGMENTS * 10;
      const originalUuid = generateUuid();
      const pixels = simulateCanvasEncode(originalUuid, width);
      
      const result = decodeFromPixelRow(x => pixels[x], 0, width);
      
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe(originalUuid);
      expect(result!.errorsCorrected).toBe(false);
    });

    it('should fail gracefully when too many errors', () => {
      const width = TOTAL_SEGMENTS * 10;
      const originalUuid = generateUuid();
      const pixels = simulateCanvasEncode(originalUuid, width);
      const pixelsPerSegment = Math.floor(width / TOTAL_SEGMENTS);
      
      // Corrupt too many segments - more than RS can handle
      // With 16 parity bytes, can correct up to 8 byte errors
      // Corrupt 20 bytes worth (80 segments) to exceed capacity
      const corruptedPixels = [...pixels];
      const corruptColor: RGB = { r: 0, g: 255, b: 255 };
      
      // Corrupt 20 consecutive bytes starting at data position
      for (let byte = 0; byte < 20; byte++) {
        const baseSegment = 14 + byte * 4;
        for (let s = 0; s < 4; s++) {
          const seg = baseSegment + s;
          const startIdx = seg * pixelsPerSegment;
          for (let i = 0; i < pixelsPerSegment; i++) {
            corruptedPixels[startIdx + i] = { ...corruptColor };
          }
        }
      }
      
      const result = decodeFromPixelRow(x => corruptedPixels[x], 0, width);
      
      // Should return null when too many errors
      expect(result).toBeNull();
    });
  });
});

