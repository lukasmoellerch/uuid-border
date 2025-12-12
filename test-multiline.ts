import { chromium } from 'playwright';

async function testMultilineInput() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  // Find the text input/textarea
  const textarea = await page.locator('textarea').first();
  
  // Click into the textarea
  await textarea.click();
  await page.waitForTimeout(500);
  
  // Clear any existing text
  await textarea.fill('');
  
  // Type realistic multi-line content
  await textarea.type('Hello world!');
  await page.keyboard.press('Enter');
  await textarea.type('This is a multi-line input.');
  await page.keyboard.press('Enter');
  await textarea.type('You can press Enter to create new lines.');
  await page.keyboard.press('Enter');
  await textarea.type('The encoded border wraps around the entire textarea.');
  
  await page.waitForTimeout(1000);
  
  // Take final demo screenshot
  await page.screenshot({ path: '/workspace/test-artifacts/multiline-demo-final.png', fullPage: true });
  console.log('Final demo screenshot saved');
  
  await browser.close();
  console.log('Test completed!');
}

testMultilineInput().catch(console.error);
