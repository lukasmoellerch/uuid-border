import { test, expect } from '@playwright/test';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const ARTIFACTS_DIR = join(__dirname, '../test-artifacts');

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

/**
 * End-to-end tests for the encode-decode flow via the web app.
 * 
 * These tests verify that:
 * 1. A UUID is displayed on the encoder page
 * 2. The UUID is encoded in the border of the input component
 * 3. A screenshot of the component can be uploaded to the decoder page
 * 4. The decoder correctly extracts the UUID from the uploaded screenshot
 */
test.describe('Encode-Decode Flow via Web App', () => {
  test('should encode UUID in border, screenshot it, and decode via upload', async ({ page }) => {
    // Step 1: Go to the encoder page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for the canvas to render (the encoded border)
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500); // Allow canvas to fully render

    // Step 2: Get the displayed UUID from the page
    const uuidElement = page.locator('code').first();
    const originalUuid = await uuidElement.textContent();
    expect(originalUuid).toBeTruthy();
    expect(originalUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Step 3: Take a screenshot of the input container (with encoded border)
    const inputContainer = page.locator('.relative.flex-1').first();
    const screenshotBuffer = await inputContainer.screenshot({ type: 'png' });
    
    // Save screenshot for debugging
    const screenshotPath = join(ARTIFACTS_DIR, 'e2e-encode-decode-screenshot.png');
    writeFileSync(screenshotPath, screenshotBuffer);

    // Step 4: Navigate to the decoder page
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    // Step 5: Upload the screenshot via file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: screenshotBuffer,
    });

    // Step 6: Wait for processing and check results
    // Wait for the decoded UUID to appear
    await expect(page.locator('text=Discovered')).toBeVisible({ timeout: 10000 });
    
    // Get the decoded UUID
    const decodedUuidElement = page.locator('.bg-\\[var\\(--surface\\)\\] code').first();
    const decodedUuid = await decodedUuidElement.textContent();

    // Step 7: Verify the decoded UUID matches the original
    expect(decodedUuid).toBe(originalUuid);
  });

  test('should work with regenerated UUID', async ({ page }) => {
    // Go to the encoder page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    // Get the initial UUID
    const uuidElement = page.locator('code').first();
    const initialUuid = await uuidElement.textContent();

    // Click the regenerate button (the refresh icon button)
    const regenerateButton = page.locator('button[title="Generate new UUID"]');
    await regenerateButton.click();
    await page.waitForTimeout(500); // Wait for canvas to re-render

    // Get the new UUID
    const newUuid = await uuidElement.textContent();
    expect(newUuid).not.toBe(initialUuid);
    expect(newUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Screenshot the new border
    const inputContainer = page.locator('.relative.flex-1').first();
    const screenshotBuffer = await inputContainer.screenshot({ type: 'png' });

    // Navigate to decoder and upload
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: screenshotBuffer,
    });

    // Verify the new UUID is decoded correctly
    await expect(page.locator('text=Discovered')).toBeVisible({ timeout: 10000 });
    
    const decodedUuidElement = page.locator('.bg-\\[var\\(--surface\\)\\] code').first();
    const decodedUuid = await decodedUuidElement.textContent();

    expect(decodedUuid).toBe(newUuid);
  });

  test('should navigate between encode and decode pages', async ({ page }) => {
    // Start at encoder
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify we're on the encode page
    await expect(page.locator('h1:has-text("Encode")')).toBeVisible();

    // Click the Decode link
    await page.click('text=Decode →');
    await page.waitForLoadState('networkidle');

    // Verify we're on the decode page
    await expect(page.locator('h1:has-text("Decode")')).toBeVisible();

    // Click the Encode link to go back
    await page.click('text=← Encode');
    await page.waitForLoadState('networkidle');

    // Verify we're back on the encode page
    await expect(page.locator('h1:has-text("Encode")')).toBeVisible();
  });

  test('should show error state when uploading image without UUID border', async ({ page }) => {
    // Go to decoder page
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    // Create a simple colored image buffer (no UUID encoded)
    // 100x100 solid blue image
    const { PNG } = await import('pngjs');
    const png = new PNG({ width: 100, height: 100 });
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const idx = (y * 100 + x) * 4;
        png.data[idx] = 0;     // R
        png.data[idx + 1] = 0; // G
        png.data[idx + 2] = 255; // B
        png.data[idx + 3] = 255; // A
      }
    }
    const blueImageBuffer = PNG.sync.write(png);

    // Upload the image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'blue.png',
      mimeType: 'image/png',
      buffer: blueImageBuffer,
    });

    // Wait for processing
    await page.waitForTimeout(2000);

    // Should show "No UUIDs found" or similar debug info
    // and NOT show the "Discovered" text
    await expect(page.locator('text=Discovered')).not.toBeVisible();
    
    // Should show some debug/error text
    const debugText = page.locator('.mono.text-xs');
    await expect(debugText).toBeVisible();
  });

  test('should handle full page screenshot and still decode', async ({ page }) => {
    // Go to encoder page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    // Get the UUID
    const uuidElement = page.locator('code').first();
    const originalUuid = await uuidElement.textContent();

    // Take a FULL PAGE screenshot (not just the component)
    const fullPageScreenshot = await page.screenshot({ type: 'png', fullPage: true });
    
    // Save for debugging
    writeFileSync(join(ARTIFACTS_DIR, 'e2e-full-page-screenshot.png'), fullPageScreenshot);

    // Navigate to decoder and upload
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'fullpage.png',
      mimeType: 'image/png',
      buffer: fullPageScreenshot,
    });

    // Verify the UUID is decoded correctly from the full page
    await expect(page.locator('text=Discovered')).toBeVisible({ timeout: 10000 });
    
    const decodedUuidElement = page.locator('.bg-\\[var\\(--surface\\)\\] code').first();
    const decodedUuid = await decodedUuidElement.textContent();

    expect(decodedUuid).toBe(originalUuid);
  });
});

/**
 * Tests for different browser zoom levels
 * 
 * CSS zoom simulates real browser zoom behavior. When zoomed out, the component
 * renders at a smaller visual size, resulting in fewer pixels in screenshots.
 * 
 * The encoding needs at least ~450 pixels width to work reliably (148 segments * 3 px).
 * At 90% zoom on a default viewport, the component is ~450px wide (edge case).
 * At 80% zoom, it's ~400px wide which may not decode reliably.
 * 
 * These tests verify the encode-decode flow still works at various zoom levels.
 */
test.describe('Encode-Decode at Different Zoom Levels', () => {
  test('should decode correctly at 90% browser zoom', async ({ page }) => {
    // Go to encoder page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    // Get the UUID before zooming
    const uuidElement = page.locator('code').first();
    const originalUuid = await uuidElement.textContent();
    expect(originalUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Simulate browser zoom to 90%
    await page.evaluate(() => {
      document.body.style.zoom = '0.9';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(1000);

    // Get the canvas as a data URL directly (full internal resolution)
    const canvasDataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas ? canvas.toDataURL('image/png') : null;
    });
    
    expect(canvasDataUrl).toBeTruthy();
    
    // Convert data URL to buffer
    const base64Data = canvasDataUrl!.replace(/^data:image\/png;base64,/, '');
    const screenshotBuffer = Buffer.from(base64Data, 'base64');
    writeFileSync(join(ARTIFACTS_DIR, 'e2e-zoom-90-canvas.png'), screenshotBuffer);

    // Navigate to decoder and upload
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'canvas-90.png',
      mimeType: 'image/png',
      buffer: screenshotBuffer,
    });

    // Verify the UUID is decoded correctly
    await expect(page.locator('text=Discovered')).toBeVisible({ timeout: 10000 });
    
    const decodedUuidElement = page.locator('.bg-\\[var\\(--surface\\)\\] code').first();
    const decodedUuid = await decodedUuidElement.textContent();

    expect(decodedUuid).toBe(originalUuid);
  });

  test('should decode correctly at 80% browser zoom', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    const uuidElement = page.locator('code').first();
    const originalUuid = await uuidElement.textContent();
    expect(originalUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Simulate browser zoom to 80%
    await page.evaluate(() => {
      document.body.style.zoom = '0.8';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(1000);

    // Get the canvas as a data URL directly (full internal resolution)
    const canvasDataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas ? canvas.toDataURL('image/png') : null;
    });
    
    expect(canvasDataUrl).toBeTruthy();
    
    // Convert data URL to buffer
    const base64Data = canvasDataUrl!.replace(/^data:image\/png;base64,/, '');
    const screenshotBuffer = Buffer.from(base64Data, 'base64');
    writeFileSync(join(ARTIFACTS_DIR, 'e2e-zoom-80-canvas.png'), screenshotBuffer);

    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'canvas-80.png',
      mimeType: 'image/png',
      buffer: screenshotBuffer,
    });

    await expect(page.locator('text=Discovered')).toBeVisible({ timeout: 10000 });
    
    const decodedUuidElement = page.locator('.bg-\\[var\\(--surface\\)\\] code').first();
    const decodedUuid = await decodedUuidElement.textContent();

    expect(decodedUuid).toBe(originalUuid);
  });
});

/**
 * Tests for the decode page UI interactions
 */
test.describe('Decode Page UI', () => {
  test('should show drop zone initially', async ({ page }) => {
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    // Verify drop zone is visible
    await expect(page.locator('text=Drop image or paste from clipboard')).toBeVisible();
  });

  test('should show image preview after upload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    // Screenshot the component
    const inputContainer = page.locator('.relative.flex-1').first();
    const screenshotBuffer = await inputContainer.screenshot({ type: 'png' });

    // Go to decoder
    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    // Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: screenshotBuffer,
    });

    // Verify image preview is shown
    const imagePreview = page.locator('img[alt="Screenshot"]');
    await expect(imagePreview).toBeVisible({ timeout: 10000 });
  });

  test('should have working copy button for decoded UUID', async ({ page }) => {
    // Setup: encode -> screenshot -> decode
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);

    const inputContainer = page.locator('.relative.flex-1').first();
    const screenshotBuffer = await inputContainer.screenshot({ type: 'png' });

    await page.goto('/decode');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: screenshotBuffer,
    });

    await expect(page.locator('text=Discovered')).toBeVisible({ timeout: 10000 });

    // Verify the Copy button exists and is clickable
    const copyButton = page.locator('button:has-text("Copy")');
    await expect(copyButton).toBeVisible();
    
    // Click should not throw (actual clipboard may not work in test env)
    await copyButton.click();
  });
});
