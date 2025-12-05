// Scoring (exact > startsWith > whole-word > substring; anti-Arkansas penalty for "kansas")

import { canonFromInput, norm, plain } from './teams';

const words = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

export function scoreTeam(qRaw: string, label: string, canon: string) {
  const q = norm(qRaw);
  const L = norm(label);
  const w = words(label);

  const exact = Number(L === q);
  const starts = Number(L.startsWith(q));
  const whole = Number(w.includes(q));
  const substr = Number(L.includes(q));
  const len = -Math.abs(L.length - q.length);

  const antiArkansas = (q === 'kansas' && /arkansas/.test(L)) ? -100 : 0;

  // If alias resolves exactly to Kansas, boost Kansas canon
  const resolved = canonFromInput(qRaw);
  const canonBoost = Number(resolved === plain('Kansas') && canon === plain('Kansas'));

  // tuple sort (desc)
  return [canonBoost, exact, starts, whole, substr, antiArkansas, len] as const;
}






