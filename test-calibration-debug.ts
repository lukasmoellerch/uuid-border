/**
 * Debug the calibration function step by step
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { RGB, isEncodedColor, TOTAL_SEGMENTS, MARKER_START_PATTERN, indicesToHexDigit } from './src/lib/uuid-border';
import { rsDecode, bytesToUuid, calculateParityBytes, DEFAULT_RS_CONFIG } from './src/lib/reed-solomon';

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

const y = 428;
const getPixelAtY = (x: number) => getPixel(x, y);
const searchStart = 80;
const searchEnd = 1000;

console.log('=== Step 1: Find transitions ===');

interface Transition {
  x: number;
  fromIdx: number;
  toIdx: number;
}

const MID = 133;

const getIndex = (pixel: RGB): number => {
  const rBit = pixel.r > MID ? 1 : 0;
  const gBit = pixel.g > MID ? 1 : 0;
  const bBit = pixel.b > MID ? 1 : 0;
  return rBit | (gBit << 1) | (bBit << 2);
};

const transitions: Transition[] = [];
let prevIdx = -1;

for (let x = searchStart; x < searchEnd; x++) {
  const pixel = getPixelAtY(x);
  
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

console.log(`Found ${transitions.length} transitions`);

// Step 2: Find index sequence
console.log('\n=== Step 2: Find index sequence pattern ===');

let indexPositions: number[] | null = null;

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
    
    const positions: number[] = [];
    
    // Position of index 0
    const firstTransition = transitions[i];
    const prevTransition = i > 0 ? transitions[i - 1] : null;
    
    if (prevTransition) {
      positions.push(prevTransition.x);
      console.log(`  Index 0 starts at x=${prevTransition.x} (from prev transition)`);
    } else {
      const nextGap = transitions[i + 1].x - transitions[i].x;
      positions.push(firstTransition.x - nextGap);
      console.log(`  Index 0 starts at x=${firstTransition.x - nextGap} (estimated)`);
    }
    
    // Positions of indices 1-7
    for (let j = 0; j < 7; j++) {
      positions.push(transitions[i + j].x);
      console.log(`  Index ${j + 1} starts at x=${transitions[i + j].x}`);
    }
    
    indexPositions = positions;
    break;
  }
}

if (!indexPositions) {
  console.log('Failed to find index sequence!');
  process.exit(1);
}

// Step 3: Calculate segment width
console.log('\n=== Step 3: Calculate segment width ===');

const gaps: number[] = [];
for (let i = 1; i < indexPositions.length; i++) {
  const gap = indexPositions[i] - indexPositions[i - 1];
  gaps.push(gap);
  console.log(`  Gap ${i-1}→${i}: ${gap}px`);
}

// Use average (total span / 7) instead of median for better accuracy
const totalSpan = indexPositions[7] - indexPositions[0];
const pixelsPerSegment = totalSpan / 7;

console.log(`Median gap (segment width): ${pixelsPerSegment}px`);

// Step 4: Calculate startX
console.log('\n=== Step 4: Calculate startX ===');

const startX = indexPositions[0] - 6 * pixelsPerSegment;
console.log(`Index 0 position: ${indexPositions[0]}`);
console.log(`startX = ${indexPositions[0]} - 6 * ${pixelsPerSegment} = ${startX}`);

// Step 5: Sample index colors and build thresholds
console.log('\n=== Step 5: Sample index colors ===');

const indexColors: RGB[] = [];
for (let i = 0; i < 8; i++) {
  const segStart = indexPositions[i];
  const segEnd = i < 7 ? indexPositions[i + 1] : segStart + pixelsPerSegment;
  const centerX = Math.floor((segStart + segEnd) / 2);
  const color = getPixelAtY(centerX);
  indexColors.push(color);
  console.log(`  Index ${i} (center x=${centerX}): RGB(${color.r}, ${color.g}, ${color.b})`);
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

console.log(`\nCalibrated thresholds:`);
console.log(`  R: ${rThreshold.toFixed(1)} (low=${rLow.join(',')}, high=${rHigh.join(',')})`);
console.log(`  G: ${gThreshold.toFixed(1)} (low=${gLow.join(',')}, high=${gHigh.join(',')})`);
console.log(`  B: ${bThreshold.toFixed(1)} (low=${bLow.join(',')}, high=${bHigh.join(',')})`);

// Decode function
const decodeIndex = (x: number): number => {
  const p = getPixelAtY(x);
  const rBit = p.r > rThreshold ? 1 : 0;
  const gBit = p.g > gThreshold ? 1 : 0;
  const bBit = p.b > bThreshold ? 1 : 0;
  return rBit | (gBit << 1) | (bBit << 2);
};

const getSegmentCenterX = (segmentIndex: number): number => {
  return Math.floor(startX + segmentIndex * pixelsPerSegment + pixelsPerSegment / 2);
};

// Step 6: Verify start marker
console.log('\n=== Step 6: Verify start marker [1,1,1,0,1,2] ===');

const startPattern: number[] = [];
for (let i = 0; i < 6; i++) {
  const centerX = getSegmentCenterX(i);
  const idx = decodeIndex(centerX);
  startPattern.push(idx);
  const expected = MARKER_START_PATTERN[i];
  console.log(`  Seg ${i} (x=${centerX}): decoded=${idx}, expected=${expected} ${idx === expected ? '✓' : '✗'}`);
}

const startMatches = startPattern.filter((p, i) => p === MARKER_START_PATTERN[i]).length;
console.log(`Start marker matches: ${startMatches}/6`);

// Step 7: Verify index sequence with calibrated decoder
console.log('\n=== Step 7: Verify index sequence ===');

for (let i = 0; i < 8; i++) {
  const centerX = getSegmentCenterX(6 + i);
  const idx = decodeIndex(centerX);
  console.log(`  Index ${i} (x=${centerX}): decoded=${idx} ${idx === i ? '✓' : '✗'}`);
}

// Step 8: Read data
console.log('\n=== Step 8: Read data bytes ===');

const nsym = calculateParityBytes(16, DEFAULT_RS_CONFIG.redundancyFactor);
const totalBytes = 16 + nsym;
const dataStartSegment = 14;

const bytes: number[] = [];
for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
  const baseSegment = dataStartSegment + byteIdx * 4;
  
  const segments: number[] = [];
  for (let s = 0; s < 4; s++) {
    const segmentCenterX = getSegmentCenterX(baseSegment + s);
    segments.push(decodeIndex(segmentCenterX));
  }
  
  const highNibble = indicesToHexDigit(segments[0], segments[1]);
  const lowNibble = indicesToHexDigit(segments[2], segments[3]);
  bytes.push((highNibble << 4) | lowNibble);
  
  if (byteIdx < 5) {
    console.log(`  Byte ${byteIdx}: segs=[${segments.join(',')}] -> 0x${bytes[byteIdx].toString(16).padStart(2, '0')}`);
  }
}

console.log(`  ... total ${totalBytes} bytes`);

// Step 9: RS decode
console.log('\n=== Step 9: RS decode ===');

const encodedBytes = new Uint8Array(bytes);
const decodedBytes = rsDecode(encodedBytes, nsym);

if (decodedBytes) {
  const uuid = bytesToUuid(decodedBytes);
  console.log(`✅ SUCCESS! Decoded UUID: ${uuid}`);
} else {
  console.log(`❌ RS decode failed`);
  console.log(`Raw bytes: ${bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
}
