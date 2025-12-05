/**
 * Test calling the actual library decode function with debug tracing
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { RGB, decodeFromPixelRow, isEncodedColor } from './src/lib/uuid-border';

// Patch the library to add debug output
const originalDecodeFromPixelRow = decodeFromPixelRow;

const buffer = readFileSync('./90_zoom.png');
const png = PNG.sync.read(buffer);
const { width, height, data } = png;

console.log(`Testing library decode function`);
console.log(`Image dimensions: ${width}x${height}`);

const getPixel = (x: number, y: number): RGB => {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
};

// Test on the known good row
const y = 428;
const getPixelAtY = (x: number) => getPixel(x, y);

// These are the parameters that the direct decode uses
const startX = 90;
const endX = 960;
const approxWidth = endX - startX;

console.log(`\nCalling decodeFromPixelRow with startX=${startX}, width=${approxWidth}`);

// Call the actual library function
const result = decodeFromPixelRow(getPixelAtY, startX, approxWidth);

if (result) {
  console.log(`\n✅ SUCCESS!`);
  console.log(`   UUID: ${result.uuid}`);
  console.log(`   End marker match: ${result.endMarkerMatch}`);
  console.log(`   Errors corrected: ${result.errorsCorrected}`);
} else {
  console.log(`\n❌ decodeFromPixelRow returned null`);
  
  // Let's trace through manually
  console.log(`\nManual trace...`);
  
  // Import the internal functions to trace
  const {
    findEncodingByMarkers,
    TOTAL_SEGMENTS
  } = require('./src/lib/uuid-border');
  
  // Check marker detection
  const markerResult = findEncodingByMarkers(getPixelAtY, startX, endX);
  if (markerResult) {
    console.log(`Marker detection found: startX=${markerResult.startX}, segmentWidth=${markerResult.segmentWidth}`);
  } else {
    console.log(`Marker detection failed`);
  }
}
