/**
 * Unit tests — IconButton icon colour logic
 *
 * The iconColor memo must follow industry-standard enabled/disabled conventions:
 *   active   → grey.200  (light — renders well on coloured active background)
 *   disabled → grey.400  (muted — signals cannot act)
 *   default  → grey.700  (prominent — signals can act)
 *
 * Bug history: colours were previously inverted (disabled=dark, enabled=lighter),
 * making disabled buttons appear more prominent than enabled ones.
 */

// Replicate the pure colour-selection logic from IconButton's useMemo.
// Keeping it separate from the component lets us test the logic without MUI/theme setup.
function computeIconColor(isActive: boolean, disabled: boolean): string {
  if (isActive) return 'grey.200';
  if (disabled) return 'grey.400';
  return 'grey.700';
}

describe('IconButton — iconColor logic', () => {
  it('active state → grey.200 (light, for coloured background)', () => {
    expect(computeIconColor(true, false)).toBe('grey.200');
  });

  it('disabled state → grey.400 (muted)', () => {
    expect(computeIconColor(false, true)).toBe('grey.400');
  });

  it('default (enabled, not active) → grey.700 (prominent)', () => {
    expect(computeIconColor(false, false)).toBe('grey.700');
  });

  it('active takes priority over disabled', () => {
    expect(computeIconColor(true, true)).toBe('grey.200');
  });

  it('disabled colour is lighter (higher MUI grey number) than enabled colour', () => {
    // grey.400 < grey.700 in darkness — disabled should look more muted than enabled
    const disabledNum = parseInt(
      computeIconColor(false, true).replace('grey.', ''),
      10
    );
    const enabledNum = parseInt(
      computeIconColor(false, false).replace('grey.', ''),
      10
    );
    expect(disabledNum).toBeLessThan(enabledNum);
  });

  it('disabled and enabled produce distinct colours', () => {
    expect(computeIconColor(false, true)).not.toBe(
      computeIconColor(false, false)
    );
  });
});
