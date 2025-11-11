'use client';

import { useEffect, useState } from 'react';
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
    <div className="flex items-center gap-2" suppressHydrationWarning>
      <button
        className="border border-neutral-900 bg-white px-2.5 py-1 rounded-md font-semibold hover:bg-neutral-50 transition-colors"
        onClick={goPrevWeek}
        aria-label="Previous week"
      >
        ‹
      </button>
      <div
        className="grid [grid-auto-flow:column] [grid-auto-columns:minmax(92px,1fr)] gap-1.5"
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
              className={`border rounded-lg px-2.5 py-1.5 text-center hover:border-neutral-900 transition-colors ${
                isSelected
                  ? '!border-neutral-900 ring-2 ring-neutral-900'
                  : 'border-neutral-300'
              }`}
              onClick={() => onSelectDate(d)}
            >
              <div className="text-[11px] font-bold text-neutral-700">
                {fmtDay(d)}
              </div>
              <div className="text-[12px] text-neutral-900">
                {fmtMon(d)} {fmtNum(d)}
              </div>
            </button>
          );
        })}
      </div>
      <div className="picker">
        <input
          type="date"
          value={localYMD(selectedDate)}
          onChange={(e) => {
            const pickedDate = toLocalMidnight(parseLocalYMD(e.target.value));
            onSelectDate(pickedDate);
          }}
          aria-label="Jump to date"
          className="border border-neutral-300 rounded-lg px-2 py-1 hover:border-neutral-900 transition-colors"
        />
      </div>
      <button
        className="border border-neutral-900 bg-white px-2.5 py-1 rounded-md font-semibold hover:bg-neutral-50 transition-colors"
        onClick={goNextWeek}
        aria-label="Next week"
      >
        ›
      </button>
    </div>
  );
}

