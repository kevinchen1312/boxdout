// scripts/leagues/acb.ts
import { Page } from 'playwright';
import { withDebug, gotoAndWait, waitForAny, toET, retry, Row } from './common';

const TZ = 'Europe/Madrid';
const LEAGUE_HOME = 'https://www.acb.com/';

const SELECTORS = [
  {
    row: 'table tbody tr',
    date: 'td:nth-child(1), .date',
    time: 'td:nth-child(2), .time',
    opp: 'td:nth-child(3), .opponent',
    compConst: 'ACB',
  },
  {
    row: '.partido, .match-row, [class*="partido"]',
    date: '.date, [class*="fecha"]',
    time: '.time, [class*="hora"]',
    opp: '.opponent, [class*="rival"]',
    compConst: 'ACB',
  },
];

const TEAM_SLUGS: Record<string, string> = {
  'Valencia Basket': 'valencia-basket',
  'Joventut Badalona': 'joventut-badalona',
};

export async function discover(page: Page, teamLabel: string): Promise<string> {
  const teamSlug = TEAM_SLUGS[teamLabel] || teamLabel.toLowerCase().replace(/\s+/g, '-');
  
  // Try direct URL first
  const directUrl = `${LEAGUE_HOME}club/${teamSlug}/calendario`;
  
  await gotoAndWait(page, LEAGUE_HOME);
  
  // Try to navigate via menu
  const equipoSelectors = [
    'a:has-text("Equipos")',
    'a:has-text("Clubs")',
    'a[href*="equipos"], a[href*="clubs"]',
  ];
  
  const equipoLink = await waitForAny(page, equipoSelectors, 3000);
  if (equipoLink) {
    await page.click(equipoLink);
    await page.waitForTimeout(1000);
    
    // Find team
    const teamSelectors = [
      `a:has-text("${teamLabel}")`,
      `a[href*="${teamSlug}"]`,
    ];
    const teamLink = await waitForAny(page, teamSelectors, 3000);
    if (teamLink) {
      await page.click(teamLink);
      await page.waitForTimeout(1000);
    }
  }
  
  // Try to find calendario link
  const calendarioSelectors = [
    'a:has-text("Calendario")',
    'a:has-text("Calendrier")',
    'a[href*="calendario"]',
  ];
  
  const calendarioLink = await waitForAny(page, calendarioSelectors, 3000);
  if (calendarioLink) {
    await page.click(calendarioLink);
    await page.waitForTimeout(1000);
  } else {
    // Fallback to direct URL
    await gotoAndWait(page, directUrl);
  }
  
  return page.url();
}

export async function scrape(page: Page, teamLabel: string): Promise<Row[]> {
  return withDebug(page, `ACB-${teamLabel}`, async () => {
    const url = await retry(() => discover(page, teamLabel));
    await gotoAndWait(page, url);
    
    const rows: Row[] = [];
    
    for (const selectorSet of SELECTORS) {
      try {
        const found = await waitForAny(page, [selectorSet.row], 3000);
        if (!found) continue;
        
        const fixtures = await page.$$eval(selectorSet.row, (elements, sel) => {
          return elements.map((el) => {
            const getText = (sel: string) => {
              const elem = el.querySelector(sel);
              return elem?.textContent?.trim() || '';
            };
            
            const dateText = sel.date.split(',').map(s => getText(s.trim())).find(t => t) || '';
            const timeText = sel.time.split(',').map(s => getText(s.trim())).find(t => t) || '';
            const oppText = sel.opp.split(',').map(s => getText(s.trim())).find(t => t) || '';
            
            return {
              date: dateText,
              time: timeText,
              opponent: oppText,
              text: el.textContent || '',
            };
          }).filter((item) => item.date && item.time && item.opponent);
        }, selectorSet);
        
        if (fixtures.length > 0) {
          for (const fixture of fixtures) {
            // Parse date (Spanish format: DD/MM/YYYY or YYYY-MM-DD)
            const dateMatch = fixture.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
            if (!dateMatch) continue;
            
            let dateStr: string;
            if (dateMatch[3]) {
              // DD/MM/YYYY
              dateStr = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
            } else {
              // YYYY-MM-DD
              dateStr = `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}`;
            }
            
            // Parse time (usually HH:MM)
            const timeMatch = fixture.time.match(/(\d{1,2}):(\d{2})/);
            if (!timeMatch) continue;
            const timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
            
            const opponent = fixture.opponent.trim();
            const isHome = /vs|vs\.|casa|domicilio/i.test(fixture.text);
            const isNeutral = /neutral/i.test(fixture.text);
            
            const { dateET, timeET } = toET(dateStr, timeStr, TZ);
            rows.push({
              dateET,
              timeET,
              comp: selectorSet.compConst,
              opp: opponent,
              hoa: isNeutral ? '*' : (isHome ? 'H' : 'A'),
              url,
            });
          }
          
          if (rows.length > 0) break;
        }
      } catch (err) {
        continue;
      }
    }
    
    return rows;
  });
}

