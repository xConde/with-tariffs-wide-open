import { CalendarEvent } from '../models/event';
import { createLogger } from './logger';

const log = createLogger('validation');

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a single event structure
 */
export function validateEvent(event: CalendarEvent): ValidationResult {
  const errors: string[] = [];

  if (!event.date || event.date.trim() === '') {
    errors.push('Missing or empty date field');
  }

  if (!event.time || event.time.trim() === '') {
    errors.push('Missing or empty time field');
  }

  if (!event.title || event.title.trim() === '') {
    errors.push('Missing or empty title field');
  }

  // Validate date format: "MONDAY, OCT. 6"
  const datePattern = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY), (JAN\.|FEB\.|MAR\.|APR\.|MAY|JUNE|JULY|AUG\.|SEPT\.|OCT\.|NOV\.|DEC\.) \d{1,2}$/i;
  if (event.date && !datePattern.test(event.date)) {
    errors.push(`Invalid date format: "${event.date}"`);
  }

  // Validate time format: "8:30 am", "12:45 pm", or "TBA"
  const timePattern = /^\d{1,2}:\d{2} (am|pm)$/i;
  if (event.time && !timePattern.test(event.time) && event.time !== 'TBA') {
    errors.push(`Invalid time format: "${event.time}"`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an array of events
 */
export function validateEvents(events: CalendarEvent[]): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(events)) {
    errors.push('Events must be an array');
    return { valid: false, errors };
  }

  if (events.length === 0) {
    errors.push('Events array is empty');
    return { valid: false, errors };
  }

  events.forEach((event, index) => {
    const result = validateEvent(event);
    if (!result.valid) {
      errors.push(`Event ${index + 1}: ${result.errors.join(', ')}`);
    }
  });

  // Additional aggregate validations
  const uniqueDates = new Set(events.map(e => e.date)).size;
  if (uniqueDates === 0) {
    errors.push('No valid date headers found');
  }

  // Should have at least some events with data
  const hasAnyData = events.some(e =>
    e.forecast?.trim() || e.previous?.trim() || e.actual?.trim()
  );

  if (!hasAnyData && events.length > 5) {
    errors.push('Suspicious: No forecast/previous/actual values in any events');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if scraped data is acceptable to save
 * Returns true if valid, false if should keep old data
 */
export function shouldAcceptScrapedData(events: CalendarEvent[]): boolean {
  const validation = validateEvents(events);

  if (!validation.valid) {
    log.error('Scraped data failed validation', { errors: validation.errors.join('; ') });
    return false;
  }

  // Minimum threshold: should have at least 5 events
  if (events.length < 5) {
    log.warn(`Only ${events.length} events scraped (expected 20+). Rejecting.`);
    return false;
  }

  return true;
}
