import { test, expect } from '@playwright/test';

test.use({
  video: {
    mode: 'on',
    size: { width: 1280, height: 720 }
  }
});

test('demo multi-line input functionality', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Pause to show initial state
  
  // Take screenshot of initial state
  await page.screenshot({ path: '/workspace/test-artifacts/demo-01-initial.png', fullPage: true });
  
  // Find and click the textarea
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await page.waitForTimeout(500);
  
  // Type first line
  await textarea.type('First line of text', { delay: 50 });
  await page.waitForTimeout(300);
  
  // Press Enter and type second line
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await textarea.type('Second line here', { delay: 50 });
  await page.waitForTimeout(300);
  
  // Press Enter and type third line
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await textarea.type('And a third line', { delay: 50 });
  await page.waitForTimeout(1000); // Pause to show multi-line text clearly
  
  // Take screenshot showing multi-line text
  await page.screenshot({ path: '/workspace/test-artifacts/demo-02-multiline.png', fullPage: true });
  
  // Click the refresh icon to generate new UUID
  const refreshButton = page.locator('button').filter({ has: page.locator('svg') }).last();
  await refreshButton.click();
  await page.waitForTimeout(1500); // Pause to show the new border
  
  // Take screenshot showing new UUID/border
  await page.screenshot({ path: '/workspace/test-artifacts/demo-03-new-uuid.png', fullPage: true });
  
  // Verify the textarea has all three lines
  const textValue = await textarea.inputValue();
  expect(textValue).toContain('First line of text');
  expect(textValue).toContain('Second line here');
  expect(textValue).toContain('And a third line');
  expect(textValue.split('\n').length).toBe(3);
  
  // Verify border canvas is visible
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
});
