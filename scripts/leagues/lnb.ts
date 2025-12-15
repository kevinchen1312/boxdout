// scripts/leagues/lnb.ts
import { Page } from 'playwright';
import { withDebug, gotoAndWait, waitForAny, toET, retry, Row } from './common';

const TZ = 'Europe/Paris';
const LEAGUE_HOME = 'https://www.lnb.fr/';

const SELECTORS = [
  {
    row: 'table tbody tr',
    date: 'td:nth-child(1), .date',
    time: 'td:nth-child(2), .time',
    opp: 'td:nth-child(3), .opponent',
    compConst: 'LNB Pro A',
  },
  {
    row: '.match, .game-row, [class*="match"]',
    date: '.date, [class*="date"]',
    time: '.time, [class*="heure"]',
    opp: '.opponent, [class*="adversaire"]',
    compConst: 'LNB Pro A',
  },
];

const TEAM_SLUGS: Record<string, string> = {
  'ASVEL': 'asvel',
  'Paris Basketball': 'paris-basketball',
};

export async function discover(page: Page, teamLabel: string): Promise<string> {
  const teamSlug = TEAM_SLUGS[teamLabel] || teamLabel.toLowerCase().replace(/\s+/g, '-');
  
  await gotoAndWait(page, LEAGUE_HOME);
  
  // Try to navigate via menu
  const clubsSelectors = [
    'a:has-text("Clubs")',
    'a:has-text("Équipes")',
    'a[href*="clubs"], a[href*="equipes"]',
  ];
  
  const clubsLink = await waitForAny(page, clubsSelectors, 3000);
  if (clubsLink) {
    await page.click(clubsLink);
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
  
  // Try to find calendrier link
  const calendrierSelectors = [
    'a:has-text("Calendrier")',
    'a:has-text("Matches")',
    'a[href*="calendrier"], a[href*="matches"]',
  ];
  
  const calendrierLink = await waitForAny(page, calendrierSelectors, 3000);
  if (calendrierLink) {
    await page.click(calendrierLink);
    await page.waitForTimeout(1000);
  } else {
    // Fallback to direct URL
    const directUrl = `${LEAGUE_HOME}equipe/${teamSlug}/calendrier`;
    await gotoAndWait(page, directUrl);
  }
  
  return page.url();
}

export async function scrape(page: Page, teamLabel: string): Promise<Row[]> {
  return withDebug(page, `LNB-${teamLabel}`, async () => {
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
            // Parse date (French format: DD/MM/YYYY or YYYY-MM-DD)
            const dateMatch = fixture.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
            if (!dateMatch) continue;
            
            let dateStr: string;
            if (dateMatch[3]) {
              dateStr = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
            } else {
              dateStr = `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}`;
            }
            
            // Parse time
            const timeMatch = fixture.time.match(/(\d{1,2}):(\d{2})/);
            if (!timeMatch) continue;
            const timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
            
            const opponent = fixture.opponent.trim();
            const isHome = /vs|domicile|home/i.test(fixture.text);
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







