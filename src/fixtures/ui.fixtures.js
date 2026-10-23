import { test as base, expect } from '@playwright/test';
import { users } from '../ui/data/users.js';
import { LoginPage } from '../ui/pages/LoginPage.js';
import { InventoryPage } from '../ui/pages/InventoryPage.js';
import { CartPage } from '../ui/pages/CartPage.js';
import { CheckoutPage } from '../ui/pages/CheckoutPage.js';
import { ProductDetailsPage } from '../ui/pages/ProductDetailsPage.js';

// Every page object wraps the built-in test-scoped `page`, which lives in its own fresh BrowserContext:
// no cookies, localStorage (SauceDemo keeps the cart there) or session survive between tests.
export const test = base.extend({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },

  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },

  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },

  productDetailsPage: async ({ page }, use) => {
    await use(new ProductDetailsPage(page));
  },

  // Precondition for tests that are not about login: standard_user signed in, inventory shown.
  loggedInInventoryPage: async ({ page, loginPage, inventoryPage }, use) => {
    await loginPage.goto();
    await loginPage.login(users.standard);
    try {
      await page.waitForURL('**/inventory.html');
    } catch (error) {
      throw new Error(`fixture: login as ${users.standard.username} did not reach the inventory (current URL: ${page.url()})`, { cause: error });
    }
    await use(inventoryPage);
  },
});

export { expect };
