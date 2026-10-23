import { test, expect } from '../../src/fixtures/ui.fixtures.js';

// Chosen by name; prices are read from the catalog at runtime, never hardcoded.
const PRODUCTS = ['Sauce Labs Backpack', 'Sauce Labs Bolt T-Shirt'];

test('UI-02 adds two products to the cart', async ({ loggedInInventoryPage: inventory, cartPage }) => {
  // Arrange
  const selected = await Promise.all(PRODUCTS.map((name) => inventory.getProduct(name)));

  // Act
  for (const product of selected) {
    await inventory.addToCart(product.name);
  }
  await inventory.openCart();

  // Assert
  await expect(cartPage.title).toHaveText('Your Cart');
  // The badge lives in the shared header, so the inventory locator is still valid on the cart page.
  await expect(inventory.cartBadge).toHaveText(String(selected.length));
  await expect(cartPage.items).toHaveCount(selected.length);
  for (const product of selected) {
    await expect(cartPage.itemName(product.name)).toHaveText(product.name);
    await expect(cartPage.itemPrice(product.name)).toHaveText(product.priceText);
  }
});
