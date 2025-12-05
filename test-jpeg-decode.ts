import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { join } from 'path';
import jpeg from 'jpeg-js';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow, findEncodingByMarkers, uuidToColorSequence, drawEncodedBorder } from './src/lib/uuid-border';

async function testJpeg() {
  // Test with JPEG files from test-artifacts
  const files = [
    '10-jpeg-q95.jpg',
    '11-jpeg-q90.jpg', 
    '12-jpeg-q70.jpg',
    '21-wide-jpeg-q80.jpg'
  ];
  
  for (const file of files) {
    const path = join(__dirname, 'test-artifacts', file);
    try {
      const data = readFileSync(path);
      const decoded = jpeg.decode(data, { useTArray: true });
      console.log(`\n${file}:`);
      console.log(`  Size: ${decoded.width}x${decoded.height}`);
      
      // Get pixel function
      const getPixel = (x: number, y: number = 0): RGB => {
        const idx = (y * decoded.width + x) * 4;
        return {
          r: decoded.data[idx],
          g: decoded.data[idx + 1],
          b: decoded.data[idx + 2],
        };
      };
      
      // Try decoding from top row (y=1 to avoid edge)
      const result = findEncodingByMarkers(
        (x) => getPixel(x, 1),
        0,
        decoded.width
      );
      
      if (result) {
        console.log(`  Found encoding at x=${result.startX}, segmentWidth=${result.segmentWidth}`);
        
        // Try to decode
        const decodeResult = decodeFromPixelRow(
          (x) => getPixel(x, 1),
          result.startX,
          decoded.width - result.startX
        );
        
        if (decodeResult) {
          console.log(`  ✅ Decoded UUID: ${decodeResult.uuid}`);
          console.log(`  Errors corrected: ${decodeResult.errorsCorrected}`);
        } else {
          console.log(`  ❌ Failed to decode`);
        }
      } else {
        console.log(`  ❌ Could not find encoding markers`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

testJpeg();
