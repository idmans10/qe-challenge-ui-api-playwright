import { test, expect } from '../../src/fixtures/ui.fixtures.js';
import { CustomerFactory } from '../../src/ui/factories/CustomerFactory.js';

const PRODUCTS = ['Sauce Labs Backpack', 'Sauce Labs Bike Light'];

// Precondition shared by the checkout tests: the named products are in the cart and the information step is open.
// Prices are read from the catalog at runtime.
const startCheckout = async ({ inventory, cartPage }, names) => {
  const selected = await Promise.all(names.map((name) => inventory.getProduct(name)));
  for (const product of selected) {
    await inventory.addToCart(product.name);
  }
  await inventory.openCart();
  await cartPage.checkout();
  return selected;
};

test('UI-03 completes checkout with correct totals', { tag: '@functional' }, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
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

test.describe('Checkout: functional', { tag: '@functional' }, () => {
  test('UI-20 cancel on the information step returns to the cart with its items', async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
    // Arrange
    await startCheckout({ inventory, cartPage }, PRODUCTS);

    // Act
    await checkoutPage.cancel();

    // Assert
    await expect(cartPage.title).toHaveText('Your Cart');
    await expect(cartPage.items).toHaveCount(PRODUCTS.length);
  });

  test('UI-21 cancel on the overview returns to the catalog and keeps the cart', async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
    // Arrange
    await startCheckout({ inventory, cartPage }, PRODUCTS);
    await checkoutPage.fillCustomer(CustomerFactory.build());
    await checkoutPage.continue();
    await expect(checkoutPage.title).toHaveText('Checkout: Overview');

    // Act
    await checkoutPage.cancel();

    // Assert
    await expect(inventory.title).toHaveText('Products');
    await expect(inventory.cartBadge).toHaveText(String(PRODUCTS.length));
  });

  test('UI-22 after a completed order, Back Home shows the catalog with an empty cart', async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
    // Arrange
    await startCheckout({ inventory, cartPage }, PRODUCTS);
    await checkoutPage.fillCustomer(CustomerFactory.build());
    await checkoutPage.continue();
    await checkoutPage.finish();
    await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');

    // Act
    await checkoutPage.backHome();

    // Assert
    await expect(inventory.title).toHaveText('Products');
    await expect(inventory.cartBadge).toBeHidden();
    for (const name of PRODUCTS) {
      await expect(inventory.addButton(name)).toBeVisible();
    }
  });
});

test.describe('Checkout: negative', { tag: '@negative' }, () => {
  const requiredFields = [
    { field: 'firstName', message: 'Error: First Name is required' },
    { field: 'lastName', message: 'Error: Last Name is required' },
    { field: 'postalCode', message: 'Error: Postal Code is required' },
  ];
  for (const { field, message } of requiredFields) {
    test(`UI-23 the information step requires ${field}`, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await startCheckout({ inventory, cartPage }, PRODUCTS);
      const customer = CustomerFactory.build({ [field]: '' });

      // Act
      await checkoutPage.fillCustomer(customer);
      await checkoutPage.continue();

      // Assert
      await expect(checkoutPage.errorMessage).toHaveText(message);
      await expect(checkoutPage.title).toHaveText('Checkout: Your Information');
    });
  }
});

test.describe('Checkout: boundaries', { tag: '@boundary' }, () => {
  const fieldLengths = [
    { name: 'minimum length (1 character)', length: 1 },
    { name: 'long values (300 characters, no maxlength on the inputs)', length: 300 },
  ];
  for (const { name, length } of fieldLengths) {
    test(`UI-24 the information step accepts ${name}`, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await startCheckout({ inventory, cartPage }, PRODUCTS);
      const customer = CustomerFactory.build({ firstName: 'F'.repeat(length), lastName: 'L'.repeat(length), postalCode: '9'.repeat(length) });

      // Act
      await checkoutPage.fillCustomer(customer);
      await checkoutPage.continue();

      // Assert
      await expect(checkoutPage.title).toHaveText('Checkout: Overview');
      await expect(checkoutPage.errorMessage).toBeHidden();
    });
  }

  test('UI-25 totals for a single item (minimum order)', async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
    // Arrange
    const [product] = await startCheckout({ inventory, cartPage }, ['Sauce Labs Onesie']);

    // Act
    await checkoutPage.fillCustomer(CustomerFactory.build());
    await checkoutPage.continue();

    // Assert
    await expect(checkoutPage.items).toHaveCount(1);
    const { subtotalCents, taxCents, totalCents } = await checkoutPage.getTotals();
    expect(subtotalCents, 'subtotal = the single item price').toBe(product.priceCents);
    expect(taxCents, 'tax is a positive amount').toBeGreaterThan(0);
    expect(taxCents, 'tax is lower than the subtotal').toBeLessThan(subtotalCents);
    expect(totalCents, 'total = subtotal + tax').toBe(subtotalCents + taxCents);
  });

  test('UI-26 totals for every catalog product (maximum order)', async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
    // Arrange
    const selected = await startCheckout({ inventory, cartPage }, await inventory.productNames());

    // Act
    await checkoutPage.fillCustomer(CustomerFactory.build());
    await checkoutPage.continue();

    // Assert
    await expect(checkoutPage.items).toHaveCount(selected.length);
    const { subtotalCents, taxCents, totalCents } = await checkoutPage.getTotals();
    expect(subtotalCents, 'subtotal = sum of every catalog price').toBe(selected.reduce((sum, product) => sum + product.priceCents, 0));
    expect(taxCents, 'tax is a positive amount').toBeGreaterThan(0);
    expect(taxCents, 'tax is lower than the subtotal').toBeLessThan(subtotalCents);
    expect(totalCents, 'total = subtotal + tax').toBe(subtotalCents + taxCents);
  });
});
