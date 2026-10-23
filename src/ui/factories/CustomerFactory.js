import { createHash, randomUUID } from 'node:crypto';

// Deterministic 5-digit postal code derived from the id, so the same id reproduces the same customer.
const postalCodeFor = (id) => String(createHash('sha256').update(id).digest().readUInt32BE(0) % 100_000).padStart(5, '0');

/**
 * Builds checkout customer data. Pure: no I/O.
 *
 * @param {object} [overrides] fields to replace (e.g. an empty value for future validation scenarios).
 * @param {object} [options]
 * @param {string} [options.id] unique marker; random by default, fixed to reproduce the same customer.
 */
const build = (overrides = {}, { id = randomUUID().replaceAll('-', '').slice(0, 12) } = {}) => ({
  firstName: 'Qa',
  lastName: `Customer${id}`,
  postalCode: postalCodeFor(id),
  ...overrides,
});

export const CustomerFactory = Object.freeze({ build });
