import { alphabet, type CipherType } from '../../shared/game.ts';
import { randInt, shuffleWithRng, type Rng } from './rng.ts';

const alphabetLetters = alphabet.split('');
const commonLetters = ['E', 'T', 'A', 'O', 'I', 'N', 'S'] as const;

const reverseMapping = (): Record<string, number> => {
  const mapping: Record<string, number> = {};
  for (const [i, letter] of alphabetLetters.entries()) {
    mapping[letter] = 26 - i;
  }
  return mapping;
};

const shiftMapping = (shiftAmount: number): Record<string, number> => {
  const mapping: Record<string, number> = {};
  for (const [i, letter] of alphabetLetters.entries()) {
    const shifted = ((i + shiftAmount) % 26) + 1;
    mapping[letter] = shifted;
  }
  return mapping;
};

const randomMapping = (rng: Rng): Record<string, number> => {
  const shuffledNumbers = shuffleWithRng(
    Array.from({ length: 26 }, (_unused, index) => index + 1),
    rng
  );
  const mapping: Record<string, number> = {};
  for (const [i, letter] of alphabetLetters.entries()) {
    const mapped = shuffledNumbers[i];
    if (mapped === undefined) {
      continue;
    }
    mapping[letter] = mapped;
  }
  return mapping;
};

const hasIdentityMapping = (mapping: Record<string, number>): boolean =>
  alphabetLetters.some((letter, index) => mapping[letter] === index + 1);

const hasCommonLetterCollision = (
  mapping: Record<string, number>,
  previousMapping: Record<string, number> | null | undefined
): boolean => {
  if (!previousMapping) {
    return false;
  }
  return commonLetters.some((letter) => {
    const current = mapping[letter];
    const previous = previousMapping[letter];
    return current !== undefined && previous !== undefined && current === previous;
  });
};

const chooseShiftAvoidingCollision = (params: {
  initialShiftAmount: number;
  previousMapping: Record<string, number> | null | undefined;
  rng: Rng;
  retryLimit: number;
}): number => {
  const normalizedInitial = ((params.initialShiftAmount - 1 + 25) % 25) + 1;
  const remainingShifts = Array.from({ length: 25 }, (_unused, index) => index + 1).filter(
    (shift) => shift !== normalizedInitial
  );
  const orderedCandidates = [
    normalizedInitial,
    ...shuffleWithRng(remainingShifts, params.rng),
  ].slice(0, params.retryLimit);

  for (const shiftAmount of orderedCandidates) {
    const mapping = shiftMapping(shiftAmount);
    if (!hasCommonLetterCollision(mapping, params.previousMapping)) {
      return shiftAmount;
    }
  }
  throw new Error('ANTI_CHEAT_MAPPING_UNSATISFIED');
};

const chooseRandomAvoidingCollision = (params: {
  previousMapping: Record<string, number> | null | undefined;
  rng: Rng;
  retryLimit: number;
}): Record<string, number> => {
  for (let attempt = 0; attempt < params.retryLimit; attempt += 1) {
    const mapping = randomMapping(params.rng);
    if (
      !hasCommonLetterCollision(mapping, params.previousMapping) &&
      !hasIdentityMapping(mapping)
    ) {
      return mapping;
    }
  }
  throw new Error('ANTI_CHEAT_MAPPING_UNSATISFIED');
};

export const buildCipherMapping = (params: {
  cipherType: CipherType;
  shiftAmount: number;
  rng?: Rng;
  previousMapping?: Record<string, number> | null;
  retryLimit?: number;
}): { mapping: Record<string, number>; shiftAmount: number } => {
  const retryLimit = params.retryLimit ?? 64;
  if (params.cipherType === 'reverse') {
    return { mapping: reverseMapping(), shiftAmount: 0 };
  }

  if (params.cipherType === 'shift') {
    if (!params.rng) {
      throw new Error('RNG_REQUIRED_FOR_SHIFT');
    }
    const shiftAmount = chooseShiftAvoidingCollision({
      initialShiftAmount: params.shiftAmount,
      previousMapping: params.previousMapping,
      rng: params.rng,
      retryLimit,
    });
    return {
      mapping: shiftMapping(shiftAmount),
      shiftAmount,
    };
  }

  if (!params.rng) {
    throw new Error('RNG_REQUIRED_FOR_RANDOM');
  }
  return {
    mapping: chooseRandomAvoidingCollision({
      previousMapping: params.previousMapping,
      rng: params.rng,
      retryLimit,
    }),
    shiftAmount: 0,
  };
};

export const invertCipherMapping = (
  mapping: Record<string, number>
): Record<string, string> => {
  const reverse: Record<string, string> = {};
  for (const letter of Object.keys(mapping)) {
    const numberKey = `${mapping[letter]}`;
    reverse[numberKey] = letter;
  }
  return reverse;
};

export const chooseCipherType = (
  logicalPercent: number,
  rng: Rng
): { cipherType: 'random' | 'shift'; shiftAmount: number } => {
  const roll = rng() * 100;
  if (roll < logicalPercent) {
    return {
      cipherType: 'shift',
      shiftAmount: randInt(rng, 1, 25),
    };
  }
  return { cipherType: 'random', shiftAmount: 0 };
};
