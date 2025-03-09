export interface CalendarEvent {
  date: string;
  time: string;
  title: string;
  period: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}
