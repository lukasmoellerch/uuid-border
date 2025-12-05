import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { join } from 'path';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow } from './uuid-border';

describe('uuid-border integration tests', () => {
  // TODO: This test uses a screenshot created with the old 84-segment format.
  // The new RS-encoded format uses 148 segments and requires a new test screenshot.
  it.skip('should decode UUID from real screenshot with RGB encoding', () => {
    const expectedUuid = '241bbdf7-5d1c-4d0c-b063-fd5865cd02b0';
    
    // Load the test screenshot (with new RGB color encoding)
    const imagePath = join(__dirname, '../../test-fixtures/test-screenshot-rgb.png');
    const imageData = readFileSync(imagePath);
    const png = PNG.sync.read(imageData);
    
    const width = png.width;
    const height = png.height;
    const data = png.data;
    
    const getPixel = (x: number, y: number): RGB => {
      const idx = (y * width + x) * 4;
      return {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      };
    };
    
    // Check if a color looks like a border color (grayish)
    const isBorderColor = (c: RGB): boolean => {
      const avg = (c.r + c.g + c.b) / 3;
      return avg > 100 && avg < 180 && Math.abs(c.g - c.b) < 30;
    };
    
    // Scan for encoded borders
    let foundUuid: string | null = null;
    
    for (let y = 0; y < height && !foundUuid; y++) {
      for (let x = 0; x < width - 100; x++) {
        const pixel = getPixel(x, y);
        
        if (!isBorderColor(pixel)) continue;
        
        // Find border extent
        let borderEnd = x;
        while (borderEnd < width && isBorderColor(getPixel(borderEnd, y))) {
          borderEnd++;
        }
        const borderWidth = borderEnd - x;
        
        if (borderWidth < TOTAL_SEGMENTS) {
          x = borderEnd;
          continue;
        }
        
        // Try different widths and offsets
        const possibleWidths = [
          borderWidth,
          Math.floor(borderWidth * 0.95),
          Math.floor(borderWidth * 0.90),
          Math.floor(borderWidth * 0.85),
          Math.floor(borderWidth * 0.80),
        ].filter(w => w >= TOTAL_SEGMENTS);
        
        const possibleOffsets = [0, 5, 10, 15, 20, 25, 30, 40, 50];
        
        for (const encodedWidth of possibleWidths) {
          if (foundUuid) break;
          for (const offset of possibleOffsets) {
            if (foundUuid) break;
            
            const startX = x + offset;
            if (startX + encodedWidth > width) continue;
            
            const result = decodeFromPixelRow(
              (px) => getPixel(px, y),
              startX,
              encodedWidth
            );
            
            if (result) {
              foundUuid = result.uuid;
              break;
            }
          }
        }
        
        x = borderEnd;
      }
    }
    
    expect(foundUuid).toBe(expectedUuid);
  });
});
