import { test, expect } from '../../src/fixtures/ui.fixtures.js';
import { users } from '../../src/ui/data/users.js';

test('UI-01 standard_user logs in and sees the catalog', async ({ page, loginPage, inventoryPage }) => {
  // Arrange
  await loginPage.goto();

  // Act
  await loginPage.login(users.standard);

  // Assert
  await expect(page).toHaveURL(/\/inventory\.html$/);
  await expect(inventoryPage.title).toHaveText('Products');
  await expect(inventoryPage.inventoryList).toBeVisible();
  await expect(inventoryPage.items.first()).toBeVisible();
  expect(await inventoryPage.productNames()).not.toHaveLength(0);
  await expect(loginPage.errorMessage).toBeHidden();
});
