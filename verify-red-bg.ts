import { chromium } from 'playwright';

async function verifyRedBackground() {
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
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ path: '/workspace/test-artifacts/verify-red-bg.png', fullPage: true });
  console.log('Screenshot saved: verify-red-bg.png');
  
  // Check background color
  const bgColor = await page.evaluate(() => {
    const body = document.body;
    const style = window.getComputedStyle(body);
    return style.backgroundColor;
  });
  console.log('Body background color:', bgColor);
  
  await browser.close();
}

verifyRedBackground().catch(console.error);
