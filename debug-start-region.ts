/**
 * Debug the start region pixels
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
const effectiveStartX = 87;
const pixelsPerSegment = 6;
const MID = 133;

console.log(`Debugging region around effectiveStartX=${effectiveStartX} at y=${y}`);
console.log(`Pixels per segment: ${pixelsPerSegment}`);
console.log('');

// Show pixels from x=80 to x=180
console.log('Continuous pixel scan:');
for (let x = 80; x <= 180; x++) {
  const p = getPixel(x, y);
  const rBit = p.r > MID ? 1 : 0;
  const gBit = p.g > MID ? 1 : 0;
  const bBit = p.b > MID ? 1 : 0;
  const idx = rBit | (gBit << 1) | (bBit << 2);
  
  // Calculate which segment this pixel belongs to
  const relX = x - effectiveStartX;
  const segNum = Math.floor(relX / pixelsPerSegment);
  const posInSeg = relX % pixelsPerSegment;
  const isCenter = posInSeg === Math.floor(pixelsPerSegment / 2);
  
  const encoded = isEncodedColor(p, 20);
  
  // Expected value for this segment
  let expected = '?';
  if (segNum >= 0 && segNum < 6) {
    // Start marker [1,1,1,0,1,2]
    expected = [1,1,1,0,1,2][segNum].toString();
  } else if (segNum >= 6 && segNum < 14) {
    // Index sequence [0,1,2,3,4,5,6,7]
    expected = (segNum - 6).toString();
  }
  
  let marker = '';
  if (isCenter && segNum >= 0 && segNum < 14) {
    marker = ` <-- seg ${segNum} CENTER (expected ${expected})`;
  }
  
  console.log(`x=${x.toString().padStart(3)}: RGB(${p.r.toString().padStart(3)}, ${p.g.toString().padStart(3)}, ${p.b.toString().padStart(3)}) idx=${idx} ${encoded ? '✓' : ' '} ${marker}`);
}
