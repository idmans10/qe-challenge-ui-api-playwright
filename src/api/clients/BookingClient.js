const ACCEPT_JSON = { Accept: 'application/json' };
const JSON_BODY = { ...ACCEPT_JSON, 'Content-Type': 'application/json' };

/**
 * Restful-Booker /booking endpoints. Returns raw APIResponse objects: no assertions, no retries,
 * so tests decide what a correct (or an expected negative) response is.
 * The token lives in a private field and is only sent as the documented `Cookie: token=<token>` header.
 */
export class BookingClient {
  #request;
  #token;

  /**
   * @param {import('@playwright/test').APIRequestContext} request
   * @param {{ token?: string }} [options] without a token, PUT/DELETE are sent unauthenticated.
   */
  constructor(request, { token } = {}) {
    this.#request = request;
    this.#token = token;
  }

  create(payload) {
    return this.#request.post('/booking', { data: payload, headers: JSON_BODY });
  }

  get(bookingId) {
    return this.#request.get(`/booking/${bookingId}`, { headers: ACCEPT_JSON });
  }

  update(bookingId, payload) {
    return this.#request.put(`/booking/${bookingId}`, { data: payload, headers: { ...JSON_BODY, ...this.#authHeaders() } });
  }

  delete(bookingId) {
    return this.#request.delete(`/booking/${bookingId}`, { headers: this.#authHeaders() });
  }

  #authHeaders() {
    return this.#token ? { Cookie: `token=${this.#token}` } : {};
  }
}
