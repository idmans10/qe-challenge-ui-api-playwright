/**
 * Converts a displayed amount ("$29.99", "Item total: $39.98") to integer cents.
 * Working in cents keeps money comparisons exact; anything that is not a single "$d.dd" amount throws.
 */
export const toCents = (text) => {
  const match = /\$(\d+)\.(\d{2})(?!\d)/.exec(text);
  if (!match || text.indexOf('$') !== text.lastIndexOf('$')) {
    throw new Error(`cannot parse a single money amount from ${JSON.stringify(text)}`);
  }
  return Number(match[1]) * 100 + Number(match[2]);
};
