import { toCents } from '../money.js';

/** Product details view (inventory-item.html?id=<id>). */
export class ProductDetailsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.name = page.getByTestId('inventory-item-name');
    this.price = page.getByTestId('inventory-item-price');
    this.description = page.getByTestId('inventory-item-desc');
    this.addButton = page.getByRole('button', { name: 'Add to cart', exact: true });
    this.backButton = page.getByTestId('back-to-products');
  }

  async gotoId(id) {
    await this.page.goto(`/inventory-item.html?id=${id}`);
  }

  /** @returns {Promise<{ name: string, priceText: string, priceCents: number }>} values as displayed */
  async getProduct() {
    const [name, priceText] = await Promise.all([this.name.innerText(), this.price.innerText()]);
    return { name: name.trim(), priceText: priceText.trim(), priceCents: toCents(priceText) };
  }

  async back() {
    await this.backButton.click();
  }
}
