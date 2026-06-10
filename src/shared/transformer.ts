import type { TRPCCombinedDataTransformer } from '@trpc/server';

// The tRPC transformer for this app is an intentional NO-OP.
//
// Why identity (not superjson):
// Every tRPC payload in this app is composed of JSON-safe primitives only:
// string, number (incl. integer timestamps), boolean, null, array, and plain
// objects. The hot path runs inside a Reddit webview, so we avoid the
// runtime + bundle cost of a richer serializer.
//
// What this means for procedure authors — DO NOT return any of:
//   - Date              (use Date.now() and pass the integer instead)
//   - Map / Set         (use Record<string, ...> / array instead)
//   - BigInt            (use string or number)
//   - RegExp            (use string)
//   - Buffer / Uint8Array
//   - undefined as a non-optional property value
//
// Any of the above will round-trip incorrectly across the JSON boundary —
// either turning into "[object Object]", `{}`, throwing during JSON.stringify,
// or silently disappearing. The accompanying `transformer.test.ts` exercises
// the round-trip contract for representative shapes; the typed test there
// asserts that JSON.stringify + JSON.parse is structurally a no-op so the
// identity transformer is provably safe.
//
// If you find yourself wanting to return one of the forbidden types, either
// convert it at the boundary (server-side) or, if it's truly needed wholesale,
// migrate this module to `superjson` and update every router accordingly.
//
// Devvit-docs confirmation: the Devvit Web client<->server boundary is
// JSON-serializable only (e.g. post data is documented "JSON-serializable
// objects only"; realtime messages are typed `JSONValue`). An identity
// transformer is therefore the correct, friction-free choice for this app.

const identityTransform = {
  serialize: (value: unknown): unknown => value,
  deserialize: (value: unknown): unknown => value,
};

export const transformer: TRPCCombinedDataTransformer = {
  input: identityTransform,
  output: identityTransform,
};
