import { isDeepStrictEqual } from 'node:util';
import { test as base, expect } from '@playwright/test';
import { env } from '../config/env.js';
import { AuthClient } from '../api/clients/AuthClient.js';
import { BookingClient } from '../api/clients/BookingClient.js';
import { BookingFactory } from '../api/factories/BookingFactory.js';

const attachJson = (testInfo, name, value) =>
  testInfo.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });

const isJson = (response) => (response.headers()['content-type'] ?? '').includes('application/json');

/**
 * Ownership = the booking currently stored under `id` is exactly one of the payloads this test sent
 * (each payload carries a unique factory marker in its names). The id alone is never enough: the public
 * server resets periodically and reuses ids.
 * @returns {Promise<{ owned: boolean, status: number, differingFields?: string[] }>}
 */
const checkOwnership = async (client, id, versions) => {
  const response = await client.get(id);
  const status = response.status();
  if (status !== 200 || !isJson(response)) return { owned: false, status };

  const actual = await response.json();
  if (versions.some((expected) => isDeepStrictEqual(actual, expected))) return { owned: true, status };

  // Report field names only: a foreign booking's values are not ours to log.
  const latest = versions.at(-1);
  const keys = new Set([...Object.keys(latest), ...Object.keys(actual)]);
  return { owned: false, status, differingFields: [...keys].filter((key) => !isDeepStrictEqual(actual[key], latest[key])) };
};

/**
 * Teardown for one tracked booking: GET first, DELETE only if the stored booking is ours, then confirm with GET.
 * Residual risk: another client can replace the booking between our GET and DELETE (no conditional DELETE exists).
 */
const cleanUp = async (client, id, versions) => {
  const ownership = await checkOwnership(client, id, versions);
  const statuses = { get: ownership.status };

  if (ownership.status === 404) return { id, outcome: 'already absent (GET 404), no DELETE sent', ok: true, statuses };
  if (ownership.differingFields) {
    return { id, outcome: `fixture: ownership mismatch, no DELETE sent (differing fields: ${ownership.differingFields.join(', ')})`, ok: false, statuses };
  }
  if (!ownership.owned) return { id, outcome: 'fixture: ownership could not be verified, no DELETE sent', ok: false, statuses };

  statuses.delete = (await client.delete(id)).status();
  if (statuses.delete !== 201) return { id, outcome: 'unexpected DELETE status', ok: false, statuses };

  statuses.getAfterDelete = (await client.get(id)).status();
  const gone = statuses.getAfterDelete === 404;
  return { id, outcome: gone ? 'deleted in teardown (confirmed by GET 404)' : 'DELETE returned 201 but booking is still reachable', ok: gone, statuses };
};

export const test = base.extend({
  // Test-scoped and shared by cleanup and authorized operations: one /auth call per test.
  // Requested by bookingCleanup, so cleanup capability is proven before any booking is created.
  authToken: async ({ request }, use) => {
    let token;
    try {
      token = await new AuthClient(request).createToken(env.booker);
    } catch (error) {
      throw new Error(`fixture: cleanup authentication failed before creating test data: ${error.message}`, { cause: error });
    }
    await use(token);
  },

  bookingClient: async ({ request }, use) => {
    await use(new BookingClient(request));
  },

  authorizedBookingClient: async ({ request, authToken }, use) => {
    await use(new BookingClient(request, { token: authToken }));
  },

  bookingCleanup: async ({ request, authToken }, use, testInfo) => {
    const client = new BookingClient(request, { token: authToken });
    const tracked = new Map(); // id -> payloads this test sent for that booking (acceptable stored states)

    const track = (id, payload) => {
      if (!Number.isInteger(id) || id <= 0) throw new Error(`fixture: cannot track invalid booking id ${JSON.stringify(id)}`);
      tracked.set(id, [payload]);
    };

    await use({
      /**
       * Registers the booking from a POST /booking response before the caller asserts anything, whatever the status.
       * @returns {Promise<number | undefined>} the tracked id, or undefined when the response exposes none.
       */
      async trackCreated(response, payload) {
        const body = isJson(response) ? await response.json() : undefined;
        if (Number.isInteger(body?.bookingid) && body.bookingid > 0) {
          track(body.bookingid, payload);
          return body.bookingid;
        }
        testInfo.annotations.push({
          type: 'cleanup-limitation',
          description: `POST /booking returned HTTP ${response.status()} without a recoverable bookingid; a booking created by this call cannot be cleaned up`,
        });
        return undefined;
      },

      // Call before a PUT: both the previous and the new payload remain valid proof of ownership.
      recordUpdate(id, payload) {
        if (!tracked.has(id)) throw new Error(`fixture: booking ${id} is not tracked`);
        tracked.get(id).push(payload);
      },

      // Call before a destructive operation in a test.
      async assertOwnership(id) {
        if (!tracked.has(id)) throw new Error(`fixture: booking ${id} is not tracked`);
        const ownership = await checkOwnership(client, id, tracked.get(id));
        if (!ownership.owned) {
          throw new Error(`fixture: ownership mismatch for booking ${id} (GET ${ownership.status}${ownership.differingFields ? `; differing fields: ${ownership.differingFields.join(', ')}` : ''})`);
        }
      },

      has: (id) => tracked.has(id),
    });

    // Runs after the test body whether it passed or failed.
    if (tracked.size === 0) return;

    const results = [];
    for (const [id, versions] of tracked) {
      try {
        results.push(await cleanUp(client, id, versions));
      } catch (error) {
        results.push({ id, outcome: `error: ${error.message}`, ok: false, statuses: {} });
      }
    }

    await attachJson(testInfo, 'cleanup-report', results);
    const failures = results.filter((result) => !result.ok);
    if (failures.length > 0) {
      throw new Error(`fixture: booking cleanup failed for ${failures.length}/${results.length} booking(s): ${JSON.stringify(failures)}`);
    }
  },

  // Precondition booking created through the API and registered for cleanup before the test body runs.
  booking: async ({ bookingClient, bookingCleanup }, use, testInfo) => {
    const payload = BookingFactory.build();
    await attachJson(testInfo, 'precondition-booking-payload', payload);

    const response = await bookingClient.create(payload);
    const id = await bookingCleanup.trackCreated(response, payload);
    if (response.status() !== 200 || id === undefined) {
      throw new Error(`fixture: precondition booking setup failed: POST /booking returned HTTP ${response.status()}: ${(await response.text()).slice(0, 200)}`);
    }

    await use({ id, payload });
  },
});

export { expect, attachJson };
