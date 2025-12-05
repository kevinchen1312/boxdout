'use client';

import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  startOfWeekLocal,
  addDaysLocal,
  toLocalMidnight,
  localYMD,
  parseLocalYMD,
} from '../utils/dateKey';

type Props = {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
};

const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
const fmtMon = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
const fmtNum = (d: Date) => d.getDate();

export default function WeekDatePicker({ selectedDate, onSelectDate }: Props) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => setIsClient(true), []);

  if (!isClient) {
    return <div className="flex items-center gap-2" aria-hidden="true" />;
  }

  const sow = startOfWeekLocal(selectedDate);

  const goPrevWeek = () => onSelectDate(addDaysLocal(sow, -1)); // select Sat of prev week
  const goNextWeek = () => onSelectDate(addDaysLocal(sow, 7)); // select next Sun

  return (
    <div className="date-nav-row" suppressHydrationWarning>
      <button
        className="date-nav-arrow date-nav-arrow-left"
        onClick={goPrevWeek}
        aria-label="Previous week"
      >
        ‹
      </button>
      <div
        className="date-pill-row"
        role="tablist"
        aria-label="Choose day"
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDaysLocal(sow, i);
          const isSelected = localYMD(d) === localYMD(selectedDate);

          return (
            <button
              key={i}
              role="tab"
              aria-selected={isSelected}
              className={`date-chip ${isSelected ? 'is-active' : ''}`}
              onClick={() => onSelectDate(d)}
            >
              <div style={{ fontSize: '11px', fontWeight: '600' }}>
                {fmtDay(d)}
              </div>
              <div style={{ fontSize: '12px' }}>
                {fmtMon(d)} {fmtNum(d)}
              </div>
            </button>
          );
        })}
      </div>
      <button
        className="date-nav-arrow date-nav-arrow-right"
        onClick={goNextWeek}
        aria-label="Next week"
      >
        ›
      </button>
      <DatePicker
        selected={selectedDate}
        onChange={(date: Date | null) => {
          if (date) {
            onSelectDate(toLocalMidnight(date));
          }
        }}
        className="planner-date-input"
        calendarClassName="planner-calendar"
        dateFormat="MMM d, yyyy"
        aria-label="Jump to date"
      />
    </div>
  );
}

