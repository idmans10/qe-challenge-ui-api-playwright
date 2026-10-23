import { test, expect } from '../../src/fixtures/ui.fixtures.js';

test.describe('Inventory: functional', { tag: '@functional' }, () => {
  test('UI-11 every catalog item shows a name, a valid price and an add button', async ({ loggedInInventoryPage: inventory }) => {
    // Arrange
    const names = await inventory.productNames();

    // Act
    const prices = await inventory.productPricesCents();

    // Assert
    expect(names).not.toHaveLength(0);
    expect(new Set(names).size, 'product names are unique').toBe(names.length);
    expect(prices).toHaveLength(names.length);
    expect(prices.every((cents) => cents > 0), 'every price is positive').toBe(true);
    for (const name of names) {
      await expect(inventory.addButton(name)).toBeVisible();
    }
    await expect(inventory.activeSortOption).toHaveText('Name (A to Z)');
  });

  const byName = (a, b) => a.localeCompare(b);
  // `from` is applied first so the starting order is never already the expected one (the default is A to Z).
  const sortCases = [
    { option: 'az', from: 'za', label: 'Name (A to Z)', read: (inv) => inv.productNames(), order: (values) => [...values].sort(byName) },
    { option: 'za', from: 'az', label: 'Name (Z to A)', read: (inv) => inv.productNames(), order: (values) => [...values].sort(byName).reverse() },
    { option: 'lohi', from: 'az', label: 'Price (low to high)', read: (inv) => inv.productPricesCents(), order: (values) => [...values].sort((a, b) => a - b) },
    { option: 'hilo', from: 'az', label: 'Price (high to low)', read: (inv) => inv.productPricesCents(), order: (values) => [...values].sort((a, b) => b - a) },
  ];
  for (const { option, from, label, read, order } of sortCases) {
    test(`UI-12 sorting: ${label}`, async ({ loggedInInventoryPage: inventory }) => {
      // Arrange
      await inventory.sortBy(from);
      const before = await read(inventory);
      expect(before, 'starting order must differ from the expected one, or the test proves nothing').not.toEqual(order(before));

      // Act
      await inventory.sortBy(option);

      // Assert
      await expect(inventory.activeSortOption).toHaveText(label);
      expect(await read(inventory)).toEqual(order(before));
    });
  }

  test('UI-13 adding and removing a product toggles its button and the cart badge', async ({ loggedInInventoryPage: inventory }) => {
    // Arrange
    const product = 'Sauce Labs Backpack';

    // Act
    await inventory.addToCart(product);

    // Assert
    await expect(inventory.removeButton(product)).toBeVisible();
    await expect(inventory.cartBadge).toHaveText('1');

    // Act
    await inventory.removeFromCart(product);

    // Assert
    await expect(inventory.addButton(product)).toBeVisible();
    await expect(inventory.cartBadge).toBeHidden();
  });

  test('UI-14 logout ends the session', async ({ loggedInInventoryPage: inventory, loginPage }) => {
    // Act
    await inventory.logout();

    // Assert
    await expect(loginPage.loginButton).toBeVisible();
    await loginPage.gotoPath('/inventory.html');
    await expect(loginPage.errorMessage).toHaveText("Epic sadface: You can only access '/inventory.html' when you are logged in.");
  });
});

test.describe('Product details', () => {
  test('UI-35 every product details view matches its catalog entry', { tag: '@functional' }, async ({ loggedInInventoryPage: inventory, productDetailsPage }) => {
    // Arrange
    const catalog = await Promise.all((await inventory.productNames()).map((name) => inventory.getProduct(name)));

    for (const product of catalog) {
      // Act
      await inventory.openDetails(product.name);

      // Assert
      await expect(productDetailsPage.backButton).toBeVisible();
      await expect(productDetailsPage.name).toHaveText(product.name);
      await expect(productDetailsPage.price).toHaveText(product.priceText);
      await productDetailsPage.back();
    }
  });

  for (const id of ['99', '-1', 'abc']) {
    test(`UI-36 a non-existent product (id=${id}) cannot be added to the cart`, { tag: '@negative' }, async ({ loggedInInventoryPage, productDetailsPage }) => {
      // Arrange
      await expect(loggedInInventoryPage.title).toHaveText('Products');

      // Act
      await productDetailsPage.gotoId(id);

      // Assert
      await expect(productDetailsPage.backButton).toBeVisible();
      await expect(productDetailsPage.addButton).toBeHidden();
    });
  }
});

test('UI-37 Reset App State empties the cart and restores every Add to cart button', { tag: '@functional' }, async ({ loggedInInventoryPage: inventory }) => {
  // Arrange
  const product = 'Sauce Labs Backpack';
  await inventory.addToCart(product);
  await expect(inventory.cartBadge).toHaveText('1');

  // Act
  await inventory.resetAppState();

  // Assert
  await expect(inventory.cartBadge).toBeHidden();
  await expect(inventory.addButton(product)).toBeVisible();
});

test.describe('Inventory: boundaries', { tag: '@boundary' }, () => {
  test('UI-15 the cart badge counts every product (max) and disappears at zero (min)', async ({ loggedInInventoryPage: inventory }) => {
    // Arrange
    const names = await inventory.productNames();

    // Act
    for (const name of names) {
      await inventory.addToCart(name);
    }

    // Assert
    await expect(inventory.cartBadge).toHaveText(String(names.length));

    // Act
    for (const name of names) {
      await inventory.removeFromCart(name);
    }

    // Assert
    await expect(inventory.cartBadge).toBeHidden();
  });
});
