import { chromium } from 'playwright';
import path from 'path';

async function testMultilineInput() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    // Navigate to the encode page
    console.log('Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Wait for the page to load
    await page.waitForTimeout(1000);
    
    // Take initial screenshot
    const screenshotDir = path.join(process.cwd(), 'test-artifacts');
    await page.screenshot({ path: path.join(screenshotDir, 'multiline-01-initial.png'), fullPage: true });
    console.log('Initial screenshot saved');

    // Find and click the textarea/input
    // Try different selectors
    const inputSelectors = ['textarea', 'input[type="text"]', '.uuid-input', '[data-testid="uuid-input"]'];
    let inputElement = null;
    
    for (const selector of inputSelectors) {
      const element = await page.$(selector);
      if (element) {
        inputElement = element;
        console.log(`Found input with selector: ${selector}`);
        break;
      }
    }

    if (!inputElement) {
      // Take a screenshot to see what's on the page
      await page.screenshot({ path: path.join(screenshotDir, 'multiline-debug-no-input.png'), fullPage: true });
      console.log('No input element found. Debug screenshot saved.');
      
      // Print page content for debugging
      const content = await page.content();
      console.log('Page title:', await page.title());
      console.log('Page URL:', page.url());
      
      // Try to find any interactive elements
      const allInputs = await page.$$('input, textarea');
      console.log(`Found ${allInputs.length} input/textarea elements`);
      
      await browser.close();
      return;
    }

    // Click on the input to focus it
    await inputElement.click();
    console.log('Clicked on input element');
    
    // Wait a moment
    await page.waitForTimeout(500);
    
    // Type first line
    await page.keyboard.type('First line');
    console.log('Typed first line');
    
    // Press Enter to create new line
    await page.keyboard.press('Enter');
    console.log('Pressed Enter');
    
    // Type second line
    await page.keyboard.type('Second line');
    console.log('Typed second line');
    
    // Press Enter again
    await page.keyboard.press('Enter');
    console.log('Pressed Enter again');
    
    // Type third line
    await page.keyboard.type('Third line');
    console.log('Typed third line');
    
    // Wait for any updates
    await page.waitForTimeout(500);
    
    // Take final screenshot showing multi-line input
    await page.screenshot({ path: path.join(screenshotDir, 'multiline-02-result.png'), fullPage: true });
    console.log('Result screenshot saved');
    
    // Also take a screenshot of just the input area if possible
    const inputBox = await inputElement.boundingBox();
    if (inputBox) {
      // Add some padding around the input
      const padding = 50;
      await page.screenshot({ 
        path: path.join(screenshotDir, 'multiline-03-input-close.png'),
        clip: {
          x: Math.max(0, inputBox.x - padding),
          y: Math.max(0, inputBox.y - padding),
          width: inputBox.width + padding * 2,
          height: inputBox.height + padding * 2
        }
      });
      console.log('Close-up screenshot of input saved');
    }

    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
    // Take error screenshot
    await page.screenshot({ path: path.join(process.cwd(), 'test-artifacts', 'multiline-error.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}

testMultilineInput();
