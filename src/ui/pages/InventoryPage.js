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
    this.sortSelect = page.getByTestId('product-sort-container');
    this.activeSortOption = page.getByTestId('active-option');
    this.menuButton = page.getByRole('button', { name: 'Open Menu' });
    this.logoutLink = page.getByTestId('logout-sidebar-link');
  }

  /** The product card whose name is exactly `name` (never by position). */
  item(name) {
    return this.items.filter({ has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }) });
  }

  itemPrice(name) {
    return this.item(name).getByTestId('inventory-item-price');
  }

  // The card also has image/title links with role=button, so button names must match exactly.
  addButton(name) {
    return this.item(name).getByRole('button', { name: 'Add to cart', exact: true });
  }

  removeButton(name) {
    return this.item(name).getByRole('button', { name: 'Remove', exact: true });
  }

  async productNames() {
    return this.items.getByTestId('inventory-item-name').allInnerTexts();
  }

  /** @returns {Promise<number[]>} displayed prices in integer cents, in display order */
  async productPricesCents() {
    return (await this.items.getByTestId('inventory-item-price').allInnerTexts()).map(toCents);
  }

  /** @param {'az' | 'za' | 'lohi' | 'hilo'} option value of the sort dropdown */
  async sortBy(option) {
    await this.sortSelect.selectOption(option);
  }

  /** @returns {Promise<{ name: string, priceText: string, priceCents: number }>} values as displayed in the catalog */
  async getProduct(name) {
    const priceText = (await this.itemPrice(name).innerText()).trim();
    return { name, priceText, priceCents: toCents(priceText) };
  }

  async addToCart(name) {
    await this.addButton(name).click();
  }

  async removeFromCart(name) {
    await this.removeButton(name).click();
  }

  async openCart() {
    await this.cartLink.click();
  }

  async logout() {
    await this.menuButton.click();
    await this.logoutLink.click();
  }
}
