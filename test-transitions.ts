/**
 * Test the transition-based timing calibration
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { RGB, isEncodedColor } from './src/lib/uuid-border';

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
const searchEnd = 200;

console.log(`Testing transition finding at y=${y}, x=${searchStart}-${searchEnd}`);

// Find transitions
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
let runStart = searchStart;

for (let x = searchStart; x < searchEnd; x++) {
  const pixel = getPixelAtY(x);
  
  if (!isEncodedColor(pixel, 25)) {
    if (prevIdx !== -1) {
      console.log(`  Run: x=${runStart}-${x-1} (${x-1-runStart+1}px) idx=${prevIdx}`);
    }
    prevIdx = -1;
    continue;
  }
  
  const idx = getIndex(pixel);
  
  if (prevIdx === -1) {
    runStart = x;
    prevIdx = idx;
  } else if (idx !== prevIdx) {
    console.log(`  Run: x=${runStart}-${x-1} (${x-1-runStart+1}px) idx=${prevIdx}`);
    transitions.push({ x, fromIdx: prevIdx, toIdx: idx });
    runStart = x;
    prevIdx = idx;
  }
}
if (prevIdx !== -1) {
  console.log(`  Run: x=${runStart}-${searchEnd-1} (${searchEnd-1-runStart+1}px) idx=${prevIdx}`);
}

console.log(`\nFound ${transitions.length} transitions:`);
for (const t of transitions) {
  console.log(`  x=${t.x}: ${t.fromIdx} → ${t.toIdx}`);
}

// Look for the index sequence pattern
console.log(`\nLooking for index sequence pattern [0→1, 1→2, 2→3, 3→4, 4→5, 5→6, 6→7]...`);

for (let i = 0; i <= transitions.length - 7; i++) {
  let matches = 0;
  const matchPattern: string[] = [];
  
  for (let j = 0; j < 7; j++) {
    const t = transitions[i + j];
    const expected = `${j}→${j+1}`;
    const actual = `${t.fromIdx}→${t.toIdx}`;
    
    if (t.fromIdx === j && t.toIdx === j + 1) {
      matches++;
      matchPattern.push(`✓${actual}`);
    } else {
      matchPattern.push(`✗${actual}(exp ${expected})`);
    }
  }
  
  if (matches >= 4) {
    console.log(`  At i=${i}: ${matches}/7 matches: ${matchPattern.join(', ')}`);
  }
}
