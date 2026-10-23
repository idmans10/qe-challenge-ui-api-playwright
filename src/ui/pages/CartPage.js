export class CartPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.title = page.getByTestId('title');
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.checkoutButton = page.getByTestId('checkout');
    this.continueShoppingButton = page.getByTestId('continue-shopping');
  }

  item(name) {
    return this.items.filter({ has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }) });
  }

  itemName(name) {
    return this.item(name).getByTestId('inventory-item-name');
  }

  itemPrice(name) {
    return this.item(name).getByTestId('inventory-item-price');
  }

  itemQuantity(name) {
    return this.item(name).getByTestId('item-quantity');
  }

  async removeItem(name) {
    await this.item(name).getByRole('button', { name: 'Remove', exact: true }).click();
  }

  async continueShopping() {
    await this.continueShoppingButton.click();
  }

  async checkout() {
    await this.checkoutButton.click();
  }
}
