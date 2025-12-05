/**
 * Test if the fix works by decoding the real Chrome 90% zoom screenshot
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { 
  findEncodingByMarkers, 
  TOTAL_SEGMENTS,
  RGB,
  decodeFromPixelRow,
  isEncodedColor
} from './src/lib/uuid-border';

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

// Find row with most encoded pixels
let bestRow = borderRows[0];
for (const row of borderRows) {
  if (row.count > bestRow.count) bestRow = row;
}

console.log(`\nFound ${borderRows.length} candidate rows`);
console.log(`Best row: y=${bestRow.y}, x=${bestRow.startX}-${bestRow.endX}, ${bestRow.count} encoded pixels`);

// Try to decode from multiple rows
console.log('\n' + '='.repeat(60));
console.log('Attempting decode from multiple rows...');
console.log('='.repeat(60));

let decoded = false;
for (const row of borderRows.slice(0, 10)) {
  const y = row.y;
  const getPixelAtY = (x: number) => getPixel(x, y);
  
  // Try marker detection
  const markerResult = findEncodingByMarkers(getPixelAtY, row.startX, row.endX);
  
  if (markerResult) {
    console.log(`\ny=${y}: Marker detected at startX=${markerResult.startX}, segmentWidth=${markerResult.segmentWidth}`);
    
    const encodedWidth = markerResult.segmentWidth * TOTAL_SEGMENTS;
    const result = decodeFromPixelRow(getPixelAtY, markerResult.startX, encodedWidth);
    
    if (result) {
      console.log(`\n✅ SUCCESS! Decoded UUID: ${result.uuid}`);
      console.log(`   End marker match: ${result.endMarkerMatch}`);
      console.log(`   Errors corrected: ${result.errorsCorrected}`);
      decoded = true;
      break;
    } else {
      console.log(`   Failed to decode`);
    }
  }
}

if (!decoded) {
  console.log('\n❌ Failed to decode from any row');
  
  // Debug: show what the index sequence looks like at the best row
  const y = bestRow.y;
  const getPixelAtY = (x: number) => getPixel(x, y);
  const markerResult = findEncodingByMarkers(getPixelAtY, bestRow.startX, bestRow.endX);
  
  if (markerResult) {
    console.log(`\nDebug: Index sequence detection at y=${y}`);
    console.log(`Marker detected: startX=${markerResult.startX}, segmentWidth=${markerResult.segmentWidth}`);
    
    const MID = 133;
    const pps = markerResult.segmentWidth;
    
    console.log('\nSearching for best index sequence alignment...');
    
    // Try different offsets
    for (let offset = -10; offset <= 10; offset++) {
      const candidateStart = markerResult.startX + offset;
      let matches = 0;
      const detected: number[] = [];
      
      for (let i = 0; i < 8; i++) {
        const segCenter = candidateStart + (6 + i) * pps + Math.floor(pps / 2);
        const p = getPixel(segCenter, y);
        const rBit = p.r > MID ? 1 : 0;
        const gBit = p.g > MID ? 1 : 0;
        const bBit = p.b > MID ? 1 : 0;
        const idx = rBit | (gBit << 1) | (bBit << 2);
        detected.push(idx);
        if (idx === i) matches++;
      }
      
      if (matches >= 5) {
        console.log(`  offset=${offset}: detected=[${detected.join(',')}] matches=${matches}/8`);
      }
    }
  }
}
