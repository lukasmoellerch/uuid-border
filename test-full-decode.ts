/**
 * Test the full decode path step by step
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { 
  RGB, isEncodedColor, findEncodingByMarkers, TOTAL_SEGMENTS,
  buildCalibratedIndex, findIndexCalibrated, MARKER_START_PATTERN,
  indicesToHexDigit, calculateParityBytes, DEFAULT_RS_CONFIG
} from './src/lib/uuid-border';
import { rsDecode, bytesToUuid } from './src/lib/reed-solomon';

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
const approxStartX = 93;  // From marker detection
const pixelsPerSegment = 6;
const effectiveStartX = 87;  // Calibrated (93 - 6)

console.log('Testing full decode path with calibrated start position');
console.log(`approxStartX=${approxStartX}, effectiveStartX=${effectiveStartX}, pixelsPerSegment=${pixelsPerSegment}`);

// Step 1: Read 8 index colors (positions 6-13)
console.log('\n=== Step 1: Read index colors ===');
const indexColors: RGB[] = [];
for (let i = 0; i < 8; i++) {
  const segmentCenterX = effectiveStartX + (6 + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
  const pixel = getPixelAtY(segmentCenterX);
  indexColors.push(pixel);
  console.log(`  Index ${i} (x=${segmentCenterX}): RGB(${pixel.r}, ${pixel.g}, ${pixel.b})`);
}

// Step 2: Build calibrated index
console.log('\n=== Step 2: Build calibrated index ===');
const calibration = buildCalibratedIndex(indexColors);
if (!calibration) {
  console.log('Calibration failed!');
  process.exit(1);
}
console.log(`  R threshold: ${calibration.rThreshold.toFixed(1)}, range: ${calibration.rRange.toFixed(1)}`);
console.log(`  G threshold: ${calibration.gThreshold.toFixed(1)}, range: ${calibration.gRange.toFixed(1)}`);
console.log(`  B threshold: ${calibration.bThreshold.toFixed(1)}, range: ${calibration.bRange.toFixed(1)}`);

// Check if ranges are sufficient
const MIN_RANGE = 10;
console.log(`\n  Min required range: ${MIN_RANGE}`);
console.log(`  R range OK: ${calibration.rRange >= MIN_RANGE} (${calibration.rRange.toFixed(1)} >= ${MIN_RANGE})`);
console.log(`  G range OK: ${calibration.gRange >= MIN_RANGE} (${calibration.gRange.toFixed(1)} >= ${MIN_RANGE})`);
console.log(`  B range OK: ${calibration.bRange >= MIN_RANGE} (${calibration.bRange.toFixed(1)} >= ${MIN_RANGE})`);

// Step 3: Verify start marker
console.log('\n=== Step 3: Verify start marker ===');
const decodeIndex = (x: number): number => findIndexCalibrated(getPixelAtY(x), calibration);

const startPattern: number[] = [];
for (let i = 0; i < 6; i++) {
  const segmentCenterX = effectiveStartX + i * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
  const idx = decodeIndex(segmentCenterX);
  startPattern.push(idx);
  const expected = MARKER_START_PATTERN[i];
  console.log(`  Seg ${i} (x=${segmentCenterX}): decoded=${idx}, expected=${expected} ${idx === expected ? '✓' : '✗'}`);
}

let startMatchCount = 0;
for (let i = 0; i < 6; i++) {
  if (startPattern[i] === MARKER_START_PATTERN[i]) startMatchCount++;
}
console.log(`  Start marker match: ${startMatchCount}/6`);

// Step 4: Read data bytes
console.log('\n=== Step 4: Read data bytes ===');
const nsym = calculateParityBytes(16, DEFAULT_RS_CONFIG.redundancyFactor);
const totalBytes = 16 + nsym;
const dataStartSegment = 14;

const bytes: number[] = [];
for (let byteIdx = 0; byteIdx < totalBytes; byteIdx++) {
  const baseSegment = dataStartSegment + byteIdx * 4;
  
  const segments: number[] = [];
  for (let s = 0; s < 4; s++) {
    const segmentCenterX = effectiveStartX + (baseSegment + s) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
    segments.push(decodeIndex(segmentCenterX));
  }
  
  const highNibble = indicesToHexDigit(segments[0], segments[1]);
  const lowNibble = indicesToHexDigit(segments[2], segments[3]);
  bytes.push((highNibble << 4) | lowNibble);
  
  if (byteIdx < 5) {
    console.log(`  Byte ${byteIdx}: segments=[${segments.join(',')}] -> 0x${bytes[byteIdx].toString(16).padStart(2, '0')}`);
  }
}
console.log(`  ... (${totalBytes} total bytes)`);
console.log(`  First 16 bytes (UUID): ${bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('')}`);

// Step 5: Apply Reed-Solomon
console.log('\n=== Step 5: Apply Reed-Solomon error correction ===');
const encodedBytes = new Uint8Array(bytes);
const decodedBytes = rsDecode(encodedBytes, nsym);

if (decodedBytes) {
  const uuid = bytesToUuid(decodedBytes);
  console.log(`  ✅ SUCCESS! Decoded UUID: ${uuid}`);
} else {
  console.log(`  ❌ RS decode failed - too many errors`);
  console.log(`\n  Raw bytes for analysis:`);
  for (let i = 0; i < totalBytes; i += 8) {
    console.log(`    ${bytes.slice(i, i + 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }
}
