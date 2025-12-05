/**
 * Test direct decoding using the new barcode-style calibration
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { RGB, decodeFromPixelRow, isEncodedColor } from './src/lib/uuid-border';

const buffer = readFileSync('./90_zoom.png');
const png = PNG.sync.read(buffer);
const { width, height, data } = png;

console.log(`Testing decode of real Chrome 90% zoom screenshot`);
console.log(`Image dimensions: ${width}x${height}`);

const getPixel = (x: number, y: number): RGB => {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
};

// Helper to check for border color
const isBorderColor = (c: RGB): boolean => {
  const avg = (c.r + c.g + c.b) / 3;
  return avg > 100 && avg < 180 && Math.abs(c.g - c.b) < 30;
};

// Find rows with encoded pixels
const borderRows: Array<{y: number, startX: number, endX: number, count: number}> = [];

for (let y = 0; y < height; y++) {
  let firstEncoded = -1;
  let lastEncoded = -1;
  let encodedCount = 0;
  
  for (let x = 0; x < width; x++) {
    const p = getPixel(x, y);
    if (isEncodedColor(p, 20) || isBorderColor(p)) {
      if (firstEncoded < 0) firstEncoded = x;
      lastEncoded = x;
      if (isEncodedColor(p, 20)) encodedCount++;
    }
  }
  
  if (encodedCount > 100 && lastEncoded - firstEncoded > 300) {
    borderRows.push({ y, startX: firstEncoded, endX: lastEncoded, count: encodedCount });
  }
}

console.log(`Found ${borderRows.length} candidate rows`);

// Sort by encoded pixel count
borderRows.sort((a, b) => b.count - a.count);

// Try decoding from top candidate rows
console.log('\nAttempting decode...');

for (const row of borderRows.slice(0, 10)) {
  const y = row.y;
  const getPixelAtY = (x: number) => getPixel(x, y);
  
  // Give the decoder a wide search area
  const approxStartX = row.startX;
  const approxWidth = row.endX - row.startX;
  
  console.log(`\nTrying row y=${y}, x=${approxStartX}-${row.endX} (${row.count} encoded pixels)`);
  
  const result = decodeFromPixelRow(
    getPixelAtY,
    approxStartX,
    approxWidth
  );
  
  if (result) {
    console.log(`✅ SUCCESS! Decoded UUID: ${result.uuid}`);
    console.log(`   End marker match: ${result.endMarkerMatch}`);
    console.log(`   Errors corrected: ${result.errorsCorrected}`);
    process.exit(0);
  } else {
    console.log(`   Failed to decode`);
  }
}

console.log('\n❌ Failed to decode from any row');
