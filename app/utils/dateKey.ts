// Local timezone date utilities (no UTC/ISO)

export const toLocalMidnight = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const localYMD = (d: Date) => {
  const x = toLocalMidnight(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`; // e.g., 2025-11-11 in LOCAL TZ
};

// Parse "YYYY-MM-DD" as LOCAL (avoid new Date('YYYY-MM-DD'))
export const parseLocalYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m as number) - 1, d as number);
};

export const startOfWeekLocal = (d: Date) => {
  const x = toLocalMidnight(d);
  const dow = x.getDay(); // 0=Sun
  x.setDate(x.getDate() - dow);
  return x;
};

export const addDaysLocal = (d: Date, n: number) => {
  const x = toLocalMidnight(d);
  x.setDate(x.getDate() + n);
  return x;
};

