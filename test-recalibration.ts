/**
 * Test the recalibration function directly
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { RGB, isEncodedColor, findEncodingByMarkers, TOTAL_SEGMENTS } from './src/lib/uuid-border';

const buffer = readFileSync('./90_zoom.png');
const png = PNG.sync.read(buffer);
const { width, height, data } = png;

const getPixel = (x: number, y: number): RGB => {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
};

// Use the known good row
const y = 428;
const getPixelAtY = (x: number) => getPixel(x, y);

// Find the border region
let startX = 0;
let endX = width;
for (let x = 0; x < width; x++) {
  if (isEncodedColor(getPixel(x, y), 20)) {
    startX = Math.max(0, x - 10);
    break;
  }
}
for (let x = width - 1; x >= 0; x--) {
  if (isEncodedColor(getPixel(x, y), 20)) {
    endX = Math.min(width, x + 10);
    break;
  }
}

console.log(`Testing row y=${y}, border region x=${startX}-${endX}`);

// Marker detection
const markerResult = findEncodingByMarkers(getPixelAtY, startX, endX);
if (!markerResult) {
  console.log('Marker detection failed!');
  process.exit(1);
}

console.log(`Marker detection: startX=${markerResult.startX}, segmentWidth=${markerResult.segmentWidth}`);

// Now manually test the recalibration logic
const approxStartX = markerResult.startX;
const pixelsPerSegment = markerResult.segmentWidth;
const MID = 133;

const searchRange = Math.ceil(pixelsPerSegment * 1.5);
console.log(`\nRecalibration search range: ±${searchRange} pixels`);

let bestOffset = 0;
let bestScore = -1;

for (let offset = -searchRange; offset <= searchRange; offset++) {
  const candidateStart = approxStartX + offset;
  let score = 0;
  const detected: number[] = [];
  
  for (let i = 0; i < 8; i++) {
    const segmentCenter = candidateStart + (6 + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
    const pixel = getPixelAtY(segmentCenter);
    
    const rBit = pixel.r > MID ? 1 : 0;
    const gBit = pixel.g > MID ? 1 : 0;
    const bBit = pixel.b > MID ? 1 : 0;
    const detectedIdx = rBit | (gBit << 1) | (bBit << 2);
    detected.push(detectedIdx);
    
    if (detectedIdx === i) {
      score += 1;
    } else if (Math.abs(detectedIdx - i) === 1) {
      score += 0.5;
    }
  }
  
  if (score >= 5) {
    console.log(`  offset=${offset}: detected=[${detected.join(',')}] score=${score}`);
  }
  
  if (score > bestScore) {
    bestScore = score;
    bestOffset = offset;
  }
}

console.log(`\nBest: offset=${bestOffset}, score=${bestScore}`);
console.log(`Calibrated startX would be: ${approxStartX + bestOffset}`);

// Now verify this gives us the right index colors
const calibratedStartX = approxStartX + bestOffset;
console.log(`\nVerifying calibrated position:`);
for (let i = 0; i < 8; i++) {
  const segmentCenter = calibratedStartX + (6 + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
  const p = getPixelAtY(segmentCenter);
  const rBit = p.r > MID ? 1 : 0;
  const gBit = p.g > MID ? 1 : 0;
  const bBit = p.b > MID ? 1 : 0;
  const idx = rBit | (gBit << 1) | (bBit << 2);
  console.log(`  Index ${i} (x=${segmentCenter}): RGB(${p.r}, ${p.g}, ${p.b}) -> detected=${idx} ${idx === i ? '✓' : '✗'}`);
}
