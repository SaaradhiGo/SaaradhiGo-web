import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HeroMapPanel, cityForMarket } from './HeroCityMap';

describe('home hero map', () => {
  it('shows Hyderabad in India and Boise in the US', () => {
    expect(cityForMarket('IN')).toBe('hyderabad');
    expect(cityForMarket('US')).toBe('boise');
  });

  it('labels the pins with the real places and credits OpenStreetMap', () => {
    const { container } = render(<HeroMapPanel market="IN" pickup="Pickup" drop="Drop" card={<span>status</span>} />);
    expect(container.querySelector('.hmap--hyderabad-desk')).not.toBeNull();
    expect(container.querySelector('.hmap--hyderabad-photo')).not.toBeNull();
    expect(container.textContent).toContain('HITEC City');
    expect(container.textContent).toContain('Charminar');
    expect(container.textContent).toContain('© OpenStreetMap contributors');
  });

  it('puts the driver card under the map, never over it', () => {
    const { container } = render(<HeroMapPanel market="US" pickup="Pickup" drop="Drop" card={<span>status</span>} />);
    const view = container.querySelector('.hmap__view');
    const foot = container.querySelector('.hmap__foot');
    expect(container.querySelector('.hmap--boise-desk')).not.toBeNull();
    expect(foot?.textContent).toBe('status');
    expect(view?.contains(foot as Node)).toBe(false);
  });
});
