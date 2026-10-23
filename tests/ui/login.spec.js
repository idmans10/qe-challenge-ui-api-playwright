import { test, expect } from '../../src/fixtures/ui.fixtures.js';
import { users } from '../../src/ui/data/users.js';

const NO_MATCH = 'Epic sadface: Username and password do not match any user in this service';

test('UI-01 standard_user logs in and sees the catalog', { tag: '@functional' }, async ({ page, loginPage, inventoryPage }) => {
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

test.describe('Login: negative', { tag: '@negative' }, () => {
  test('UI-04 locked_out_user is rejected with a lock-out message', async ({ page, loginPage }) => {
    // Arrange
    await loginPage.goto();

    // Act
    await loginPage.login(users.lockedOut);

    // Assert
    await expect(loginPage.errorMessage).toHaveText('Epic sadface: Sorry, this user has been locked out.');
    await expect(loginPage.loginButton).toBeVisible();
    await expect(page).not.toHaveURL(/\/inventory\.html$/);
  });

  const invalidCredentials = [
    { name: 'wrong password', credentials: { username: users.standard.username, password: 'not-the-password' } },
    { name: 'unknown user', credentials: { username: 'unknown_user', password: users.standard.password } },
  ];
  for (const { name, credentials } of invalidCredentials) {
    test(`UI-05 invalid credentials are rejected: ${name}`, async ({ page, loginPage }) => {
      // Arrange
      await loginPage.goto();

      // Act
      await loginPage.login(credentials);

      // Assert
      await expect(loginPage.errorMessage).toHaveText(NO_MATCH);
      await expect(page).not.toHaveURL(/\/inventory\.html$/);
    });
  }

  const missingFields = [
    { name: 'empty username', credentials: { username: '', password: users.standard.password }, message: 'Epic sadface: Username is required' },
    { name: 'empty password', credentials: { username: users.standard.username, password: '' }, message: 'Epic sadface: Password is required' },
    { name: 'both empty (username is validated first)', credentials: { username: '', password: '' }, message: 'Epic sadface: Username is required' },
  ];
  for (const { name, credentials, message } of missingFields) {
    test(`UI-06 required field validation: ${name}`, async ({ loginPage }) => {
      // Arrange
      await loginPage.goto();

      // Act
      await loginPage.login(credentials);

      // Assert
      await expect(loginPage.errorMessage).toHaveText(message);
    });
  }

  // Every main-flow view renders the login form with an explicit error when there is no session.
  for (const path of ['/inventory.html', '/cart.html', '/checkout-step-one.html', '/checkout-step-two.html', '/checkout-complete.html']) {
    test(`UI-07 ${path} is not reachable without a session`, async ({ loginPage }) => {
      // Act
      await loginPage.gotoPath(path);

      // Assert
      await expect(loginPage.errorMessage).toHaveText(`Epic sadface: You can only access '${path}' when you are logged in.`);
      await expect(loginPage.loginButton).toBeVisible();
    });
  }
});

test.describe('Login: boundaries', { tag: '@boundary' }, () => {
  // Credentials are compared exactly: no case folding and no trimming.
  const nearMisses = [
    { name: 'upper-case username', username: users.standard.username.toUpperCase(), password: users.standard.password },
    { name: 'leading space in username', username: ` ${users.standard.username}`, password: users.standard.password },
    { name: 'trailing space in username', username: `${users.standard.username} `, password: users.standard.password },
    { name: 'upper-case password', username: users.standard.username, password: users.standard.password.toUpperCase() },
  ];
  for (const { name, ...credentials } of nearMisses) {
    test(`UI-08 credentials must match exactly: ${name}`, async ({ loginPage }) => {
      // Arrange
      await loginPage.goto();

      // Act
      await loginPage.login(credentials);

      // Assert
      await expect(loginPage.errorMessage).toHaveText(NO_MATCH);
    });
  }

  test('UI-09 very long credentials (1000 characters) are rejected without breaking the form', async ({ loginPage }) => {
    // Arrange
    const longValue = 'x'.repeat(1000);
    await loginPage.goto();

    // Act
    await loginPage.login({ username: longValue, password: longValue });

    // Assert
    await expect(loginPage.errorMessage).toHaveText(NO_MATCH);
    await expect(loginPage.usernameInput).toHaveValue(longValue);
    await expect(loginPage.loginButton).toBeEnabled();
  });
});

test('UI-10 a login error can be dismissed', { tag: '@functional' }, async ({ loginPage }) => {
  // Arrange
  await loginPage.goto();
  await loginPage.login({ username: '', password: '' });
  await expect(loginPage.errorMessage).toBeVisible();

  // Act
  await loginPage.dismissError();

  // Assert
  await expect(loginPage.errorMessage).toBeHidden();
});
