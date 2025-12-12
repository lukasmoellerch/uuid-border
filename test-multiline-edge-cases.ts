import { chromium } from 'playwright';
import path from 'path';

async function testMultilineEdgeCases() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  const screenshotDir = path.join(process.cwd(), 'test-artifacts');

  try {
    console.log('Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Find the textarea
    const textarea = await page.$('textarea');
    if (!textarea) {
      console.log('No textarea found!');
      await browser.close();
      return;
    }

    // ==================== SCENARIO A ====================
    console.log('\n=== SCENARIO A: Long multi-line text ===');
    
    // Clear the input
    await textarea.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    
    // Type longer paragraph with 5-6 lines
    const longText = `This is the first line of a longer paragraph of text.
This is the second line with additional content here.
Third line continues with more text to demonstrate wrapping.
Fourth line shows how the textarea handles multiple lines.
Fifth line adds even more content to the input field.
Sixth line concludes this multi-line test scenario.`;
    
    await page.keyboard.type(longText, { delay: 10 });
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: path.join(screenshotDir, 'scenario-a-long-multiline.png'), 
      fullPage: true 
    });
    console.log('Screenshot saved: scenario-a-long-multiline.png');

    // ==================== SCENARIO B ====================
    console.log('\n=== SCENARIO B: Copy/Paste multi-line text ===');
    
    // Clear the input
    await textarea.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    
    // Prepare the multi-line text to paste
    const pasteText = `Line one with some text
Line two with more content
Line three here
Line four continues
Line five ends it`;
    
    // Use clipboard to paste
    await page.evaluate((text) => {
      navigator.clipboard.writeText(text);
    }, pasteText);
    
    // Alternatively, just type it (simulating paste behavior)
    await page.keyboard.type(pasteText, { delay: 5 });
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: path.join(screenshotDir, 'scenario-b-pasted-multiline.png'), 
      fullPage: true 
    });
    console.log('Screenshot saved: scenario-b-pasted-multiline.png');

    // ==================== SCENARIO C ====================
    console.log('\n=== SCENARIO C: Verify encoded border integrity ===');
    
    // Get the textarea's parent container with the border
    const inputBox = await textarea.boundingBox();
    if (inputBox) {
      // Take a close-up of the border area with larger padding
      const padding = 30;
      await page.screenshot({ 
        path: path.join(screenshotDir, 'scenario-c-border-closeup.png'),
        clip: {
          x: Math.max(0, inputBox.x - padding),
          y: Math.max(0, inputBox.y - padding),
          width: inputBox.width + padding * 2,
          height: inputBox.height + padding * 2
        }
      });
      console.log('Screenshot saved: scenario-c-border-closeup.png');
    }

    // ==================== SCENARIO D ====================
    console.log('\n=== SCENARIO D: Test the copy UUID button ===');
    
    // Find the copy button (clipboard icon)
    // The buttons are next to the textarea
    const copyButton = await page.$('button[title="Copy UUID"]');
    if (copyButton) {
      await copyButton.click();
      console.log('Clicked copy UUID button');
      
      // Wait for the checkmark animation
      await page.waitForTimeout(500);
      
      await page.screenshot({ 
        path: path.join(screenshotDir, 'scenario-d-copy-button.png'), 
        fullPage: true 
      });
      console.log('Screenshot saved: scenario-d-copy-button.png');
    } else {
      console.log('Copy button not found, trying alternative selector...');
      // Try finding button by SVG content or position
      const buttons = await page.$$('button');
      console.log(`Found ${buttons.length} buttons`);
      
      if (buttons.length >= 1) {
        await buttons[0].click();
        await page.waitForTimeout(500);
        await page.screenshot({ 
          path: path.join(screenshotDir, 'scenario-d-copy-button.png'), 
          fullPage: true 
        });
        console.log('Screenshot saved: scenario-d-copy-button.png');
      }
    }

    // ==================== BONUS: Test regenerate button ====================
    console.log('\n=== BONUS: Test regenerate UUID button ===');
    
    const regenerateButton = await page.$('button[title="Generate new UUID"]');
    if (regenerateButton) {
      // Get current UUID first
      const uuidBefore = await page.$eval('code', el => el.textContent);
      console.log('UUID before:', uuidBefore);
      
      await regenerateButton.click();
      await page.waitForTimeout(500);
      
      const uuidAfter = await page.$eval('code', el => el.textContent);
      console.log('UUID after:', uuidAfter);
      console.log('UUID changed:', uuidBefore !== uuidAfter);
      
      await page.screenshot({ 
        path: path.join(screenshotDir, 'scenario-bonus-regenerate.png'), 
        fullPage: true 
      });
      console.log('Screenshot saved: scenario-bonus-regenerate.png');
    }

    console.log('\n=== All scenarios completed! ===');

  } catch (error) {
    console.error('Error during test:', error);
    await page.screenshot({ 
      path: path.join(screenshotDir, 'scenario-error.png'), 
      fullPage: true 
    });
  } finally {
    await browser.close();
  }
}

testMultilineEdgeCases();
