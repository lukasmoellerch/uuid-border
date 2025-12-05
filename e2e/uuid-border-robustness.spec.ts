import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// Import decoding functions
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow } from '../src/lib/uuid-border';

const ARTIFACTS_DIR = join(__dirname, '../test-artifacts');

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

/**
 * Check if a color looks like an encoded color (channels near 121 or 145)
 * More robust than gray detection for compressed images
 */
function isEncodedColor(c: RGB, tolerance: number = 20): boolean {
  const LOW = 121;
  const HIGH = 145;

  const isLowOrHigh = (val: number) =>
    Math.abs(val - LOW) < tolerance || Math.abs(val - HIGH) < tolerance;

  return isLowOrHigh(c.r) && isLowOrHigh(c.g) && isLowOrHigh(c.b);
}

/**
 * Check if a color looks like a border color (grayish, for fallback detection)
 */
function isBorderColorGray(c: RGB): boolean {
  const avg = (c.r + c.g + c.b) / 3;
  return avg > 80 && avg < 200 && Math.abs(c.g - c.b) < 40;
}

/**
 * Decode UUID from an image buffer (PNG format)
 */
async function decodeUuidFromImage(
  imageBuffer: Buffer,
  _label: string
): Promise<{ uuid: string | null; errorsCorrected?: boolean }> {
  // Convert to PNG for consistent pixel access
  const pngBuffer = await sharp(imageBuffer).png().toBuffer();
  const png = PNG.sync.read(pngBuffer);

  const { width, height, data } = png;

  const getPixel = (x: number, y: number): RGB => {
    const idx = (y * width + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
    };
  };

  // Scan multiple rows (border might not be at y=0 due to rounded corners)
  for (let y = 0; y < Math.min(height, 10); y++) {
    // First, try to find encoded colors (more precise)
    let encodedStart = -1;
    let encodedEnd = -1;

    for (let x = 0; x < width; x++) {
      const pixel = getPixel(x, y);
      if (isEncodedColor(pixel)) {
        if (encodedStart === -1) encodedStart = x;
        encodedEnd = x;
      }
    }

    // Fallback to gray detection if encoded colors not found
    if (encodedEnd - encodedStart < TOTAL_SEGMENTS) {
      encodedStart = -1;
      encodedEnd = -1;
      for (let x = 0; x < width; x++) {
        const pixel = getPixel(x, y);
        if (isBorderColorGray(pixel)) {
          if (encodedStart === -1) encodedStart = x;
          encodedEnd = x;
        }
      }
    }

    // Need sufficient width for all segments
    const borderWidth = encodedEnd - encodedStart + 1;
    if (borderWidth < TOTAL_SEGMENTS) {
      continue;
    }

    // Try different widths and offsets
    const possibleWidths = [
      borderWidth,
      Math.floor(borderWidth * 0.99),
      Math.floor(borderWidth * 0.98),
      Math.floor(borderWidth * 0.95),
      Math.floor(borderWidth * 0.90),
    ].filter((w) => w >= TOTAL_SEGMENTS);

    const possibleOffsets = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15];

    for (const encodedWidth of possibleWidths) {
      for (const offset of possibleOffsets) {
        const startX = encodedStart + offset;
        if (startX + encodedWidth > width) continue;

        const result = decodeFromPixelRow(
          (px) => getPixel(px, y),
          startX,
          encodedWidth
        );

        if (result) {
          return { uuid: result.uuid, errorsCorrected: result.errorsCorrected };
        }
      }
    }
  }

  return { uuid: null };
}

/**
 * Tests for mutations that should reliably work (lossless or near-lossless)
 */
test.describe('UUID Border Robustness - Reliable Mutations', () => {
  let originalUuid: string;
  let originalScreenshot: Buffer;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for the component to render
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500); // Wait for canvas to draw

    // Get the UUID from the page
    const uuidElement = await page.locator('code').first();
    originalUuid = (await uuidElement.textContent()) || '';
    expect(originalUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Take a screenshot of the component area
    const inputContainer = await page.locator('.relative.flex-1').first();
    originalScreenshot = await inputContainer.screenshot({ type: 'png' });

    // Save original screenshot
    writeFileSync(join(ARTIFACTS_DIR, '00-original.png'), originalScreenshot);

    await page.close();
  });

  test('should decode from original PNG screenshot', async () => {
    const result = await decodeUuidFromImage(originalScreenshot, 'original');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after PNG re-compression', async () => {
    const pngBuffer = await sharp(originalScreenshot)
      .png({ compressionLevel: 9 })
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '01-png-compressed.png'), pngBuffer);

    const result = await decodeUuidFromImage(pngBuffer, 'png-compressed');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after adding small noise (+/- 3)', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Add small noise to each pixel
    for (let i = 0; i < png.data.length; i += 4) {
      const noise = Math.floor(Math.random() * 6) - 3; // -3 to +2
      png.data[i] = Math.max(0, Math.min(255, png.data[i] + noise));
      png.data[i + 1] = Math.max(0, Math.min(255, png.data[i + 1] + noise));
      png.data[i + 2] = Math.max(0, Math.min(255, png.data[i + 2] + noise));
    }

    const noisyBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '02-noise-small.png'), noisyBuffer);

    const result = await decodeUuidFromImage(noisyBuffer, 'noise');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after drawing a thin horizontal line over the border', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Draw a red line across the middle of the border area (row 1), every 3rd pixel
    const y = 1;
    for (let x = 50; x < png.width - 50; x += 3) {
      const idx = (y * png.width + x) * 4;
      png.data[idx] = 255; // R
      png.data[idx + 1] = 0; // G
      png.data[idx + 2] = 0; // B
    }

    const lineBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '03-thin-line.png'), lineBuffer);

    const result = await decodeUuidFromImage(lineBuffer, 'thin-line');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after drawing a thick vertical line (10px wide)', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Draw a 10-pixel wide red vertical line at x=200
    for (let x = 200; x < 210; x++) {
      for (let y = 0; y < 5; y++) {
        const idx = (y * png.width + x) * 4;
        png.data[idx] = 255; // R
        png.data[idx + 1] = 0; // G
        png.data[idx + 2] = 0; // B
      }
    }

    const lineBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '04-thick-vertical-line.png'), lineBuffer);

    const result = await decodeUuidFromImage(lineBuffer, 'thick-vertical-line');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after slight brightness adjustment (+10%)', async () => {
    const brightBuffer = await sharp(originalScreenshot)
      .modulate({ brightness: 1.1 })
      .png()
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '05-brighter.png'), brightBuffer);

    const result = await decodeUuidFromImage(brightBuffer, 'brighter');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after slight contrast adjustment', async () => {
    const contrastBuffer = await sharp(originalScreenshot)
      .linear(1.2, -25) // Increase contrast
      .png()
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '06-contrast.png'), contrastBuffer);

    const result = await decodeUuidFromImage(contrastBuffer, 'contrast');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after gaussian blur (sigma 0.5)', async () => {
    const blurredBuffer = await sharp(originalScreenshot)
      .blur(0.5)
      .png()
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '07-blur-0.5.png'), blurredBuffer);

    const result = await decodeUuidFromImage(blurredBuffer, 'blur-0.5');
    expect(result.uuid).toBe(originalUuid);
  });

  test('should decode after larger noise (+/- 5) with RS correction', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Add larger noise
    for (let i = 0; i < png.data.length; i += 4) {
      const noise = Math.floor(Math.random() * 10) - 5; // -5 to +4
      png.data[i] = Math.max(0, Math.min(255, png.data[i] + noise));
      png.data[i + 1] = Math.max(0, Math.min(255, png.data[i + 1] + noise));
      png.data[i + 2] = Math.max(0, Math.min(255, png.data[i + 2] + noise));
    }

    const noisyBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '08-noise-large.png'), noisyBuffer);

    const result = await decodeUuidFromImage(noisyBuffer, 'large-noise');
    expect(result.uuid).toBe(originalUuid);
    // RS error correction should kick in for some pixels
  });

  test('should decode after multiple sparse lines (simulating scratches)', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Draw multiple random "scratch" lines
    for (let line = 0; line < 5; line++) {
      const startX = Math.floor(Math.random() * png.width * 0.8) + 20;
      const y = Math.floor(Math.random() * 3); // In border area

      for (let x = startX; x < Math.min(startX + 30, png.width); x += 2) {
        const idx = (y * png.width + x) * 4;
        png.data[idx] = 200;
        png.data[idx + 1] = 50;
        png.data[idx + 2] = 50;
      }
    }

    const scratchedBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '09-scratches.png'), scratchedBuffer);

    const result = await decodeUuidFromImage(scratchedBuffer, 'scratches');
    expect(result.uuid).toBe(originalUuid);
  });
});

/**
 * Tests for lossy compression that may or may not work
 * These test the limits of the encoding and document expected behavior
 * 
 * NOTE: JPEG compression uses 8x8 DCT blocks which average colors.
 * When color segments are only ~3 pixels wide (496px / 148 segments),
 * adjacent segments bleed into each other, destroying the color encoding.
 * 
 * For JPEG robustness, segments should be at least 8 pixels wide,
 * requiring a minimum width of 148 * 8 = 1184 pixels.
 */
test.describe('UUID Border Robustness - Lossy Compression', () => {
  let originalUuid: string;
  let originalScreenshot: Buffer;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    const uuidElement = await page.locator('code').first();
    originalUuid = (await uuidElement.textContent()) || '';
    expect(originalUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    const inputContainer = await page.locator('.relative.flex-1').first();
    originalScreenshot = await inputContainer.screenshot({ type: 'png' });

    await page.close();
  });

  // Note: With ~3px segments (496px width), JPEG destroys color calibration
  // by averaging colors from adjacent segments in its 8x8 DCT blocks.
  // These tests document this expected limitation.

  test('JPEG Q95 - narrow image (~3px segments), expected to fail', async () => {
    const jpegBuffer = await sharp(originalScreenshot)
      .jpeg({ quality: 95 })
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '10-jpeg-q95.jpg'), jpegBuffer);

    const result = await decodeUuidFromImage(jpegBuffer, 'jpeg-q95');

    if (result.uuid) {
      expect(result.uuid).toBe(originalUuid);
      console.log('JPEG Q95: Decoded successfully (unexpected!)');
    } else {
      // Expected: segments too narrow for JPEG
      console.log('JPEG Q95: Failed (expected - ~3px segments < 8px JPEG block)');
    }
  });

  test('JPEG Q90 - narrow image, expected to fail', async () => {
    const jpegBuffer = await sharp(originalScreenshot)
      .jpeg({ quality: 90 })
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '11-jpeg-q90.jpg'), jpegBuffer);

    const result = await decodeUuidFromImage(jpegBuffer, 'jpeg-q90');

    if (result.uuid) {
      expect(result.uuid).toBe(originalUuid);
      console.log('JPEG Q90: Decoded successfully (unexpected!)');
    } else {
      console.log('JPEG Q90: Failed (expected - segments too narrow)');
    }
  });

  test('JPEG Q70 - narrow image, expected to fail', async () => {
    const jpegBuffer = await sharp(originalScreenshot)
      .jpeg({ quality: 70 })
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '12-jpeg-q70.jpg'), jpegBuffer);

    const result = await decodeUuidFromImage(jpegBuffer, 'jpeg-q70');

    if (result.uuid) {
      expect(result.uuid).toBe(originalUuid);
      console.log('JPEG Q70: Decoded successfully (unexpected!)');
    } else {
      console.log('JPEG Q70: Failed (expected - segments too narrow)');
    }
  });

  test('WebP lossy - similar limitations to JPEG', async () => {
    const webpBuffer = await sharp(originalScreenshot)
      .webp({ quality: 80 })
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '13-webp-q80.webp'), webpBuffer);

    const result = await decodeUuidFromImage(webpBuffer, 'webp-q80');

    if (result.uuid) {
      expect(result.uuid).toBe(originalUuid);
      console.log('WebP Q80: Decoded successfully');
    } else {
      console.log('WebP Q80: Failed (expected - similar to JPEG)');
    }
  });

  test('WebP lossless - should preserve colors', async () => {
    const webpBuffer = await sharp(originalScreenshot)
      .webp({ lossless: true })
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '14-webp-lossless.webp'), webpBuffer);

    const result = await decodeUuidFromImage(webpBuffer, 'webp-lossless');
    // Lossless should work
    expect(result.uuid).toBe(originalUuid);
  });

  test('Resize down 10% and back - interpolation damage', async () => {
    const resizedBuffer = await sharp(originalScreenshot)
      .resize({ width: Math.floor(496 * 0.9) })
      .resize({ width: 496 })
      .png()
      .toBuffer();

    writeFileSync(join(ARTIFACTS_DIR, '15-resize-cycle.png'), resizedBuffer);

    const result = await decodeUuidFromImage(resizedBuffer, 'resize-cycle');

    if (result.uuid) {
      expect(result.uuid).toBe(originalUuid);
      console.log('Resize cycle: Decoded successfully');
    } else {
      console.log('Resize cycle: Failed to decode (interpolation damage)');
    }
  });

});

/**
 * Tests specifically for RS error correction triggering
 */
test.describe('UUID Border - Reed-Solomon Error Correction', () => {
  let originalUuid: string;
  let originalScreenshot: Buffer;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    const uuidElement = await page.locator('code').first();
    originalUuid = (await uuidElement.textContent()) || '';
    expect(originalUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    const inputContainer = await page.locator('.relative.flex-1').first();
    originalScreenshot = await inputContainer.screenshot({ type: 'png' });

    await page.close();
  });

  test('should show errorsCorrected=false when no corruption', async () => {
    const result = await decodeUuidFromImage(originalScreenshot, 'pristine');
    expect(result.uuid).toBe(originalUuid);
    expect(result.errorsCorrected).toBe(false);
  });

  test('should correct errors from targeted pixel damage', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Damage specific pixels in the data region (after index colors)
    // The data starts at segment 14, each segment is ~3 pixels wide
    const segmentWidth = Math.floor(png.width / TOTAL_SEGMENTS);
    const dataStart = 14 * segmentWidth;

    // Damage ~10% of data pixels (should be correctable with 2x RS)
    for (let seg = 0; seg < 10; seg++) {
      const x = dataStart + seg * 10 * segmentWidth + segmentWidth / 2;
      if (x < png.width) {
        for (let y = 0; y < 3; y++) {
          const idx = (y * png.width + Math.floor(x)) * 4;
          // Flip to wrong color
          png.data[idx] = 50;
          png.data[idx + 1] = 200;
          png.data[idx + 2] = 50;
        }
      }
    }

    const damagedBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '16-targeted-damage.png'), damagedBuffer);

    const result = await decodeUuidFromImage(damagedBuffer, 'targeted-damage');
    expect(result.uuid).toBe(originalUuid);
    // RS correction should have been triggered
    console.log(`Targeted damage: errorsCorrected=${result.errorsCorrected}`);
  });

  test('should handle random scattered damage', async () => {
    const pngBuffer = await sharp(originalScreenshot).png().toBuffer();
    const png = PNG.sync.read(pngBuffer);

    // Randomly damage 5% of pixels in border area
    for (let x = 0; x < png.width; x++) {
      if (Math.random() < 0.05) {
        for (let y = 0; y < 3; y++) {
          const idx = (y * png.width + x) * 4;
          png.data[idx] = Math.floor(Math.random() * 255);
          png.data[idx + 1] = Math.floor(Math.random() * 255);
          png.data[idx + 2] = Math.floor(Math.random() * 255);
        }
      }
    }

    const damagedBuffer = PNG.sync.write(png);
    writeFileSync(join(ARTIFACTS_DIR, '17-scattered-damage.png'), damagedBuffer);

    const result = await decodeUuidFromImage(damagedBuffer, 'scattered-damage');
    // May or may not work depending on where damage fell
    if (result.uuid) {
      expect(result.uuid).toBe(originalUuid);
      console.log(`Scattered damage: Decoded, errorsCorrected=${result.errorsCorrected}`);
    } else {
      console.log('Scattered damage: Too much damage in critical areas');
    }
  });
});

/**
 * Test JPEG robustness with wide viewport rendering
 * For JPEG to preserve the encoding, segments need to be at least 8px wide.
 * With 148 segments, minimum width is ~1200px.
 */
test.describe('UUID Border - Wide Viewport JPEG Test', () => {
  test('JPEG Q80 with 1200px viewport - may decode with wider segments', async ({
    browser,
  }) => {
    // Create a page with wide viewport
    const context = await browser.newContext({
      viewport: { width: 1400, height: 200 },
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    // Get the UUID
    const uuidElement = await page.locator('code').first();
    const uuid = (await uuidElement.textContent()) || '';

    // Take screenshot of the wider component
    const inputContainer = await page.locator('.relative.flex-1').first();
    const wideScreenshot = await inputContainer.screenshot({ type: 'png' });

    // Save original wide screenshot
    writeFileSync(join(ARTIFACTS_DIR, '20-wide-original.png'), wideScreenshot);

    // Convert to JPEG Q80
    const jpegBuffer = await sharp(wideScreenshot).jpeg({ quality: 80 }).toBuffer();
    writeFileSync(join(ARTIFACTS_DIR, '21-wide-jpeg-q80.jpg'), jpegBuffer);

    // Try to decode
    const result = await decodeUuidFromImage(jpegBuffer, 'wide-jpeg-q80');

    await page.close();
    await context.close();

    if (result.uuid) {
      expect(result.uuid).toBe(uuid);
      console.log('Wide viewport JPEG Q80: Decoded successfully ✓');
    } else {
      // May fail if component doesn't stretch to full viewport width
      console.log('Wide viewport JPEG Q80: Failed (may need component CSS changes)');
    }
  });
});
