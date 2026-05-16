import type { TRPCCombinedDataTransformer } from '@trpc/server';

const identityTransform = {
  serialize: (value: unknown): unknown => value,
  deserialize: (value: unknown): unknown => value,
};

export const transformer: TRPCCombinedDataTransformer = {
  input: identityTransform,
  output: identityTransform,
};
