import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HeroMapPanel, cityForMarket } from './HeroCityMap';

describe('home hero map', () => {
  it('shows Hyderabad in India and Boise in the US', () => {
    expect(cityForMarket('IN')).toBe('hyderabad');
    expect(cityForMarket('US')).toBe('boise');
  });

  it('shows the city itself, named, with no made-up trip (20 Nov, owner)', () => {
    const { container } = render(<HeroMapPanel market="IN" status="Launching soon" card={<span>facts</span>} />);
    expect(container.querySelector('.hmap--hyderabad-desk-city')).not.toBeNull();
    expect(container.querySelector('.hmap--hyderabad-photo-city')).not.toBeNull();
    expect(container.textContent).not.toContain('Hyderabad'); // copy never names the city (layout check)
    expect(container.textContent).toContain('Launching soon');
    expect(container.textContent).not.toContain('Charminar');
    expect(container.querySelector('.hmap-pin')).toBeNull();
    expect(container.textContent).toContain('© OpenStreetMap contributors');
  });

  it('puts the facts under the map, never over it', () => {
    const { container } = render(<HeroMapPanel market="US" status="Launching soon" card={<span>facts</span>} />);
    const view = container.querySelector('.hmap__view');
    const foot = container.querySelector('.hmap__foot');
    expect(container.querySelector('.hmap--boise-desk-city')).not.toBeNull();
    expect(foot?.textContent).toBe('facts');
    expect(view?.contains(foot as Node)).toBe(false);
  });
});
