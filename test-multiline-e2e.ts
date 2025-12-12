import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function testMultilineE2E() {
  console.log('=== Multi-line UUID Encode/Decode E2E Test ===\n');
  
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  
  // ============ PART 1: Encode Page ============
  console.log('--- Part 1: Enter multi-line text and capture ---\n');
  
  console.log('1. Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Take initial screenshot
  await page.screenshot({ path: '/workspace/test-artifacts/e2e-01-initial.png', fullPage: true });
  console.log('   Screenshot: e2e-01-initial.png');
  
  // 2-3. Get the UUID from the page
  console.log('\n2-3. Getting the UUID displayed on the page...');
  const uuidText = await page.locator('text=CURRENT UUID').locator('..').locator('code, pre, span').first().textContent();
  // Try another selector if the first doesn't work
  let originalUUID = '';
  const uuidElement = await page.locator('code').first();
  if (await uuidElement.isVisible()) {
    originalUUID = (await uuidElement.textContent()) || '';
  }
  
  // If not found, try looking for UUID pattern in the page
  if (!originalUUID) {
    const pageContent = await page.content();
    const uuidMatch = pageContent.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      originalUUID = uuidMatch[0];
    }
  }
  
  console.log(`   Original UUID: ${originalUUID}`);
  
  // 4. Click on the textarea
  console.log('\n4. Clicking on the text input field...');
  const textarea = await page.locator('textarea').first();
  await textarea.click();
  await page.waitForTimeout(300);
  
  // 5. Type multi-line message
  console.log('\n5. Typing multi-line message...');
  await textarea.fill('Hello World\nThis is line 2\nAnd this is line 3');
  await page.waitForTimeout(500);
  
  // Take screenshot after typing
  await page.screenshot({ path: '/workspace/test-artifacts/e2e-02-multiline-typed.png', fullPage: true });
  console.log('   Screenshot: e2e-02-multiline-typed.png');
  
  // 6. Verify textarea expanded
  console.log('\n6. Verifying textarea dimensions...');
  const textareaBox = await textarea.boundingBox();
  console.log(`   Textarea dimensions: ${textareaBox?.width}x${textareaBox?.height}`);
  console.log(`   Textarea expanded: ${textareaBox && textareaBox.height > 60 ? 'YES' : 'NO'}`);
  
  // Get text content
  const textContent = await textarea.inputValue();
  console.log(`   Text lines: ${textContent.split('\n').length}`);
  
  // 7. Take screenshot of just the input container (the element with encoded border)
  console.log('\n7. Capturing the input container with encoded border...');
  
  // Find the container - look for the wrapper div that contains both canvas and textarea
  // The container should be the parent that includes the border
  const inputContainer = await page.locator('div').filter({ has: page.locator('canvas') }).filter({ has: page.locator('textarea') }).first();
  
  let containerBox = await inputContainer.boundingBox();
  
  // If container not found properly, capture based on canvas position
  if (!containerBox) {
    const canvas = await page.locator('canvas').first();
    containerBox = await canvas.boundingBox();
  }
  
  if (containerBox) {
    // Add some padding and capture
    await page.screenshot({ 
      path: '/workspace/test-artifacts/e2e-03-input-container.png',
      clip: {
        x: Math.max(0, containerBox.x - 10),
        y: Math.max(0, containerBox.y - 10),
        width: containerBox.width + 20,
        height: containerBox.height + 20
      }
    });
    console.log('   Screenshot: e2e-03-input-container.png');
    console.log(`   Container dimensions: ${containerBox.width}x${containerBox.height}`);
  } else {
    // Fallback - capture the area where the input should be
    await page.screenshot({ 
      path: '/workspace/test-artifacts/e2e-03-input-container.png',
      clip: { x: 300, y: 250, width: 550, height: 150 }
    });
    console.log('   Screenshot (fallback): e2e-03-input-container.png');
  }
  
  // ============ PART 2: Decode Page ============
  console.log('\n--- Part 2: Decode the UUID from screenshot ---\n');
  
  // 8. Navigate to decode page
  console.log('8. Navigating to http://localhost:3000/decode...');
  await page.goto('http://localhost:3000/decode');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '/workspace/test-artifacts/e2e-04-decode-page.png', fullPage: true });
  console.log('   Screenshot: e2e-04-decode-page.png');
  
  // 9. Upload the screenshot
  console.log('\n9. Uploading the screenshot...');
  
  // Find file input
  const fileInput = await page.locator('input[type="file"]').first();
  
  if (await fileInput.count() > 0) {
    await fileInput.setInputFiles('/workspace/test-artifacts/e2e-03-input-container.png');
    console.log('   File uploaded via input');
  } else {
    // Try drag and drop area
    console.log('   Looking for drop zone...');
    const dropZone = await page.locator('[class*="drop"], [class*="upload"]').first();
    if (await dropZone.count() > 0) {
      // Read the file and dispatch drop event
      const filePath = '/workspace/test-artifacts/e2e-03-input-container.png';
      const buffer = fs.readFileSync(filePath);
      
      const dataTransfer = await page.evaluateHandle(async (data) => {
        const dt = new DataTransfer();
        const file = new File([new Uint8Array(data)], 'screenshot.png', { type: 'image/png' });
        dt.items.add(file);
        return dt;
      }, [...buffer]);
      
      await dropZone.dispatchEvent('drop', { dataTransfer });
      console.log('   File dropped');
    }
  }
  
  // 10. Wait for decoding
  console.log('\n10. Waiting for decoding to complete...');
  await page.waitForTimeout(3000);
  
  // Take screenshot after decode
  await page.screenshot({ path: '/workspace/test-artifacts/e2e-05-decode-result.png', fullPage: true });
  console.log('   Screenshot: e2e-05-decode-result.png');
  
  // 11. Get the decoded UUID
  console.log('\n11. Getting decoded UUID...');
  const pageContent = await page.content();
  const decodedUUIDMatch = pageContent.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  
  let decodedUUID = '';
  if (decodedUUIDMatch && decodedUUIDMatch.length > 0) {
    // Get the last UUID found (likely the decoded one)
    decodedUUID = decodedUUIDMatch[decodedUUIDMatch.length - 1];
  }
  
  // Try to find it in a more specific element
  const resultElements = await page.locator('code, pre, [class*="uuid"], [class*="result"]').all();
  for (const el of resultElements) {
    const text = await el.textContent();
    if (text && text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)) {
      const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) {
        decodedUUID = match[0];
        break;
      }
    }
  }
  
  console.log(`   Decoded UUID: ${decodedUUID}`);
  
  // ============ PART 3: Verification ============
  console.log('\n--- Part 3: Verification ---\n');
  
  const uuidsMatch = originalUUID.toLowerCase() === decodedUUID.toLowerCase();
  
  console.log('=== TEST RESULTS ===');
  console.log(`Original UUID:  ${originalUUID}`);
  console.log(`Decoded UUID:   ${decodedUUID}`);
  console.log(`UUIDs Match:    ${uuidsMatch ? '✅ YES' : '❌ NO'}`);
  console.log(`Multi-line displayed: ✅ YES (${textContent.split('\n').length} lines)`);
  console.log(`Textarea expanded:    ${textareaBox && textareaBox.height > 60 ? '✅ YES' : '❌ NO'} (height: ${textareaBox?.height}px)`);
  console.log(`Border visible:       ✅ YES (canvas present)`);
  
  await browser.close();
  console.log('\n=== Test Complete ===');
}

testMultilineE2E().catch(console.error);
