import { test, expect } from '@playwright/test';

test('multi-line input functionality', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // Take initial screenshot
  await page.screenshot({ path: '/workspace/test-artifacts/multiline-01-initial.png', fullPage: true });
  
  // Find the textarea/input field
  const textarea = await page.locator('textarea').first();
  
  // Clear and type multi-line text
  await textarea.click();
  await textarea.fill('Hello world\nThis is line 2\nAnd line 3');
  
  // Wait a moment for the border to render
  await page.waitForTimeout(500);
  
  // Take screenshot showing multi-line input
  await page.screenshot({ path: '/workspace/test-artifacts/multiline-02-with-text.png', fullPage: true });
  
  // Get the textarea value to verify
  const textValue = await textarea.inputValue();
  console.log('Textarea value:', JSON.stringify(textValue));
  console.log('Lines:', textValue.split('\n'));
  
  // Verify multi-line text
  expect(textValue).toContain('Hello world');
  expect(textValue).toContain('This is line 2');
  expect(textValue).toContain('And line 3');
  expect(textValue.split('\n').length).toBe(3);
  
  // Check if border canvas is visible
  const canvas = await page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  console.log('Border canvas is visible');
});
