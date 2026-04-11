import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Icon } from '../Icon';
import { Icon as IconI } from 'src/types';

describe('Icon', () => {
  const flatIcon: IconI = {
    id: 'flaticon',
    name: 'flat icon',
    url: 'src/assets/grid-tile-bg.svg',
    isIsometric: false
  };

  const isometricIcon: IconI = {
    id: 'isoicon',
    name: 'isometric icon',
    url: 'src/assets/grid-tile-bg.svg',
    isIsometric: true
  };

  it('renders an img element for a flat icon', () => {
    render(<Icon icon={flatIcon} />);
    expect(screen.getByAltText('flat icon')).toBeInTheDocument();
  });

  it('renders an img element for an isometric icon', () => {
    render(<Icon icon={isometricIcon} />);
    expect(screen.getByAltText('isometric icon')).toBeInTheDocument();
  });
});
