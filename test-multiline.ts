import { chromium } from 'playwright';

async function testMultilineInput() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // Take initial screenshot
  console.log('Taking initial screenshot...');
  await page.screenshot({ path: '/workspace/test-artifacts/multiline-01-initial.png', fullPage: true });
  
  // Find textarea
  console.log('Looking for textarea...');
  const textarea = await page.locator('textarea').first();
  
  if (!await textarea.isVisible()) {
    console.log('Textarea not found, looking for text input...');
    const input = await page.locator('input[type="text"]').first();
    console.log('Input found:', await input.isVisible());
  }
  
  // Click on the textarea to focus it
  console.log('Clicking on textarea...');
  await textarea.click();
  await page.waitForTimeout(500);
  
  // Take screenshot after click
  await page.screenshot({ path: '/workspace/test-artifacts/multiline-02-focused.png', fullPage: true });
  
  // Type multi-line text
  console.log('Typing multi-line text...');
  await textarea.fill('First line\nSecond line\nThird line');
  await page.waitForTimeout(500);
  
  // Take screenshot with multi-line text
  console.log('Taking screenshot with multi-line text...');
  await page.screenshot({ path: '/workspace/test-artifacts/multiline-03-multiline-text.png', fullPage: true });
  
  // Get the textarea dimensions
  const boundingBox = await textarea.boundingBox();
  console.log('Textarea dimensions:', boundingBox);
  
  // Take a close-up screenshot of just the input area
  if (boundingBox) {
    await page.screenshot({ 
      path: '/workspace/test-artifacts/multiline-04-closeup.png',
      clip: {
        x: Math.max(0, boundingBox.x - 50),
        y: Math.max(0, boundingBox.y - 50),
        width: boundingBox.width + 100,
        height: boundingBox.height + 100
      }
    });
  }
  
  // Get the text content to verify
  const textContent = await textarea.inputValue();
  console.log('Text content in textarea:', JSON.stringify(textContent));
  console.log('Lines:', textContent.split('\n'));
  
  // Check if there's a canvas (encoded border)
  const canvas = await page.locator('canvas').first();
  if (await canvas.isVisible()) {
    const canvasBoundingBox = await canvas.boundingBox();
    console.log('Canvas (border) dimensions:', canvasBoundingBox);
    
    // Take screenshot of the canvas area
    if (canvasBoundingBox) {
      await page.screenshot({ 
        path: '/workspace/test-artifacts/multiline-05-canvas-border.png',
        clip: {
          x: Math.max(0, canvasBoundingBox.x - 20),
          y: Math.max(0, canvasBoundingBox.y - 20),
          width: canvasBoundingBox.width + 40,
          height: canvasBoundingBox.height + 40
        }
      });
    }
  }
  
  // Verify multi-line handling
  console.log('\n--- Test Results ---');
  console.log('Multi-line text entered successfully:', textContent.includes('\n'));
  console.log('Number of lines:', textContent.split('\n').length);
  console.log('Textarea height expanded:', boundingBox ? boundingBox.height > 50 : 'unknown');
  
  await browser.close();
  console.log('\nDone! Check screenshots in /workspace/test-artifacts/');
}

testMultilineInput().catch(console.error);
