import { test, expect } from '../../src/fixtures/ui.fixtures.js';
import { users } from '../../src/ui/data/users.js';
import { CustomerFactory } from '../../src/ui/factories/CustomerFactory.js';

// SauceDemo exposes several public demo accounts. Every one of them must get the same, correct main flow;
// the same checks run for each account so any account-specific defect becomes visible.
// `catalogTimeout` is the time budget of the catalog check (13 navigations). performance_glitch_user is slowed
// down on purpose (about 5 s per page), so its budget is explicit instead of letting it fail on time: these
// tests check behaviour, not speed.
const PERSONAS = [
  { user: users.standard, catalogTimeout: 30_000 },
  { user: users.problem, catalogTimeout: 30_000 },
  { user: users.error, catalogTimeout: 30_000 },
  { user: users.visual, catalogTimeout: 30_000 },
  { user: users.performanceGlitch, catalogTimeout: 120_000 },
];

test.describe('User personas', { tag: '@functional' }, () => {
  for (const { user, catalogTimeout } of PERSONAS) {
    // Soft assertions: one run reports every broken aspect of the catalog for this account.
    test(`UI-38 catalog integrity for ${user.username}`, async ({ loginPage, inventoryPage: inventory, productDetailsPage }) => {
      test.setTimeout(catalogTimeout);

      // Arrange
      await loginPage.goto();
      await loginPage.login(user);
      await expect(inventory.title).toHaveText('Products');
      const catalog = await Promise.all((await inventory.productNames()).map((name) => inventory.getProduct(name)));
      const names = catalog.map((product) => product.name);

      // Act + Assert: one product image per product
      const images = await inventory.productImageSources();
      expect.soft(new Set(images).size, 'every product has its own image').toBe(catalog.length);

      // Act + Assert: sorting by name (Z to A)
      await inventory.sortBy('za');
      expect.soft(await inventory.productNames(), 'Z to A order').toEqual([...names].sort((a, b) => a.localeCompare(b)).reverse());
      await inventory.sortBy('az');

      // Act + Assert: every product can be added
      for (const name of names) {
        await inventory.addToCart(name);
      }
      await expect.soft(inventory.cartBadge, 'every product was added').toHaveText(String(catalog.length));

      // Act + Assert: each details view shows the product that was opened, at the catalog price
      for (const product of catalog) {
        await inventory.openDetails(product.name);
        await expect(productDetailsPage.backButton).toBeVisible();
        await expect.soft(productDetailsPage.name, `details of ${product.name}`).toHaveText(product.name);
        await expect.soft(productDetailsPage.price, `price of ${product.name}`).toHaveText(product.priceText);
        await productDetailsPage.back();
      }
    });

    test(`UI-39 ${user.username} can complete a purchase`, async ({ loginPage, inventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await loginPage.goto();
      await loginPage.login(user);
      await expect(inventory.title).toHaveText('Products');
      const product = 'Sauce Labs Backpack';
      await inventory.addToCart(product);
      await inventory.openCart();
      await expect(cartPage.itemName(product)).toHaveText(product);
      await cartPage.checkout();
      const customer = CustomerFactory.build();

      // Act
      await checkoutPage.fillCustomer(customer);

      // Assert: the form keeps exactly what was typed
      await expect.soft(checkoutPage.firstNameInput).toHaveValue(customer.firstName);
      await expect.soft(checkoutPage.lastNameInput).toHaveValue(customer.lastName);
      await expect.soft(checkoutPage.postalCodeInput).toHaveValue(customer.postalCode);

      // Act
      await checkoutPage.continue();
      await expect(checkoutPage.title).toHaveText('Checkout: Overview');
      await checkoutPage.finish();

      // Assert
      await expect(checkoutPage.title).toHaveText('Checkout: Complete!');
      await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
    });
  }
});
