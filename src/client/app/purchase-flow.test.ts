import { describe, expect, it, vi } from 'vitest';
import {
  isSuccessfulOrderStatus,
  pickPromotedOffer,
  toPurchaseErrorMessage,
} from './purchase-flow';

vi.mock('@devvit/web/client', () => ({
  OrderResultStatus: {
    STATUS_SUCCESS: 'STATUS_SUCCESS',
  },
}));

describe('purchase flow helpers', () => {
  it('picks the highest-priority promoted offer from available products', () => {
    const products = [
      { sku: 'decoder_pack', label: 'Decoder' },
      { sku: 'rookie_stash', label: 'Rookie' },
    ];

    expect(pickPromotedOffer(products)).toEqual({
      sku: 'rookie_stash',
      label: 'Rookie',
    });
  });

  it('returns null when no promoted offer is available', () => {
    expect(pickPromotedOffer([{ sku: 'not-promoted' }])).toBeNull();
  });

  it('accepts only the current Devvit success status', () => {
    expect(isSuccessfulOrderStatus('STATUS_SUCCESS')).toBe(true);
    expect(isSuccessfulOrderStatus(1)).toBe(false);
    expect(isSuccessfulOrderStatus('Success')).toBe(false);
  });

  it('normalizes purchase error messages', () => {
    expect(toPurchaseErrorMessage('order not placed: retry')).toBe(
      'Unable to place your order right now. Please try again.'
    );
    expect(toPurchaseErrorMessage('No thanks')).toBe('No thanks');
    expect(toPurchaseErrorMessage(null)).toBe('Purchase canceled.');
    expect(toPurchaseErrorMessage(undefined)).toBe('Purchase canceled.');
  });
});
