export class LoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.usernameInput = page.getByTestId('username');
    this.passwordInput = page.getByTestId('password');
    this.loginButton = page.getByTestId('login-button');
    this.errorMessage = page.getByTestId('error');
    this.errorDismissButton = page.getByTestId('error-button');
  }

  // Protected views render the login form (with an error) when there is no session.
  async gotoPath(path) {
    await this.page.goto(path);
  }

  async dismissError() {
    await this.errorDismissButton.click();
  }

  async goto() {
    await this.page.goto('/');
  }

  async fillCredentials({ username, password }) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.loginButton.click();
  }

  async login(user) {
    await this.fillCredentials(user);
    await this.submit();
  }
}
