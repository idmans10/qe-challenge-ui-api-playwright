import { toCents } from '../money.js';

/** Covers the three checkout screens: customer information, overview and completion. */
export class CheckoutPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.title = page.getByTestId('title');

    // Step one: customer information
    this.firstNameInput = page.getByTestId('firstName');
    this.lastNameInput = page.getByTestId('lastName');
    this.postalCodeInput = page.getByTestId('postalCode');
    this.continueButton = page.getByTestId('continue');
    this.errorMessage = page.getByTestId('error');

    // Step two: overview
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.subtotalLabel = page.getByTestId('subtotal-label');
    this.taxLabel = page.getByTestId('tax-label');
    this.totalLabel = page.getByTestId('total-label');
    this.finishButton = page.getByTestId('finish');

    // Completion
    this.completeHeader = page.getByTestId('complete-header');
    this.completeText = page.getByTestId('complete-text');
  }

  async fillCustomer({ firstName, lastName, postalCode }) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
  }

  async continue() {
    await this.continueButton.click();
  }

  item(name) {
    return this.items.filter({ has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }) });
  }

  itemPrice(name) {
    return this.item(name).getByTestId('inventory-item-price');
  }

  /** @returns {Promise<{ subtotalCents: number, taxCents: number, totalCents: number }>} amounts as displayed */
  async getTotals() {
    const [subtotal, tax, total] = await Promise.all([this.subtotalLabel, this.taxLabel, this.totalLabel].map((label) => label.innerText()));
    return { subtotalCents: toCents(subtotal), taxCents: toCents(tax), totalCents: toCents(total) };
  }

  async finish() {
    await this.finishButton.click();
  }
}
