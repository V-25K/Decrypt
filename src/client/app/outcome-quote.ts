const maxOutcomeQuoteWords = 18;
const maxOutcomeQuoteChars = 96;

export const truncateOutcomeQuote = (
  quote: string,
  maxWords = maxOutcomeQuoteWords,
  maxChars = maxOutcomeQuoteChars
): string => {
  const normalized = quote.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars && normalized.split(' ').length <= maxWords) {
    return normalized;
  }

  const words = normalized.split(' ');
  const wordLimited = words.length > maxWords
    ? words.slice(0, maxWords).join(' ')
    : normalized;
  const charLimited = wordLimited.length > maxChars
    ? wordLimited.slice(0, maxChars).trimEnd()
    : wordLimited;
  return `${charLimited.replace(/[.,;:!?-]+$/g, '')}....`;
};
