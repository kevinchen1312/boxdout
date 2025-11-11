// search/tokens.ts

export type TeamItem = { canon: string; label: string; tokens: string[] };

const STOP = new Set(['university','college','the','of','and','at','mbb','mens','men','basketball']);

export const norm = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export const plain = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '');

export function tokenize(label: string): string[] {
  let s = norm(label);
  s = s.replace(/\bst[.\s]+/g, 'st ');     // "St." → "st"
  s = s.replace(/\bsaint\s+/g, 'st ');     // "Saint" → "st"
  s = s.replace(/'/g, "'");                // curly → straight
  s = s.replace(/john['']s/g, 'johns');    // John's → johns
  s = s.replace(/\ba\s*&\s*m\b/g, 'am');   // A&M → am
  const words = s.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  return words.filter(w => !STOP.has(w));
}

