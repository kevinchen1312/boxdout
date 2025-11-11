// ET date keys (match ESPN days exactly)

export const etYMD = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`; // YYYY-MM-DD in ET
};

// Use only for rendering a header date object from the ET key:
export const parseETYMD = (s: string) => {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
};

