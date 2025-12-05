/**
 * Test the full calibration flow step by step
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { RGB, isEncodedColor, TOTAL_SEGMENTS, MARKER_START_PATTERN, indicesToHexDigit, findEncodingByMarkers } from './src/lib/uuid-border';
import { rsDecode, bytesToUuid, calculateParityBytes, DEFAULT_RS_CONFIG } from './src/lib/reed-solomon';

const buffer = readFileSync('./90_zoom.png');
const png = PNG.sync.read(buffer);
const { width, height, data } = png;

const getPixel = (x: number, y: number): RGB | undefined => {
  if (x < 0 || x >= width || y < 0 || y >= height) return undefined;
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
};

const y = 428;
const getPixelAtY = (x: number) => getPixel(x, y);

// Same params as in direct decode
const approxStartX = 90;
const approxWidth = 960 - 90;
const searchStart = Math.max(0, approxStartX - 20);
const searchEnd = approxStartX + approxWidth + 20;

console.log(`Testing calibration flow at y=${y}`);
console.log(`searchStart=${searchStart}, searchEnd=${searchEnd}`);

// Step 1: Find transitions
const MID = 133;

interface Transition {
  x: number;
  fromIdx: number;
  toIdx: number;
}

const transitions: Transition[] = [];

const getIndex = (pixel: RGB): number => {
  const rBit = pixel.r > MID ? 1 : 0;
  const gBit = pixel.g > MID ? 1 : 0;
  const bBit = pixel.b > MID ? 1 : 0;
  return rBit | (gBit << 1) | (bBit << 2);
};

let prevIdx = -1;

for (let x = searchStart; x < searchEnd; x++) {
  const pixel = getPixelAtY(x);
  
  if (!pixel) {
    prevIdx = -1;
    continue;
  }
  
  if (!isEncodedColor(pixel, 25)) {
    prevIdx = -1;
    continue;
  }
  
  const idx = getIndex(pixel);
  
  if (prevIdx !== -1 && idx !== prevIdx) {
    transitions.push({ x, fromIdx: prevIdx, toIdx: idx });
  }
  
  prevIdx = idx;
}

console.log(`\nFound ${transitions.length} transitions`);

// Step 2: Find index sequence
console.log('\nLooking for index sequence pattern...');

let indexPositions: number[] | null = null;
let foundAt = -1;

for (let i = 0; i <= transitions.length - 7; i++) {
  let matches = 0;
  
  for (let j = 0; j < 7; j++) {
    const t = transitions[i + j];
    if (t.fromIdx === j && t.toIdx === j + 1) {
      matches++;
    }
  }
  
  if (matches >= 5) {
    console.log(`Found at transition index ${i} with ${matches}/7 matches`);
    foundAt = i;
    
    const positions: number[] = [];
    
    const firstTransition = transitions[i];
    const prevTransition = i > 0 ? transitions[i - 1] : null;
    
    if (prevTransition) {
      positions.push(prevTransition.x);
    } else {
      const nextGap = transitions[i + 1].x - transitions[i].x;
      positions.push(firstTransition.x - nextGap);
    }
    
    for (let j = 0; j < 7; j++) {
      positions.push(transitions[i + j].x);
    }
    
    indexPositions = positions;
    break;
  }
}

if (!indexPositions || indexPositions.length < 8) {
  console.log('Failed to find index sequence!');
  console.log('First 20 transitions:');
  for (let i = 0; i < Math.min(20, transitions.length); i++) {
    const t = transitions[i];
    console.log(`  ${i}: x=${t.x} ${t.fromIdx}→${t.toIdx}`);
  }
  process.exit(1);
}

console.log(`Index positions: [${indexPositions.join(', ')}]`);

// Step 3: Calculate segment width and startX
const totalSpan = indexPositions[7] - indexPositions[0];
const pixelsPerSegment = totalSpan / 7;
const startX = indexPositions[0] - 6 * pixelsPerSegment;

console.log(`\nSegment width: ${pixelsPerSegment.toFixed(2)}px`);
console.log(`startX: ${startX.toFixed(2)}`);

// Step 4: Sample index colors for thresholds
console.log('\nSampling index colors...');

const indexColors: RGB[] = [];
for (let i = 0; i < 8; i++) {
  const segStart = indexPositions[i];
  const segEnd = i < 7 ? indexPositions[i + 1] : segStart + pixelsPerSegment;
  const centerX = Math.floor((segStart + segEnd) / 2);
  const color = getPixelAtY(centerX);
  if (color) {
    indexColors.push(color);
    console.log(`  Index ${i} (x=${centerX}): RGB(${color.r}, ${color.g}, ${color.b})`);
  } else {
    console.log(`  Index ${i} (x=${centerX}): OUT OF BOUNDS!`);
  }
}

if (indexColors.length < 8) {
  console.log('Not enough index colors!');
  process.exit(1);
}

// Build thresholds
const median4 = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[1] + sorted[2]) / 2;
};

const rLow = [0, 2, 4, 6].map(i => indexColors[i].r);
const rHigh = [1, 3, 5, 7].map(i => indexColors[i].r);
const rThreshold = (median4(rLow) + median4(rHigh)) / 2;

const gLow = [0, 1, 4, 5].map(i => indexColors[i].g);
const gHigh = [2, 3, 6, 7].map(i => indexColors[i].g);
const gThreshold = (median4(gLow) + median4(gHigh)) / 2;

const bLow = [0, 1, 2, 3].map(i => indexColors[i].b);
const bHigh = [4, 5, 6, 7].map(i => indexColors[i].b);
const bThreshold = (median4(bLow) + median4(bHigh)) / 2;

console.log(`\nCalibrated thresholds: R=${rThreshold.toFixed(1)}, G=${gThreshold.toFixed(1)}, B=${bThreshold.toFixed(1)}`);

// Step 5: Decode helper
const decodeIndexCal = (x: number): number => {
  const p = getPixelAtY(x);
  if (!p) return -1;
  const rBit = p.r > rThreshold ? 1 : 0;
  const gBit = p.g > gThreshold ? 1 : 0;
  const bBit = p.b > bThreshold ? 1 : 0;
  return rBit | (gBit << 1) | (bBit << 2);
};

const getSegmentCenterX = (segmentIndex: number): number => {
  return Math.floor(startX + segmentIndex * pixelsPerSegment + pixelsPerSegment / 2);
};

// Step 6: Check start marker
console.log('\n=== Start marker check ===');

const startPattern: number[] = [];
for (let i = 0; i < 6; i++) {
  const centerX = getSegmentCenterX(i);
  const idx = decodeIndexCal(centerX);
  startPattern.push(idx);
  const expected = MARKER_START_PATTERN[i];
  console.log(`  Seg ${i} (x=${centerX}): decoded=${idx}, expected=${expected} ${idx === expected ? '✓' : '✗'}`);
}

const startMatches = startPattern.filter((p, i) => p === MARKER_START_PATTERN[i]).length;
console.log(`Matches: ${startMatches}/6`);

if (startMatches < 3) {
  console.log('Start marker failed! (need >= 3 matches)');
  process.exit(1);
}

// Step 7: Check index sequence
console.log('\n=== Index sequence check ===');

for (let i = 0; i < 8; i++) {
  const centerX = getSegmentCenterX(6 + i);
  const idx = decodeIndexCal(centerX);
  console.log(`  Index ${i} (x=${centerX}): decoded=${idx} ${idx === i ? '✓' : '✗'}`);
}

// Step 8: Read data
console.log('\n=== Reading data bytes ===');

const nsym = calculateParityBytes(16, DEFAULT_RS_CONFIG.redundancyFactor);
const totalBytes = 16 + nsym;
const dataStartSegment = 14;

const bytes: number[] = [];
let segmentErrors = 0;

for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
  const baseSegment = dataStartSegment + byteIdx * 4;
  
  const segments: number[] = [];
  for (let s = 0; s < 4; s++) {
    const segmentCenterX = getSegmentCenterX(baseSegment + s);
    const idx = decodeIndexCal(segmentCenterX);
    segments.push(idx);
    
    // Check for out-of-range indices
    if (idx < 0 || idx > 7) segmentErrors++;
  }
  
  const highNibble = indicesToHexDigit(segments[0], segments[1]);
  const lowNibble = indicesToHexDigit(segments[2], segments[3]);
  bytes.push((highNibble << 4) | lowNibble);
}

console.log(`Read ${totalBytes} bytes with ${segmentErrors} segment errors`);
console.log(`First 16 bytes (UUID): ${bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

// Step 9: RS decode
console.log('\n=== RS decode ===');

const encodedBytes = new Uint8Array(bytes);
const decodedBytes = rsDecode(encodedBytes, nsym);

if (decodedBytes) {
  const uuid = bytesToUuid(decodedBytes);
  console.log(`✅ SUCCESS! Decoded UUID: ${uuid}`);
} else {
  console.log(`❌ RS decode failed`);
  console.log(`Raw bytes: ${bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
}
