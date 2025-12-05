/**
 * Analyze segment alignment and pixel interpolation issues
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

// Use the found border row
const y = 428;
const startX = 93;
const segmentWidth = 6;

console.log('Analyzing segment alignment for the real Chrome 90% zoom screenshot');
console.log(`Row: y=${y}, startX=${startX}, segmentWidth=${segmentWidth}`);
console.log('');

// Expected index colors
// Index 0: (121, 121, 121) - all low
// Index 1: (145, 121, 121) - R high
// Index 2: (121, 145, 121) - G high  
// Index 3: (145, 145, 121) - R,G high
// Index 4: (121, 121, 145) - B high
// Index 5: (145, 121, 145) - R,B high
// Index 6: (121, 145, 145) - G,B high
// Index 7: (145, 145, 145) - all high

// Show continuous pixel values for the index region (segments 6-13)
const indexStartSeg = 6;
const indexStartX = startX + indexStartSeg * segmentWidth;

console.log(`Index region should start at x=${indexStartX}`);
console.log('\nContinuous pixel values from x=' + indexStartX + ':');

for (let x = indexStartX - 5; x < indexStartX + 8 * segmentWidth + 10; x++) {
  const p = getPixel(x, y);
  const segmentNumber = Math.floor((x - startX) / segmentWidth);
  const posInSegment = (x - startX) % segmentWidth;
  const expectedIndex = segmentNumber - 6; // Index sequence is segments 6-13
  
  // Determine what color this looks like
  const rBit = p.r > 133 ? 1 : 0;
  const gBit = p.g > 133 ? 1 : 0;
  const bBit = p.b > 133 ? 1 : 0;
  const detectedIdx = rBit | (gBit << 1) | (bBit << 2);
  
  let marker = '';
  if (posInSegment === Math.floor(segmentWidth / 2)) {
    marker = ' <-- CENTER';
  }
  
  if (x >= indexStartX && x < indexStartX + 8 * segmentWidth) {
    console.log(`  x=${x}: seg=${segmentNumber} pos=${posInSegment} RGB(${p.r.toString().padStart(3)}, ${p.g.toString().padStart(3)}, ${p.b.toString().padStart(3)}) detected=${detectedIdx} expected=${expectedIndex >= 0 && expectedIndex < 8 ? expectedIndex : '-'}${marker}`);
  }
}

// Now let's look at what the ORIGINAL encoding should produce
console.log('\n' + '='.repeat(60));
console.log('Expected pixel pattern for index sequence [0,1,2,3,4,5,6,7]:');
console.log('='.repeat(60));

const expectedColors = [
  { idx: 0, r: 121, g: 121, b: 121, desc: 'all low' },
  { idx: 1, r: 145, g: 121, b: 121, desc: 'R high' },
  { idx: 2, r: 121, g: 145, b: 121, desc: 'G high' },
  { idx: 3, r: 145, g: 145, b: 121, desc: 'R,G high' },
  { idx: 4, r: 121, g: 121, b: 145, desc: 'B high' },
  { idx: 5, r: 145, g: 121, b: 145, desc: 'R,B high' },
  { idx: 6, r: 121, g: 145, b: 145, desc: 'G,B high' },
  { idx: 7, r: 145, g: 145, b: 145, desc: 'all high' },
];

for (const c of expectedColors) {
  console.log(`  Index ${c.idx}: RGB(${c.r}, ${c.g}, ${c.b}) - ${c.desc}`);
}

// The actual values we're seeing in the screenshot
console.log('\n' + '='.repeat(60));
console.log('Actual pixel values at segment centers vs. expected:');
console.log('='.repeat(60));

for (let i = 0; i < 8; i++) {
  const segNum = 6 + i;
  const centerX = startX + segNum * segmentWidth + Math.floor(segmentWidth / 2);
  const p = getPixel(centerX, y);
  const expected = expectedColors[i];
  
  const rDiff = p.r - expected.r;
  const gDiff = p.g - expected.g;
  const bDiff = p.b - expected.b;
  
  console.log(`Index ${i}: expected RGB(${expected.r}, ${expected.g}, ${expected.b}) got RGB(${p.r}, ${p.g}, ${p.b}) diff=(${rDiff > 0 ? '+' : ''}${rDiff}, ${gDiff > 0 ? '+' : ''}${gDiff}, ${bDiff > 0 ? '+' : ''}${bDiff})`);
}

// Let's try a different sampling strategy - take average of 3 pixels around center
console.log('\n' + '='.repeat(60));
console.log('Multi-sample approach (3 samples per segment):');
console.log('='.repeat(60));

for (let i = 0; i < 8; i++) {
  const segNum = 6 + i;
  const segStart = startX + segNum * segmentWidth;
  const segEnd = segStart + segmentWidth;
  
  // Sample at 25%, 50%, 75% of segment
  const samples = [
    Math.floor(segStart + segmentWidth * 0.25),
    Math.floor(segStart + segmentWidth * 0.5),
    Math.floor(segStart + segmentWidth * 0.75),
  ];
  
  let rSum = 0, gSum = 0, bSum = 0;
  const pixels = samples.map(x => getPixel(x, y));
  for (const p of pixels) {
    rSum += p.r;
    gSum += p.g;
    bSum += p.b;
  }
  
  const avgR = Math.round(rSum / 3);
  const avgG = Math.round(gSum / 3);
  const avgB = Math.round(bSum / 3);
  
  // Voting approach
  const rVotes = pixels.filter(p => p.r > 133).length;
  const gVotes = pixels.filter(p => p.g > 133).length;
  const bVotes = pixels.filter(p => p.b > 133).length;
  
  const votedIdx = (rVotes >= 2 ? 1 : 0) | (gVotes >= 2 ? 2 : 0) | (bVotes >= 2 ? 4 : 0);
  
  const expected = expectedColors[i];
  console.log(`Index ${i}: samples at x=${samples.join(',')} -> avg=(${avgR}, ${avgG}, ${avgB}) votes=(${rVotes}, ${gVotes}, ${bVotes}) -> idx=${votedIdx} expected=${i} ${votedIdx === i ? '✓' : '✗'}`);
}
