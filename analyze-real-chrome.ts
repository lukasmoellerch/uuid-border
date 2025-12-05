/**
 * Analyze the real Chrome 90% zoom screenshot
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { 
  findEncodingByMarkers, 
  isEncodedColor, 
  TOTAL_SEGMENTS,
  RGB,
  decodeFromPixelRow,
  buildCalibratedIndex,
  findIndexCalibrated
} from './src/lib/uuid-border';

const buffer = readFileSync('./90_zoom.png');
const png = PNG.sync.read(buffer);
const { width, height, data } = png;

console.log(`Image dimensions: ${width}x${height}`);

const getPixel = (x: number, y: number): RGB => {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
};

// Scan for border-like regions
console.log('\nScanning for encoded border regions...');

const isBorderColor = (c: RGB): boolean => {
  const avg = (c.r + c.g + c.b) / 3;
  return avg > 100 && avg < 180 && Math.abs(c.g - c.b) < 30;
};

// Find rows with significant encoded pixels
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
  
  // Only consider rows with substantial encoded content
  if (encodedCount > 100 && lastEncoded - firstEncoded > 300) {
    borderRows.push({ y, startX: firstEncoded, endX: lastEncoded, count: encodedCount });
  }
}

console.log(`Found ${borderRows.length} potential border rows`);

// Show the first few candidates
for (let i = 0; i < Math.min(5, borderRows.length); i++) {
  const row = borderRows[i];
  console.log(`  y=${row.y}: x=${row.startX}-${row.endX} (${row.endX - row.startX}px, ${row.count} encoded)`);
}

// Analyze the most promising row - look for the one with most encoded pixels
if (borderRows.length > 0) {
  // Find row with most encoded pixels
  let bestRow = borderRows[0];
  for (const row of borderRows) {
    if (row.count > bestRow.count) {
      bestRow = row;
    }
  }
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Analyzing best candidate row: y=${bestRow.y}`);
  console.log('='.repeat(60));

  const y = bestRow.y;
  const getPixelAtY = (x: number) => getPixel(x, y);

  // Sample pixel values
  console.log('\nPixel values (every 5px for first 200):');
  for (let x = bestRow.startX; x < Math.min(bestRow.startX + 200, bestRow.endX); x += 5) {
    const p = getPixel(x, y);
    const encoded = isEncodedColor(p, 20);
    // Also check with wider tolerance
    const encodedWide = isEncodedColor(p, 35);
    console.log(`  x=${x}: RGB(${p.r}, ${p.g}, ${p.b}) ${encoded ? '✓' : encodedWide ? '~' : '✗'}`);
  }
  
  // Show a histogram of values in this row
  console.log('\nPixel value histogram (R channel):');
  const rHist = new Map<number, number>();
  for (let x = bestRow.startX; x < bestRow.endX; x++) {
    const p = getPixel(x, y);
    const bucket = Math.round(p.r / 5) * 5;
    rHist.set(bucket, (rHist.get(bucket) || 0) + 1);
  }
  const sortedR = [...rHist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [val, count] of sortedR.slice(0, 10)) {
    console.log(`  R~${val}: ${count} pixels`);
  }

  // Try marker detection
  const result = findEncodingByMarkers(getPixelAtY, bestRow.startX, bestRow.endX);
  
  if (result) {
    console.log(`\nMarker detection SUCCESS:`);
    console.log(`  startX=${result.startX}, segmentWidth=${result.segmentWidth}`);
    console.log(`  Total segments: ${TOTAL_SEGMENTS}`);
    console.log(`  Encoding width: ${result.segmentWidth * TOTAL_SEGMENTS}`);

    // Try decode
    const decoded = decodeFromPixelRow(
      getPixelAtY,
      result.startX,
      result.segmentWidth * TOTAL_SEGMENTS
    );

    if (decoded) {
      console.log(`\n✅ DECODED: ${decoded.uuid}`);
      console.log(`  End marker match: ${decoded.endMarkerMatch}`);
      console.log(`  Errors corrected: ${decoded.errorsCorrected}`);
    } else {
      console.log('\n❌ Failed to decode');
      
      // Detailed analysis
      const pixelsPerSegment = result.segmentWidth;
      const startX = result.startX;
      
      console.log('\nSegment-by-segment analysis:');
      
      // Read index colors (segments 6-13)
      console.log('\nIndex colors (segments 6-13):');
      const indexColors: RGB[] = [];
      for (let i = 0; i < 8; i++) {
        const segX = startX + (6 + i) * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
        const p = getPixel(segX, y);
        indexColors.push(p);
        console.log(`  Index ${i} (x=${segX}): RGB(${p.r}, ${p.g}, ${p.b})`);
      }
      
      // Build calibration
      const calibration = buildCalibratedIndex(indexColors);
      if (calibration) {
        console.log('\nCalibration:');
        console.log(`  R threshold: ${calibration.rThreshold.toFixed(1)}, range: ${calibration.rRange.toFixed(1)}`);
        console.log(`  G threshold: ${calibration.gThreshold.toFixed(1)}, range: ${calibration.gRange.toFixed(1)}`);
        console.log(`  B threshold: ${calibration.bThreshold.toFixed(1)}, range: ${calibration.bRange.toFixed(1)}`);
        
        // Test start marker
        console.log('\nStart marker (expected [1,1,1,0,1,2]):');
        for (let i = 0; i < 6; i++) {
          const segX = startX + i * pixelsPerSegment + Math.floor(pixelsPerSegment / 2);
          const p = getPixel(segX, y);
          const idx = findIndexCalibrated(p, calibration);
          const expected = [1,1,1,0,1,2][i];
          console.log(`  Seg ${i} (x=${segX}): RGB(${p.r}, ${p.g}, ${p.b}) -> idx=${idx} ${idx === expected ? '✓' : `✗ expected ${expected}`}`);
        }
      }
    }
  } else {
    console.log('\n❌ Marker detection FAILED');
    
    // Manual run analysis
    console.log('\nManual color run analysis:');
    const MID = 133;
    let runs: Array<{startX: number, endX: number, rHigh: boolean, gHigh: boolean, bHigh: boolean}> = [];
    let currentRun: typeof runs[0] | null = null;
    
    for (let x = bestRow.startX; x < bestRow.endX; x++) {
      const p = getPixel(x, y);
      if (!isEncodedColor(p, 25)) {
        if (currentRun) {
          currentRun.endX = x;
          runs.push(currentRun);
          currentRun = null;
        }
        continue;
      }
      
      const rHigh = p.r > MID;
      const gHigh = p.g > MID;
      const bHigh = p.b > MID;
      
      if (!currentRun || currentRun.rHigh !== rHigh || currentRun.gHigh !== gHigh || currentRun.bHigh !== bHigh) {
        if (currentRun) {
          currentRun.endX = x;
          runs.push(currentRun);
        }
        currentRun = { startX: x, endX: x + 1, rHigh, gHigh, bHigh };
      }
    }
    if (currentRun) {
      currentRun.endX = bestRow.endX;
      runs.push(currentRun);
    }
    
    console.log(`Found ${runs.length} color runs`);
    console.log('\nFirst 20 runs:');
    for (let i = 0; i < Math.min(20, runs.length); i++) {
      const r = runs[i];
      const idx = (r.rHigh ? 1 : 0) | (r.gHigh ? 2 : 0) | (r.bHigh ? 4 : 0);
      console.log(`  Run ${i}: x=${r.startX}-${r.endX} (${r.endX - r.startX}px), idx=${idx}`);
    }
    
    // Show expected patterns
    console.log('\nExpected start marker pattern [1,1,1,0,1,2] would look like:');
    console.log('  3 runs of idx=1, then idx=0, then idx=1, then idx=2 (or merged: one 3x run of idx=1)');
  }
}
