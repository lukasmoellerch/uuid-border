import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { join } from 'path';
import jpeg from 'jpeg-js';
import { RGB, TOTAL_SEGMENTS, INDEX_COLORS } from './src/lib/uuid-border';

// Compare original PNG to JPEG compressed versions
function analyze() {
  // Check PNG original
  const pngPath = join(__dirname, 'test-artifacts', '00-original.png');
  const pngData = readFileSync(pngPath);
  const png = PNG.sync.read(pngData);
  console.log(`\nOriginal PNG: ${png.width}x${png.height}`);
  console.log(`  Pixels per segment: ${png.width / TOTAL_SEGMENTS}`);
  
  // Sample first few pixels
  const getPixelPng = (x: number, y: number = 0): RGB => {
    const idx = (y * png.width + x) * 4;
    return {
      r: png.data[idx],
      g: png.data[idx + 1],
      b: png.data[idx + 2],
    };
  };
  
  console.log(`  First 10 pixels at y=1:`);
  for (let x = 0; x < 10; x++) {
    const p = getPixelPng(x, 1);
    console.log(`    x=${x}: (${p.r}, ${p.g}, ${p.b})`);
  }
  
  // Now check JPEG
  const jpegPath = join(__dirname, 'test-artifacts', '11-jpeg-q90.jpg');
  const jpegData = readFileSync(jpegPath);
  const jpg = jpeg.decode(jpegData, { useTArray: true });
  console.log(`\nJPEG Q90: ${jpg.width}x${jpg.height}`);
  
  const getPixelJpg = (x: number, y: number = 0): RGB => {
    const idx = (y * jpg.width + x) * 4;
    return {
      r: jpg.data[idx],
      g: jpg.data[idx + 1],
      b: jpg.data[idx + 2],
    };
  };
  
  console.log(`  First 10 pixels at y=1:`);
  for (let x = 0; x < 10; x++) {
    const p = getPixelJpg(x, 1);
    console.log(`    x=${x}: (${p.r}, ${p.g}, ${p.b})`);
  }
  
  console.log(`\n  Expected INDEX_COLORS:`);
  for (let i = 0; i < 8; i++) {
    const c = INDEX_COLORS[i];
    console.log(`    ${i}: (${c.r}, ${c.g}, ${c.b})`);
  }
  
  // Sample at segment centers
  const pps = png.width / TOTAL_SEGMENTS;
  console.log(`\n  PNG segment centers (first 8 index colors at segments 6-13):`);
  for (let s = 6; s < 14; s++) {
    const x = Math.floor(s * pps + pps / 2);
    const p = getPixelPng(x, 1);
    const expected = INDEX_COLORS[s - 6];
    console.log(`    seg ${s} (x=${x}): (${p.r}, ${p.g}, ${p.b}) expected (${expected.r}, ${expected.g}, ${expected.b})`);
  }
  
  console.log(`\n  JPEG segment centers (first 8 index colors at segments 6-13):`);
  for (let s = 6; s < 14; s++) {
    const x = Math.floor(s * pps + pps / 2);
    const p = getPixelJpg(x, 1);
    const expected = INDEX_COLORS[s - 6];
    console.log(`    seg ${s} (x=${x}): (${p.r}, ${p.g}, ${p.b}) expected (${expected.r}, ${expected.g}, ${expected.b})`);
  }
}

analyze();
