import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to main encode page
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/encode-page.png', fullPage: true });
  console.log('Screenshot saved: /tmp/encode-page.png');
  
  // Navigate to decode page
  await page.goto('http://localhost:3000/decode');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/decode-page.png', fullPage: true });
  console.log('Screenshot saved: /tmp/decode-page.png');
  
  await browser.close();
  console.log('Done!');
})();
