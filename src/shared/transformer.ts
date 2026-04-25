/**
 * tRPC data transformer.
 *
 * All tRPC response types in this app use plain JSON-serializable values
 * (numbers, strings, booleans, arrays, plain objects). There are no Date,
 * Map, Set, or BigInt values in the shared schemas, so superjson is not
 * needed and would only add bundle weight.
 *
 * If you ever need to add special types (e.g. Temporal.Instant, Decimal.js),
 * swap this back to superjson and register the custom transformer:
 * @see https://github.com/blitz-js/superjson#recipes
 */
import superjson from 'superjson';

export const transformer = superjson;
