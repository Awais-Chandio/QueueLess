import {
  isImplausibleLocationJump,
  shouldRejectTrackedLocation,
} from '../src/services/location/locationService';

describe('location tracking safeguards', () => {
  it('rejects a non-mock intercontinental GPS jump over a few seconds', () => {
    expect(
      isImplausibleLocationJump(
        {
          latitude: 37.421998,
          longitude: -122.084,
          timestamp: 1_000,
        },
        {
          latitude: 25.4002584,
          longitude: 68.3676745,
          timestamp: 6_000,
        },
      ),
    ).toBe(true);
  });

  it('accepts ordinary movement between consecutive fixes', () => {
    expect(
      isImplausibleLocationJump(
        {
          latitude: 25.4002584,
          longitude: 68.3676745,
          timestamp: 1_000,
        },
        {
          latitude: 25.4003,
          longitude: 68.3677,
          timestamp: 6_000,
        },
      ),
    ).toBe(false);
  });

  it('accepts an emulator mock-location jump immediately', () => {
    const mountainView = {
      latitude: 37.421998,
      longitude: -122.084,
      timestamp: 1_000,
    };
    const hyderabad = {
      latitude: 25.4002584,
      longitude: 68.3676745,
      timestamp: 6_000,
    };

    expect(
      shouldRejectTrackedLocation(mountainView, hyderabad, true),
    ).toBe(false);
  });
});
