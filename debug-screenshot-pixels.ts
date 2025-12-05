/**
 * Debug script to analyze pixel values in zoomed screenshots
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { 
  findEncodingByMarkers, 
  isEncodedColor, 
  TOTAL_SEGMENTS,
  RGB,
  decodeFromPixelRow
} from './src/lib/uuid-border';

const ARTIFACTS_DIR = join(__dirname, 'test-artifacts');

function analyzeImage(filename: string, description: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${description}: ${filename}`);
  console.log('='.repeat(60));

  const buffer = readFileSync(join(ARTIFACTS_DIR, filename));
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  
  console.log(`Dimensions: ${width}x${height}`);

  const getPixel = (x: number, y: number): RGB => {
    const idx = (y * width + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
    };
  };

  // Find the top border row (y=0, 1, or 2)
  let borderY = -1;
  for (let y = 0; y < Math.min(5, height); y++) {
    let encodedCount = 0;
    for (let x = 0; x < width; x++) {
      if (isEncodedColor(getPixel(x, y))) {
        encodedCount++;
      }
    }
    if (encodedCount > width / 2) {
      borderY = y;
      break;
    }
  }

  if (borderY < 0) {
    console.log('No encoded border found in first 5 rows');
    
    // Show pixel values of first row
    console.log('\nFirst row pixel samples:');
    for (let x = 0; x < Math.min(20, width); x += 4) {
      const p = getPixel(x, 0);
      console.log(`  x=${x}: RGB(${p.r}, ${p.g}, ${p.b})`);
    }
    return;
  }

  console.log(`Border found at y=${borderY}`);

  // Sample pixel values along the border
  console.log('\nPixel values along border (every 10px):');
  for (let x = 0; x < Math.min(width, 200); x += 10) {
    const p = getPixel(x, borderY);
    const encoded = isEncodedColor(p);
    console.log(`  x=${x}: RGB(${p.r}, ${p.g}, ${p.b}) ${encoded ? '✓' : '✗'}`);
  }

  // Try marker detection
  const getPixelAtBorder = (x: number) => getPixel(x, borderY);
  const result = findEncodingByMarkers(getPixelAtBorder, 0, width);

  if (result) {
    console.log(`\nMarker detection: startX=${result.startX}, segmentWidth=${result.segmentWidth}`);
    console.log(`Expected total segments: ${TOTAL_SEGMENTS}`);
    console.log(`Total encoding width: ${result.segmentWidth * TOTAL_SEGMENTS}`);

    // Try to decode
    const decoded = decodeFromPixelRow(
      getPixelAtBorder,
      result.startX,
      result.segmentWidth * TOTAL_SEGMENTS
    );

    if (decoded) {
      console.log(`\nDecoded UUID: ${decoded.uuid}`);
      console.log(`End marker match: ${decoded.endMarkerMatch}`);
      console.log(`Errors corrected: ${decoded.errorsCorrected}`);
    } else {
      console.log('\nFailed to decode UUID');
      
      // Analyze the segment colors
      console.log('\nSegment analysis (first 20 segments):');
      for (let i = 0; i < Math.min(20, TOTAL_SEGMENTS); i++) {
        const x = result.startX + i * result.segmentWidth + Math.floor(result.segmentWidth / 2);
        if (x < width) {
          const p = getPixel(x, borderY);
          const encoded = isEncodedColor(p);
          console.log(`  Seg ${i} (x=${x}): RGB(${p.r}, ${p.g}, ${p.b}) ${encoded ? '✓' : '✗'}`);
        }
      }
    }
  } else {
    console.log('\nMarker detection FAILED');
    
    // Let's manually analyze the pixel patterns
    console.log('\nManual pixel pattern analysis (first 100 pixels):');
    const MID = 133;
    let runs: Array<{startX: number, rHigh: boolean, gHigh: boolean, bHigh: boolean}> = [];
    let currentRun = null;
    
    for (let x = 0; x < Math.min(width, 100); x++) {
      const p = getPixel(x, borderY);
      if (!isEncodedColor(p, 25)) continue;
      
      const rHigh = p.r > MID;
      const gHigh = p.g > MID;
      const bHigh = p.b > MID;
      
      if (!currentRun || currentRun.rHigh !== rHigh || currentRun.gHigh !== gHigh || currentRun.bHigh !== bHigh) {
        if (currentRun) runs.push(currentRun);
        currentRun = { startX: x, rHigh, gHigh, bHigh };
      }
    }
    if (currentRun) runs.push(currentRun);
    
    console.log(`Found ${runs.length} color runs:`);
    for (let i = 0; i < Math.min(runs.length, 15); i++) {
      const r = runs[i];
      const endX = i + 1 < runs.length ? runs[i + 1].startX : width;
      const idx = (r.rHigh ? 1 : 0) | (r.gHigh ? 2 : 0) | (r.bHigh ? 4 : 0);
      console.log(`  Run ${i}: x=${r.startX}-${endX} (${endX - r.startX}px), idx=${idx}`);
    }
  }
}

// Analyze both working and failing cases
analyzeImage('investigate-css-zoom-canvas.png', 'WORKING: Canvas toDataURL (no scaling)');
analyzeImage('investigate-css-zoom-screenshot.png', 'FAILING: CSS zoom + Playwright screenshot');
analyzeImage('investigate-dpr-90-screenshot.png', 'FAILING: DPR 0.9 screenshot');

// Also test original screenshot if it exists
try {
  analyzeImage('e2e-encode-decode-screenshot.png', 'REFERENCE: Normal encode-decode screenshot');
} catch (e) {
  console.log('Reference screenshot not available');
}
