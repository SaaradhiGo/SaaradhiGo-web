import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HeroCityMapCard, HeroCityMapSide, cityForMarket } from './HeroCityMap';

describe('home hero map', () => {
  it('shows Hyderabad in India and Boise in the US', () => {
    expect(cityForMarket('IN')).toBe('hyderabad');
    expect(cityForMarket('US')).toBe('boise');
  });

  it('labels the pins with the real places and credits OpenStreetMap', () => {
    const { container } = render(<HeroCityMapSide market="IN" pickup="Pickup" drop="Drop" card={<span>status</span>} />);
    expect(container.querySelector('.hmap--hyderabad-desk')).not.toBeNull();
    expect(container.textContent).toContain('HITEC City');
    expect(container.textContent).toContain('Charminar');
    expect(container.textContent).toContain('© OpenStreetMap contributors');
  });

  it('puts the status card under the map on phones, not over it', () => {
    const { container } = render(<HeroCityMapCard market="US" card={<span>status</span>} />);
    const photo = container.querySelector('.hmap--boise-card');
    const foot = container.querySelector('.hmap-foot');
    expect(photo).not.toBeNull();
    expect(foot?.textContent).toBe('status');
    expect(photo?.contains(foot as Node)).toBe(false);
  });
});
