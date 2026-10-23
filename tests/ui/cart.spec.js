import { test, expect } from '../../src/fixtures/ui.fixtures.js';
import { users } from '../../src/ui/data/users.js';

// Chosen by name; prices are read from the catalog at runtime, never hardcoded.
const PRODUCTS = ['Sauce Labs Backpack', 'Sauce Labs Bolt T-Shirt'];

test('UI-02 adds two products to the cart', { tag: '@functional' }, async ({ loggedInInventoryPage: inventory, cartPage }) => {
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

test.describe('Cart: functional', { tag: '@functional' }, () => {
  test('UI-16 removing a product from the cart updates the list and the badge', async ({ loggedInInventoryPage: inventory, cartPage }) => {
    // Arrange
    const [kept, removed] = PRODUCTS;
    for (const name of PRODUCTS) {
      await inventory.addToCart(name);
    }
    await inventory.openCart();

    // Act
    await cartPage.removeItem(removed);

    // Assert
    await expect(cartPage.items).toHaveCount(1);
    await expect(cartPage.item(removed)).toHaveCount(0);
    await expect(cartPage.itemName(kept)).toHaveText(kept);
    await expect(cartPage.itemQuantity(kept)).toHaveText('1');
    await expect(inventory.cartBadge).toHaveText('1');
  });

  test('UI-17 continue shopping returns to the catalog and keeps the cart', async ({ loggedInInventoryPage: inventory, cartPage }) => {
    // Arrange
    const [product] = PRODUCTS;
    await inventory.addToCart(product);
    await inventory.openCart();

    // Act
    await cartPage.continueShopping();

    // Assert
    await expect(inventory.title).toHaveText('Products');
    await expect(inventory.cartBadge).toHaveText('1');
    await expect(inventory.removeButton(product)).toBeVisible();
  });

  test('UI-18 the cart survives a page reload', async ({ page, loggedInInventoryPage: inventory, cartPage }) => {
    // Arrange
    const [product] = PRODUCTS;
    await inventory.addToCart(product);
    await inventory.openCart();

    // Act
    await page.reload();

    // Assert
    await expect(cartPage.title).toHaveText('Your Cart');
    await expect(cartPage.itemName(product)).toHaveText(product);
    await expect(inventory.cartBadge).toHaveText('1');
  });
});

test('UI-34 a cart is not shared with the next user of the same browser', { tag: '@negative' }, async ({ loggedInInventoryPage: inventory, loginPage, cartPage }) => {
  // Arrange: standard_user leaves a product in the cart and logs out
  const [product] = PRODUCTS;
  await inventory.addToCart(product);
  await expect(inventory.cartBadge).toHaveText('1');
  await inventory.logout();

  // Act: another user signs in on the same browser
  await loginPage.login(users.visual);
  await expect(inventory.title).toHaveText('Products');

  // Assert
  await expect(inventory.cartBadge).toBeHidden();
  await inventory.openCart();
  await expect(cartPage.items).toHaveCount(0);
});

test('UI-19 an empty cart shows no items and no badge', { tag: '@boundary' }, async ({ loggedInInventoryPage: inventory, cartPage }) => {
  // Act
  await inventory.openCart();

  // Assert
  await expect(cartPage.title).toHaveText('Your Cart');
  await expect(cartPage.items).toHaveCount(0);
  await expect(inventory.cartBadge).toBeHidden();
});
