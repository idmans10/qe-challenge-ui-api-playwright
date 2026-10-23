import { createHash, randomUUID } from 'node:crypto';

// Deterministic 5-digit postal code derived from the id, so the same id reproduces the same customer.
const postalCodeFor = (id) => String(createHash('sha256').update(id).digest().readUInt32BE(0) % 100_000).padStart(5, '0');

// Names must be valid customer data (letters only), so digits of the id are mapped to letters g-p.
const lettersOnly = (id) => id.replace(/[0-9]/g, (digit) => 'ghijklmnop'[digit]);

/**
 * Builds checkout customer data. Pure: no I/O.
 *
 * @param {object} [overrides] fields to replace (e.g. an empty value for future validation scenarios).
 * @param {object} [options]
 * @param {string} [options.id] unique marker; random by default, fixed to reproduce the same customer.
 */
const build = (overrides = {}, { id = randomUUID().replaceAll('-', '').slice(0, 12) } = {}) => ({
  firstName: 'Qa',
  lastName: `Customer${lettersOnly(id)}`,
  postalCode: postalCodeFor(id),
  ...overrides,
});

export const CustomerFactory = Object.freeze({ build });
