import { describe, expect, it } from 'vitest';
import * as AppModule from './App.jsx';

describe('M4: showing who is driving', () => {
  // Like the cursor handoff in a browser agent: while the guide turns the
  // brain, say so, and keep the open hand so the player knows they can grab.
  it('shows "<Guide> is turning…" with the open-hand cursor only while the guide moves the brain', () => {
    expect(AppModule.getControlIndicator({ control: 'guide_moving', guide: 'rollo' })).toEqual({
      text: 'Rollo is turning…',
      cursor: 'grab',
    });
    expect(AppModule.getControlIndicator({ control: 'guide_moving', guide: 'sylvi' }).text).toBe('Sylvi is turning…');
    for (const control of ['guide_free', 'player_holding', 'player_exploring']) {
      expect(AppModule.getControlIndicator({ control, guide: 'rollo' }), control).toBeNull();
    }
  });

  it('shows nothing without a valid guide', () => {
    expect(AppModule.getControlIndicator({ control: 'guide_moving', guide: null })).toBeNull();
  });
});
