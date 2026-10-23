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

/*
 * Customer data rules. SauceDemo publishes no specification, so these are the domain conventions the suite
 * holds the site to (a real shipping form would apply them):
 * - first/last name: 1-50 characters of letters (any script, accents included), with apostrophe, hyphen and
 *   inner spaces allowed; no digits, other symbols, emoji, markup or blank values;
 * - postal code: 3-10 characters of letters/digits with optional inner space or hyphen (covers e.g. 28013,
 *   12345-6789, SW1A 1AA); no other symbols, negatives or blank values.
 * Rejection is asserted by its user-visible effect (an error and no progress), not by an exact message text.
 */
const NAME_MAX = 50;
const POSTAL_MIN = 3;
const POSTAL_MAX = 10;

test.describe('Checkout: flow integrity', { tag: '@negative' }, () => {
  test('UI-30 the overview cannot be reached without customer data', async ({ page, loggedInInventoryPage: inventory, checkoutPage }) => {
    // Arrange
    await inventory.addToCart(PRODUCTS[0]);

    // Act: skip the information step by opening the overview URL directly
    await page.goto('/checkout-step-two.html');

    // Assert
    await expect(checkoutPage.title).toBeVisible();
    await expect(checkoutPage.title).toHaveText('Checkout: Your Information');
    await expect(checkoutPage.finishButton).toBeHidden();
  });

  test('UI-31 the order confirmation is not shown without a completed order', async ({ page, loggedInInventoryPage, checkoutPage }) => {
    // Arrange
    await expect(loggedInInventoryPage.title).toHaveText('Products');

    // Act
    await page.goto('/checkout-complete.html');

    // Assert
    await expect(checkoutPage.title).toBeVisible();
    await expect(checkoutPage.title).not.toHaveText('Checkout: Complete!');
    await expect(checkoutPage.completeHeader).toBeHidden();
  });

  // Asserted on the button state: checking the title right after a click would pass before any navigation.
  test('UI-32 checkout cannot start with an empty cart', async ({ loggedInInventoryPage: inventory, cartPage }) => {
    // Act
    await inventory.openCart();

    // Assert
    await expect(cartPage.title).toHaveText('Your Cart');
    await expect(cartPage.items).toHaveCount(0);
    await expect(cartPage.checkoutButton).toBeDisabled();
  });
});

test.describe('Checkout: customer data validation', { tag: '@negative' }, () => {
  const invalidCustomers = [
    { name: 'first name with only digits', overrides: { firstName: '12345' } },
    { name: 'first name mixing letters and digits', overrides: { firstName: 'J0hn' } },
    { name: 'first name with symbols', overrides: { firstName: '@#$%&*' } },
    { name: 'first name with emoji', overrides: { firstName: 'John😀' } },
    { name: 'first name with HTML markup', overrides: { firstName: '<b>John</b>' } },
    { name: 'first name with only spaces', overrides: { firstName: '   ' } },
    { name: 'last name with only digits', overrides: { lastName: '67890' } },
    { name: 'last name with only spaces', overrides: { lastName: '   ' } },
    { name: 'postal code with symbols', overrides: { postalCode: '!@#$%' } },
    { name: 'postal code with a negative number', overrides: { postalCode: '-12345' } },
    { name: 'postal code with emoji', overrides: { postalCode: '📮📮📮' } },
    { name: 'postal code with only spaces', overrides: { postalCode: '     ' } },
  ];
  for (const { name, overrides } of invalidCustomers) {
    test(`UI-27 the information step rejects ${name}`, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await startCheckout({ inventory, cartPage }, PRODUCTS);
      const customer = CustomerFactory.build(overrides);

      // Act
      await checkoutPage.fillCustomer(customer);
      await checkoutPage.continue();

      // Assert
      await expect(checkoutPage.errorMessage).toBeVisible();
      await expect(checkoutPage.title).toHaveText('Checkout: Your Information');
    });
  }

  test('UI-28 markup in customer data is never executed', async ({ page, loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
    // Arrange
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await startCheckout({ inventory, cartPage }, PRODUCTS);
    const customer = CustomerFactory.build({ firstName: '<img src=x onerror=alert(1)>', lastName: '<script>alert(2)</script>' });

    // Act
    await checkoutPage.fillCustomer(customer);
    await checkoutPage.continue();

    // Assert
    await expect(checkoutPage.title).toBeVisible();
    expect(dialogs, 'no script from the inputs ran').toEqual([]);
  });
});

test.describe('Checkout: valid international customer data', { tag: '@functional' }, () => {
  const validCustomers = [
    { name: 'accents and ñ', overrides: { firstName: 'José', lastName: 'Muñoz' } },
    { name: 'apostrophe and hyphen', overrides: { firstName: "D'Arcy", lastName: "O'Brien-Smith" } },
    { name: 'inner spaces in compound names', overrides: { firstName: 'Mary Ann', lastName: 'van der Berg' } },
    { name: 'non-Latin script', overrides: { firstName: '李', lastName: '王' } },
    { name: 'alphanumeric postal code with inner space', overrides: { postalCode: 'SW1A 1AA' } },
    { name: 'postal code with hyphen', overrides: { postalCode: '12345-6789' } },
  ];
  for (const { name, overrides } of validCustomers) {
    test(`UI-29 the information step accepts ${name}`, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await startCheckout({ inventory, cartPage }, PRODUCTS);
      const customer = CustomerFactory.build(overrides);

      // Act
      await checkoutPage.fillCustomer(customer);
      await checkoutPage.continue();

      // Assert
      await expect(checkoutPage.title).toHaveText('Checkout: Overview');
      await expect(checkoutPage.errorMessage).toBeHidden();
    });
  }
});

test.describe('Checkout: boundaries', { tag: '@boundary' }, () => {
  const acceptedLengths = [
    { name: '1-character names (minimum)', overrides: { firstName: 'A', lastName: 'B' } },
    { name: `${NAME_MAX}-character names (maximum)`, overrides: { firstName: 'A'.repeat(NAME_MAX), lastName: 'B'.repeat(NAME_MAX) } },
    { name: `${POSTAL_MIN}-character postal code (minimum)`, overrides: { postalCode: '1'.repeat(POSTAL_MIN) } },
    { name: `${POSTAL_MAX}-character postal code (maximum)`, overrides: { postalCode: '1'.repeat(POSTAL_MAX) } },
  ];
  for (const { name, overrides } of acceptedLengths) {
    test(`UI-24 the information step accepts ${name}`, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await startCheckout({ inventory, cartPage }, PRODUCTS);
      const customer = CustomerFactory.build(overrides);

      // Act
      await checkoutPage.fillCustomer(customer);
      await checkoutPage.continue();

      // Assert
      await expect(checkoutPage.title).toHaveText('Checkout: Overview');
      await expect(checkoutPage.errorMessage).toBeHidden();
    });
  }

  const rejectedLengths = [
    { name: `${NAME_MAX + 1}-character first name (maximum + 1)`, overrides: { firstName: 'A'.repeat(NAME_MAX + 1) } },
    { name: `${NAME_MAX + 1}-character last name (maximum + 1)`, overrides: { lastName: 'B'.repeat(NAME_MAX + 1) } },
    { name: `${POSTAL_MIN - 1}-character postal code (minimum - 1)`, overrides: { postalCode: '1'.repeat(POSTAL_MIN - 1) } },
    { name: `${POSTAL_MAX + 1}-character postal code (maximum + 1)`, overrides: { postalCode: '1'.repeat(POSTAL_MAX + 1) } },
  ];
  for (const { name, overrides } of rejectedLengths) {
    test(`UI-24 the information step rejects ${name}`, async ({ loggedInInventoryPage: inventory, cartPage, checkoutPage }) => {
      // Arrange
      await startCheckout({ inventory, cartPage }, PRODUCTS);
      const customer = CustomerFactory.build(overrides);

      // Act
      await checkoutPage.fillCustomer(customer);
      await checkoutPage.continue();

      // Assert
      await expect(checkoutPage.errorMessage).toBeVisible();
      await expect(checkoutPage.title).toHaveText('Checkout: Your Information');
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
