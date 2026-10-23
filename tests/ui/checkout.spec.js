import { test, expect } from '../../src/fixtures/ui.fixtures.js';
import { CustomerFactory } from '../../src/ui/factories/CustomerFactory.js';

const PRODUCTS = ['Sauce Labs Backpack', 'Sauce Labs Bike Light'];

test('UI-03 completes checkout with correct totals', async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
  // Arrange
  const selected = await Promise.all(PRODUCTS.map((name) => inventory.getProduct(name)));
  for (const product of selected) {
    await inventory.addToCart(product.name);
  }
  await inventory.openCart();
  await cartPage.checkout();
  const customer = CustomerFactory.build();

  // Act
  await checkoutPage.fillCustomer(customer);
  await checkoutPage.continue();

  // Assert: overview
  await expect(checkoutPage.title).toHaveText('Checkout: Overview');
  await expect(checkoutPage.items).toHaveCount(selected.length);
  for (const product of selected) {
    await expect(checkoutPage.itemPrice(product.name)).toHaveText(product.priceText);
  }

  const { subtotalCents, taxCents, totalCents } = await checkoutPage.getTotals();
  const expectedSubtotalCents = selected.reduce((sum, product) => sum + product.priceCents, 0);
  expect(subtotalCents, 'subtotal = sum of selected product prices').toBe(expectedSubtotalCents);
  expect(taxCents, 'tax is a positive amount').toBeGreaterThan(0);
  expect(taxCents, 'tax is lower than the subtotal').toBeLessThan(subtotalCents);
  // Each label is rounded to cents and the subtotal is already whole cents, so in cents the identity is exact.
  expect(totalCents, 'total = subtotal + tax').toBe(subtotalCents + taxCents);

  // Act
  await checkoutPage.finish();

  // Assert: confirmation
  await expect(checkoutPage.title).toHaveText('Checkout: Complete!');
  await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
});
