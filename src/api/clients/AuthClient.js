/**
 * POST /auth. Restful-Booker answers HTTP 200 with `{ reason: "Bad credentials" }` on bad credentials,
 * so success is defined by the presence of a token, not by the status code alone.
 * Error messages never include the token or the password.
 */
export class AuthClient {
  #request;

  /** @param {import('@playwright/test').APIRequestContext} request */
  constructor(request) {
    this.#request = request;
  }

  /** @returns {Promise<string>} */
  async createToken({ username, password }) {
    const response = await this.#request.post('/auth', {
      data: { username, password },
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });

    const status = response.status();
    const contentType = response.headers()['content-type'] ?? '';
    if (status !== 200 || !contentType.includes('application/json')) {
      throw new Error(`auth: POST /auth returned HTTP ${status} (content-type: ${contentType || 'none'})`);
    }

    const body = await response.json();
    if (typeof body.token !== 'string' || body.token.length === 0) {
      throw new Error(`auth: POST /auth returned HTTP 200 without token (reason: ${body.reason ?? 'not provided'})`);
    }
    return body.token;
  }
}
