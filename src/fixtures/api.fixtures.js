import { isDeepStrictEqual } from 'node:util';
import { test as base, expect } from '@playwright/test';
import { env } from '../config/env.js';
import { AuthClient } from '../api/clients/AuthClient.js';
import { BookingClient } from '../api/clients/BookingClient.js';
import { BookingFactory } from '../api/factories/BookingFactory.js';

// `target` is a TestInfo or a TestStepInfo: both expose attach(). Missing values are shown as explicit nulls.
const attachJson = (target, name, value) =>
  target.attach(name, { body: JSON.stringify(value, (_key, v) => (v === undefined ? null : v), 2), contentType: 'application/json' });

const isJson = (response) => (response.headers()['content-type'] ?? '').includes('application/json');

const MAX_EVIDENCE_BODY_CHARS = 10_000;
// Allow-list: only /booking and /booking/<id> responses may be attached. Anything else, /auth (whose body is
// the token) included, is refused, so a new endpoint is never recorded without review.
const ATTACHABLE_PATH = /^\/booking(\/\d+)?$/;
const REDACTED_BODY = '[redacted: booking identity not verified]';
const REDACTED_NON_JSON_BODY = '[redacted: non-JSON body is not a known static response]';
// Static non-JSON bodies of the Restful-Booker contract ("<status> <exact body>"): they carry no booking data.
const KNOWN_STATIC_BODIES = new Set(['404 Not Found', '201 Created']);

// Same identity as the ownership checks: the unique factory marker in firstname + lastname, never the id alone.
// Other fields may differ (that is a functional difference worth showing), the marker may not.
const carriesOwnIdentity = (booking, ownedPayloads) =>
  booking !== null && typeof booking === 'object' && ownedPayloads.some((p) => booking.firstname === p.firstname && booking.lastname === p.lastname);

/**
 * Attaches method, status, path, content type and body of a /booking response as JSON evidence.
 * Headers are never included (requests carry the auth cookie).
 * JSON bodies may hold booking data, which on a shared server with reused ids can belong to someone else: they
 * are attached only when the booking carries the identity of one of `ownedPayloads`. Otherwise (or when the JSON
 * cannot be parsed) the body is replaced by REDACTED_BODY and only field names that differ are reported.
 * Non-JSON bodies are attached only when they are one of KNOWN_STATIC_BODIES; any other is replaced by
 * REDACTED_NON_JSON_BODY (method, path, status, content type and bodyLength are always kept).
 * Bodies longer than MAX_EVIDENCE_BODY_CHARS are cut, flagged `truncated` and described in `bodyNote`.
 * @returns {Promise<{ status: number, path: string, body: unknown, identityVerified?: boolean, data?: unknown }>}
 *   the attached evidence plus `data`: the parsed, untruncated JSON, only when the identity is verified (never attached as is)
 */
const attachResponse = async (target, name, response, { method, ownedPayloads = [] } = {}) => {
  const path = new URL(response.url()).pathname;
  if (!ATTACHABLE_PATH.test(path)) throw new Error(`evidence: refusing to attach a response from ${path} (not in the allow-list)`);

  const text = await response.text();
  const evidence = { method, status: response.status(), path, contentType: response.headers()['content-type'] ?? null, bodyLength: text.length };

  let parsed;
  if (isJson(response)) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Evidence must not replace the test's own assertion on a malformed body.
      evidence.jsonParseError = true;
    }
    const booking = parsed?.booking ?? parsed; // POST wraps the booking; GET/PUT return it directly
    evidence.identityVerified = carriesOwnIdentity(booking, ownedPayloads);
    if (!evidence.identityVerified) {
      evidence.body = REDACTED_BODY;
      const latest = ownedPayloads.at(-1);
      if (latest && booking !== null && typeof booking === 'object') {
        evidence.differingFields = [...new Set([...Object.keys(latest), ...Object.keys(booking)])].filter((key) => !isDeepStrictEqual(booking[key], latest[key]));
      }
      await attachJson(target, name, evidence);
      return { ...evidence, data: undefined };
    }
  } else if (!KNOWN_STATIC_BODIES.has(`${evidence.status} ${text}`)) {
    // A non-JSON body has no booking identity to verify (HTML/plain-text errors may echo data), so only the
    // contract's static texts are attached in clear.
    evidence.body = REDACTED_NON_JSON_BODY;
    await attachJson(target, name, evidence);
    return { ...evidence, data: undefined };
  }

  evidence.truncated = text.length > MAX_EVIDENCE_BODY_CHARS;
  if (evidence.truncated) {
    evidence.body = text.slice(0, MAX_EVIDENCE_BODY_CHARS);
    evidence.bodyNote = `INCOMPLETE: first ${MAX_EVIDENCE_BODY_CHARS} of ${text.length} characters`;
  } else {
    evidence.body = parsed ?? text;
  }
  await attachJson(target, name, evidence);
  return { ...evidence, data: evidence.identityVerified === true ? parsed : undefined };
};

/**
 * Comparison evidence for a persisted booking, computed on the parsed response (`data` from attachResponse), never
 * on the possibly truncated or redacted attachment. Without a verified identity the stored values are not ours to
 * record, so the comparison is omitted instead of reporting artificial differences.
 */
const persistenceComparison = (expected, { identityVerified, status, data }) => {
  if (identityVerified !== true) {
    return { identityVerified: false, status, comparison: 'omitted: booking identity not verified' };
  }
  const differingFields = [...new Set([...Object.keys(expected), ...Object.keys(data)])].filter((key) => !isDeepStrictEqual(expected[key], data[key]));
  const differences = Object.fromEntries(differingFields.map((key) => [key, { expected: expected[key], actual: data[key] }]));
  return { identityVerified: true, status, expected, differingFields, differences };
};

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

export { expect, attachJson, attachResponse, persistenceComparison };
