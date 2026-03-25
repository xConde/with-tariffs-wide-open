import { describe, it, expect } from '@jest/globals';
import {
  predictBeat,
  isLowerBetter,
  getBeatMissIndicator,
  buildNotificationEmbed,
  buildUpdatedNotificationEmbed,
} from '../../src/events/notifierMessage';
import { CalendarEvent } from '../../src/models/event';
import {
  EMBED_COLOR_WARNING_30MIN,
  EMBED_COLOR_WARNING_1MIN,
  EMBED_COLOR_DEFAULT,
  EMBED_COLOR_SUCCESS,
  EMBED_COLOR_FAILURE,
} from '../../src/config/constants';

describe('Notification Message Functions', () => {
  describe('predictBeat', () => {
    it('should return beat when actual > forecast', () => {
      expect(predictBeat('5.2%', '5.0%')).toBe('beat');
      expect(predictBeat('100', '99')).toBe('beat');
      expect(predictBeat('0.1%', '0.0%')).toBe('beat');
    });

    it('should return miss when actual < forecast', () => {
      expect(predictBeat('4.8%', '5.0%')).toBe('miss');
      expect(predictBeat('99', '100')).toBe('miss');
    });

    it('should return neutral when actual equals forecast', () => {
      expect(predictBeat('5.0%', '5.0%')).toBe('neutral');
      expect(predictBeat('100', '100')).toBe('neutral');
    });

    it('should return neutral for NaN values', () => {
      expect(predictBeat('N/A', '5.0%')).toBe('neutral');
      expect(predictBeat('5.0%', 'N/A')).toBe('neutral');
      expect(predictBeat('', '')).toBe('neutral');
      expect(predictBeat('abc', 'xyz')).toBe('neutral');
    });

    it('should handle negative numbers correctly', () => {
      expect(predictBeat('-2.0%', '-3.0%')).toBe('beat');
      expect(predictBeat('-4.0%', '-3.0%')).toBe('miss');
      expect(predictBeat('-5.0%', '-5.0%')).toBe('neutral');
    });

    it('should strip non-numeric characters before comparing', () => {
      expect(predictBeat('$5.2', '$5.0')).toBe('beat');
      expect(predictBeat('3.0K', '4.0K')).toBe('miss');
    });

    it('GDP higher than forecast → beat (higher is better)', () => {
      expect(predictBeat('3.5%', '3.0%', 'GDP')).toBe('beat');
    });

    it('CPI higher than forecast → miss (lower is better)', () => {
      expect(predictBeat('3.5%', '3.0%', 'CPI')).toBe('miss');
    });

    it('Unemployment lower than forecast → beat (lower is better)', () => {
      expect(predictBeat('3.8%', '4.0%', 'Unemployment Rate')).toBe('beat');
    });

    it('Jobless claims lower than forecast → beat (lower is better)', () => {
      expect(predictBeat('210K', '220K', 'Initial Jobless Claims')).toBe('beat');
    });

    it('Unknown indicator higher than forecast → beat (default higher is better)', () => {
      expect(predictBeat('105', '100', 'Consumer Confidence')).toBe('beat');
    });
  });

  describe('isLowerBetter', () => {
    it('should return true for unemployment indicators', () => {
      expect(isLowerBetter('Unemployment Rate')).toBe(true);
      expect(isLowerBetter('Initial Jobless Claims')).toBe(true);
    });

    it('should return true for inflation indicators', () => {
      expect(isLowerBetter('CPI')).toBe(true);
      expect(isLowerBetter('Core Inflation Rate')).toBe(true);
      expect(isLowerBetter('PCE Price Index')).toBe(true);
      expect(isLowerBetter('Consumer Price Index')).toBe(true);
      expect(isLowerBetter('Producer Price Index')).toBe(true);
    });

    it('should return true for trade/debt indicators', () => {
      expect(isLowerBetter('Trade Deficit')).toBe(true);
      expect(isLowerBetter('National Debt')).toBe(true);
      expect(isLowerBetter('Import Price Index')).toBe(true);
      expect(isLowerBetter('Export Price Index')).toBe(true);
    });

    it('should return false for growth indicators', () => {
      expect(isLowerBetter('GDP')).toBe(false);
      expect(isLowerBetter('Nonfarm Payrolls')).toBe(false);
      expect(isLowerBetter('Retail Sales')).toBe(false);
      expect(isLowerBetter('Consumer Confidence')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isLowerBetter('UNEMPLOYMENT RATE')).toBe(true);
      expect(isLowerBetter('cpi')).toBe(true);
    });
  });

  describe('getBeatMissIndicator', () => {
    it('should return up arrow for beat', () => {
      expect(getBeatMissIndicator('beat')).toBe('\u2191 Higher');
    });

    it('should return down arrow for miss', () => {
      expect(getBeatMissIndicator('miss')).toBe('\u2193 Lower');
    });

    it('should return dash for neutral', () => {
      expect(getBeatMissIndicator('neutral')).toBe('\u2013 Expected');
    });
  });

  describe('buildNotificationEmbed', () => {
    function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
      return {
        date: 'MONDAY, DEC. 29',
        time: '8:30 am',
        title: 'GDP Report',
        period: 'Q4',
        forecast: '3.0%',
        previous: '2.8%',
        ...overrides,
      };
    }

    it('should use 30-minute color for windowMinutes=30', () => {
      const embed = buildNotificationEmbed(30, [makeEvent()]);
      const json = embed.toJSON();
      expect(json.color).toBe(EMBED_COLOR_WARNING_30MIN);
    });

    it('should use 1-minute color for windowMinutes=1', () => {
      const embed = buildNotificationEmbed(1, [makeEvent()]);
      const json = embed.toJSON();
      expect(json.color).toBe(EMBED_COLOR_WARNING_1MIN);
    });

    it('should use singular "Event" label for one event', () => {
      const embed = buildNotificationEmbed(30, [makeEvent()]);
      const json = embed.toJSON();
      expect(json.title).toBe('Event \u2014 30-Minutes Alert');
    });

    it('should use plural "Events" label for multiple events', () => {
      const embed = buildNotificationEmbed(1, [makeEvent(), makeEvent({ title: 'CPI' })]);
      const json = embed.toJSON();
      expect(json.title).toBe('Events \u2014 1-Minute Alert');
    });

    it('should include forecast and previous in field value', () => {
      const embed = buildNotificationEmbed(30, [makeEvent({ forecast: '3.0%', previous: '2.8%' })]);
      const json = embed.toJSON();
      const fieldValue = json.fields?.[0].value || '';
      expect(fieldValue).toContain('Forecast: 3.0%');
      expect(fieldValue).toContain('Prev: 2.8%');
    });

    it('should include event title in bold', () => {
      const embed = buildNotificationEmbed(30, [makeEvent({ title: 'Nonfarm Payrolls' })]);
      const json = embed.toJSON();
      const fieldValue = json.fields?.[0].value || '';
      expect(fieldValue).toContain('**Nonfarm Payrolls**');
    });

    it('should handle events with no forecast or previous', () => {
      const embed = buildNotificationEmbed(30, [makeEvent({ forecast: undefined, previous: undefined })]);
      const json = embed.toJSON();
      const fieldValue = json.fields?.[0].value || '';
      expect(fieldValue).toContain('**GDP Report**');
      expect(fieldValue).not.toContain('Forecast:');
      expect(fieldValue).not.toContain('Prev:');
    });

    it('should show "No data available" when given empty events array', () => {
      const embed = buildNotificationEmbed(30, []);
      const json = embed.toJSON();
      expect(json.fields?.[0].value).toBe('No data available');
    });

    it('should format custom window minutes', () => {
      const embed = buildNotificationEmbed(15, [makeEvent()]);
      const json = embed.toJSON();
      expect(json.title).toBe('Event \u2014 15-Minute Alert');
    });
  });

  describe('buildUpdatedNotificationEmbed', () => {
    function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
      return {
        date: 'MONDAY, DEC. 29',
        time: '8:30 am',
        title: 'GDP Report',
        period: 'Q4',
        actual: '3.2%',
        forecast: '3.0%',
        previous: '2.8%',
        ...overrides,
      };
    }

    it('should have title "Event Results"', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent()]);
      const json = embed.toJSON();
      expect(json.title).toBe('Event Results');
    });

    it('should use success color when single event beats forecast', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent({ actual: '3.5%', forecast: '3.0%' })]);
      const json = embed.toJSON();
      expect(json.color).toBe(EMBED_COLOR_SUCCESS);
    });

    it('should use failure color when single event misses forecast', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent({ actual: '2.5%', forecast: '3.0%' })]);
      const json = embed.toJSON();
      expect(json.color).toBe(EMBED_COLOR_FAILURE);
    });

    it('should use default color when single event is neutral', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent({ actual: '3.0%', forecast: '3.0%' })]);
      const json = embed.toJSON();
      expect(json.color).toBe(EMBED_COLOR_DEFAULT);
    });

    it('should use default color for multiple events regardless of results', () => {
      const embed = buildUpdatedNotificationEmbed([
        makeEvent({ actual: '5.0%', forecast: '3.0%' }),
        makeEvent({ actual: '1.0%', forecast: '3.0%', title: 'CPI' }),
      ]);
      const json = embed.toJSON();
      expect(json.color).toBe(EMBED_COLOR_DEFAULT);
    });

    it('should include actual value with beat/miss indicator', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent({ actual: '3.5%', forecast: '3.0%' })]);
      const json = embed.toJSON();
      const fieldValue = json.fields?.[0].value || '';
      expect(fieldValue).toContain('Actual: 3.5%');
      expect(fieldValue).toContain('\u2191 Higher');
    });

    it('should include forecast and previous in results', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent()]);
      const json = embed.toJSON();
      const fieldValue = json.fields?.[0].value || '';
      expect(fieldValue).toContain('Forecast: 3.0%');
      expect(fieldValue).toContain('Prev: 2.8%');
    });

    it('should show "No updated data available" for empty events', () => {
      const embed = buildUpdatedNotificationEmbed([]);
      const json = embed.toJSON();
      expect(json.fields?.[0].value).toBe('No updated data available');
    });

    it('should handle event with no actual value', () => {
      const embed = buildUpdatedNotificationEmbed([makeEvent({ actual: undefined })]);
      const json = embed.toJSON();
      const fieldValue = json.fields?.[0].value || '';
      expect(fieldValue).not.toContain('Actual:');
      expect(fieldValue).toContain('Forecast: 3.0%');
    });
  });
});
