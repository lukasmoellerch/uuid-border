/**
 * Investigation script to understand the difference between:
 * 1. CSS zoom + canvas.toDataURL() (current test approach)
 * 2. Real Playwright screenshot at different zoom levels
 * 3. What Chrome actually does
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ARTIFACTS_DIR = join(__dirname, 'test-artifacts');

async function investigate() {
  if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  const page = await context.newPage();

  try {
    // Go to the encoder page
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1000);

    // Get the UUID
    const uuidElement = page.locator('code').first();
    const originalUuid = await uuidElement.textContent();
    console.log('Original UUID:', originalUuid);

    // APPROACH 1: CSS zoom with canvas.toDataURL() (what the current test does)
    console.log('\n=== Approach 1: CSS zoom + canvas.toDataURL() ===');
    await page.evaluate(() => {
      document.body.style.zoom = '0.9';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(500);

    const canvasDataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas ? canvas.toDataURL('image/png') : null;
    });

    if (canvasDataUrl) {
      const base64Data = canvasDataUrl.replace(/^data:image\/png;base64,/, '');
      const canvasBuffer = Buffer.from(base64Data, 'base64');
      writeFileSync(join(ARTIFACTS_DIR, 'investigate-css-zoom-canvas.png'), canvasBuffer);
      console.log('Canvas data URL saved (this bypasses zoom scaling)');
      
      // Get canvas dimensions
      const canvasSize = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return canvas ? { width: canvas.width, height: canvas.height } : null;
      });
      console.log('Canvas internal size:', canvasSize);
    }

    // APPROACH 2: CSS zoom with Playwright screenshot (captures actual screen pixels)
    console.log('\n=== Approach 2: CSS zoom + Playwright screenshot ===');
    const inputContainer = page.locator('.relative.flex-1').first();
    const screenshotBuffer = await inputContainer.screenshot({ type: 'png' });
    writeFileSync(join(ARTIFACTS_DIR, 'investigate-css-zoom-screenshot.png'), screenshotBuffer);
    console.log('Playwright screenshot saved (captures scaled pixels)');

    // Get the actual rendered size
    const containerBox = await inputContainer.boundingBox();
    console.log('Container bounding box at 90% zoom:', containerBox);

    // Reset zoom
    await page.evaluate(() => {
      document.body.style.zoom = '1';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(500);

    // APPROACH 3: Use Playwright's native zoom via deviceScaleFactor
    console.log('\n=== Approach 3: New context with smaller viewport (simulating zoom out) ===');
    const context90 = await browser.newContext({
      // Simulate 90% zoom by making the viewport effectively smaller
      viewport: { width: Math.round(800 * 0.9), height: Math.round(600 * 0.9) },
    });
    const page90 = await context90.newPage();
    await page90.goto('http://localhost:3000');
    await page90.waitForLoadState('networkidle');
    await page90.waitForSelector('canvas');
    await page90.waitForTimeout(1000);

    const container90 = page90.locator('.relative.flex-1').first();
    const screenshot90 = await container90.screenshot({ type: 'png' });
    writeFileSync(join(ARTIFACTS_DIR, 'investigate-viewport-90-screenshot.png'), screenshot90);
    console.log('Viewport 90% screenshot saved');
    
    const box90 = await container90.boundingBox();
    console.log('Container box at 90% viewport:', box90);

    // APPROACH 4: Use deviceScaleFactor < 1 to simulate zoom out
    console.log('\n=== Approach 4: deviceScaleFactor = 0.9 (true zoom simulation) ===');
    const contextDPR = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 0.9,
    });
    const pageDPR = await contextDPR.newPage();
    await pageDPR.goto('http://localhost:3000');
    await pageDPR.waitForLoadState('networkidle');
    await pageDPR.waitForSelector('canvas');
    await pageDPR.waitForTimeout(1000);

    const containerDPR = pageDPR.locator('.relative.flex-1').first();
    const screenshotDPR = await containerDPR.screenshot({ type: 'png' });
    writeFileSync(join(ARTIFACTS_DIR, 'investigate-dpr-90-screenshot.png'), screenshotDPR);
    console.log('DPR 0.9 screenshot saved');
    
    const boxDPR = await containerDPR.boundingBox();
    console.log('Container box at DPR 0.9:', boxDPR);

    // Now try to decode each screenshot
    console.log('\n=== Decoding test ===');
    
    // Upload each screenshot to the decode page
    const testFiles = [
      'investigate-css-zoom-canvas.png',
      'investigate-css-zoom-screenshot.png',
      'investigate-viewport-90-screenshot.png',
      'investigate-dpr-90-screenshot.png',
    ];

    for (const filename of testFiles) {
      const testPage = await context.newPage();
      await testPage.goto('http://localhost:3000/decode');
      await testPage.waitForLoadState('networkidle');

      const fileInput = testPage.locator('input[type="file"]');
      await fileInput.setInputFiles(join(ARTIFACTS_DIR, filename));

      // Wait for result
      await testPage.waitForTimeout(2000);

      const discovered = await testPage.locator('text=Discovered').isVisible();
      if (discovered) {
        const decodedUuid = await testPage.locator('.bg-\\[var\\(--surface\\)\\] code').first().textContent();
        const matches = decodedUuid === originalUuid;
        console.log(`${filename}: DECODED - ${decodedUuid} ${matches ? '✅ MATCH' : '❌ MISMATCH'}`);
      } else {
        const debugInfo = await testPage.locator('.mono.text-xs').textContent();
        console.log(`${filename}: FAILED to decode - ${debugInfo?.substring(0, 100)}`);
      }

      await testPage.close();
    }

    await context90.close();
    await contextDPR.close();

  } finally {
    await browser.close();
  }
}

investigate().catch(console.error);
