import { roundMoney } from './money';

describe('roundMoney', () => {
  it('rounds floating point sums to two decimals', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds half-cent values using standard currency precision', () => {
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it('keeps ordinary cent values unchanged', () => {
    expect(roundMoney(59.98)).toBe(59.98);
  });
});
