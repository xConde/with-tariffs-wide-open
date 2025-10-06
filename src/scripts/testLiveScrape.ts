#!/usr/bin/env ts-node
import 'dotenv/config';
import { scrapeEconomicCalendar } from '../scraper';
import { CalendarEvent } from '../models/event';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalEvents: number;
    uniqueDates: number;
    eventsWithForecasts: number;
    eventsWithActuals: number;
    fedSpeeches: number;
  };
}

function validateEventStructure(event: CalendarEvent): string[] {
  const errors: string[] = [];

  if (!event.date) errors.push('Missing date field');
  if (!event.time) errors.push('Missing time field');
  if (!event.title) errors.push('Missing title field');

  // Validate date format: "MONDAY, OCT. 6"
  if (event.date && !/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY), (JAN\.|FEB\.|MAR\.|APR\.|MAY|JUNE|JULY|AUG\.|SEPT\.|OCT\.|NOV\.|DEC\.) \d{1,2}$/i.test(event.date)) {
    errors.push(`Invalid date format: "${event.date}"`);
  }

  // Validate time format: "8:30 am" or "12:45 pm" or "TBA"
  if (event.time && !/^\d{1,2}:\d{2} (am|pm)$/i.test(event.time) && event.time !== 'TBA') {
    errors.push(`Invalid time format: "${event.time}"`);
  }

  return errors;
}

function analyzeEvents(events: CalendarEvent[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate each event structure
  events.forEach((event, index) => {
    const eventErrors = validateEventStructure(event);
    eventErrors.forEach(err => errors.push(`Event ${index + 1}: ${err}`));
  });

  // Calculate statistics
  const uniqueDates = new Set(events.map(e => e.date)).size;
  const eventsWithForecasts = events.filter(e => e.forecast && e.forecast.trim() !== '').length;
  const eventsWithActuals = events.filter(e => e.actual && e.actual.trim() !== '').length;
  const fedSpeeches = events.filter(e => e.title.toLowerCase().includes('fed') && e.title.toLowerCase().includes('speak')).length;

  // Warnings
  if (events.length === 0) {
    warnings.push('No events scraped - MarketWatch may have changed structure');
  }

  if (uniqueDates === 0) {
    warnings.push('No valid date headers found');
  }

  if (eventsWithForecasts === 0 && events.length > 10) {
    warnings.push('No forecast values found - unusual for economic calendar');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalEvents: events.length,
      uniqueDates,
      eventsWithForecasts,
      eventsWithActuals,
      fedSpeeches,
    },
  };
}

async function main() {
  console.log('🔍 Live Scraper Validation Test\n');
  console.log('Scraping MarketWatch economic calendar...\n');

  try {
    const startTime = Date.now();
    const events = await scrapeEconomicCalendar();
    const duration = Date.now() - startTime;

    console.log(`✅ Scrape completed in ${duration}ms\n`);

    const validation = analyzeEvents(events);

    // Print statistics
    console.log('📊 Statistics:');
    console.log(`   Total Events: ${validation.stats.totalEvents}`);
    console.log(`   Unique Dates: ${validation.stats.uniqueDates}`);
    console.log(`   Events with Forecasts: ${validation.stats.eventsWithForecasts}`);
    console.log(`   Events with Actuals: ${validation.stats.eventsWithActuals}`);
    console.log(`   Fed Speeches: ${validation.stats.fedSpeeches}\n`);

    // Print sample events
    if (events.length > 0) {
      console.log('📋 Sample Events (first 3):');
      events.slice(0, 3).forEach((event, i) => {
        console.log(`\n   ${i + 1}. ${event.date} at ${event.time}`);
        console.log(`      Title: ${event.title}`);
        if (event.forecast) console.log(`      Forecast: ${event.forecast}`);
        if (event.previous) console.log(`      Previous: ${event.previous}`);
        if (event.actual) console.log(`      Actual: ${event.actual}`);
      });
      console.log('');
    }

    // Print validation results
    if (validation.errors.length > 0) {
      console.log('❌ VALIDATION ERRORS:');
      validation.errors.forEach(err => console.log(`   - ${err}`));
      console.log('');
    }

    if (validation.warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      validation.warnings.forEach(warn => console.log(`   - ${warn}`));
      console.log('');
    }

    if (validation.valid) {
      console.log('✅ All validations passed! Scraper is working correctly.\n');
      process.exit(0);
    } else {
      console.log('❌ Validation failed. Scraper may need updates.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Scrape failed:', error);
    console.log('\nPossible causes:');
    console.log('   - Network connection issues');
    console.log('   - MarketWatch changed HTML structure');
    console.log('   - Rate limiting/blocking');
    process.exit(1);
  }
}

main();
