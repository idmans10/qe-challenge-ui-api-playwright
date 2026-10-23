import { toCents } from '../money.js';

export class InventoryPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.title = page.getByTestId('title');
    this.inventoryList = page.getByTestId('inventory-list');
    this.items = this.inventoryList.getByTestId('inventory-item');
    this.cartBadge = page.getByTestId('shopping-cart-badge');
    this.cartLink = page.getByTestId('shopping-cart-link');
  }

  /** The product card whose name is exactly `name` (never by position). */
  item(name) {
    return this.items.filter({ has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }) });
  }

  itemPrice(name) {
    return this.item(name).getByTestId('inventory-item-price');
  }

  async productNames() {
    return this.items.getByTestId('inventory-item-name').allInnerTexts();
  }

  /** @returns {Promise<{ name: string, priceText: string, priceCents: number }>} values as displayed in the catalog */
  async getProduct(name) {
    const priceText = (await this.itemPrice(name).innerText()).trim();
    return { name, priceText, priceCents: toCents(priceText) };
  }

  async addToCart(name) {
    // The card also has image/title links with role=button, so the accessible name must match exactly.
    await this.item(name).getByRole('button', { name: 'Add to cart', exact: true }).click();
  }

  async openCart() {
    await this.cartLink.click();
  }
}
