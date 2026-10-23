import { createHash, randomUUID } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const addUtcDays = (date, days) => {
  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(midnightUtc + days * DAY_MS);
};

// Deterministic price in [100, 999] derived from the id, so the same id reproduces the same payload.
const priceFor = (id) => 100 + (createHash('sha256').update(id).digest().readUInt32BE(0) % 900);

/**
 * Builds Restful-Booker booking payloads. Pure: no HTTP, no shared state.
 * The unique `id` is embedded in firstname/lastname (the API has no custom fields), so together with the
 * rest of the payload it lets fixtures tell our bookings apart from other users' data on a reused booking id.
 *
 * @param {object} [overrides] top-level fields to replace; `bookingdates` is merged field by field.
 * @param {object} [options]
 * @param {string} [options.id] unique marker for names; random by default, fixed to reproduce a payload.
 * @param {Date}   [options.referenceDate] "today" used to compute dates; defaults to now.
 * @param {number} [options.daysAhead] days from referenceDate to checkin (>= 1).
 * @param {number} [options.nights] nights between checkin and checkout (>= 1).
 */
const build = (overrides = {}, { id = randomUUID().replaceAll('-', '').slice(0, 12), referenceDate = new Date(), daysAhead = 30, nights = 3 } = {}) => {
  if (!Number.isInteger(daysAhead) || daysAhead < 1) throw new RangeError(`daysAhead must be an integer >= 1, got ${daysAhead}`);
  if (!Number.isInteger(nights) || nights < 1) throw new RangeError(`nights must be an integer >= 1, got ${nights}`);

  const checkin = addUtcDays(referenceDate, daysAhead);
  const { bookingdates: dateOverrides = {}, ...fieldOverrides } = overrides;

  return {
    firstname: `Qa${id}`,
    lastname: `Booker${id}`,
    totalprice: priceFor(id),
    depositpaid: true,
    bookingdates: {
      checkin: toIsoDate(checkin),
      checkout: toIsoDate(addUtcDays(checkin, nights)),
      ...dateOverrides,
    },
    additionalneeds: 'Breakfast',
    ...fieldOverrides,
  };
};

export const BookingFactory = Object.freeze({ build });
