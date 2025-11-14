// scripts/leagues/eurocup.ts
import { Page } from 'playwright';
import { withDebug, gotoAndWait, waitForAny, toET, retry, Row } from './common';

const LEAGUE_HOME = 'https://www.eurocupbasketball.com/';

const TEAM_TZ: Record<string, string> = {
  'Joventut Badalona': 'Europe/Madrid',
  'Paris Basketball': 'Europe/Paris',
};

const TEAM_SLUGS: Record<string, string> = {
  'Joventut Badalona': 'joventut-badalona',
  'Paris Basketball': 'paris-basketball',
};

const REALGM_URLS: Record<string, string> = {
  'Joventut Badalona': 'https://basketball.realgm.com/international/league/2/Eurocup/team/16/Joventut-Badalona/schedule',
  'ASVEL': 'https://basketball.realgm.com/international/league/2/Eurocup/team/89/ASVEL-Basket/schedule',
};

const SELECTORS = [
  {
    row: 'table tbody tr, .schedule-row, [data-game]',
    date: 'td:nth-child(1), td:nth-child(2), .date, [class*="date"]',
    time: 'td:nth-child(3), .time, [class*="time"]',
    opp: 'td:nth-child(4), td:nth-child(5), .team-name, .opponent, [class*="team"]',
    compConst: 'EuroCup',
  },
  {
    row: '.game-card, .match-item, [class*="game"]',
    date: '.date, [class*="date"]',
    time: '.time, [class*="time"]',
    opp: '.team-name, .opponent, [class*="team"]',
    compConst: 'EuroCup',
  },
];

export async function discover(page: Page, teamLabel: string): Promise<string> {
  const teamSlug = TEAM_SLUGS[teamLabel] || teamLabel.toLowerCase().replace(/\s+/g, '-');
  
  // Try RealGM URL first if available
  const realgmUrl = REALGM_URLS[teamLabel];
  if (realgmUrl) {
    try {
      await gotoAndWait(page, realgmUrl);
      const title = await page.title();
      if (title && !title.toLowerCase().includes('not found') && !title.toLowerCase().includes('404')) {
        return realgmUrl;
      }
    } catch (err) {
      console.log(`RealGM URL failed for ${teamLabel}, trying fallback:`, err);
    }
  }
  
  await gotoAndWait(page, LEAGUE_HOME);
  
  // Try to navigate via Clubs menu
  const clubsSelectors = [
    'a:has-text("Clubs")',
    'a[href*="clubs"]',
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
  
  // Look for schedule
  const scheduleSelectors = [
    'a:has-text("Schedule")',
    'a:has-text("Calendrier")',
    'a[href*="schedule"]',
  ];
  
  const scheduleLink = await waitForAny(page, scheduleSelectors, 3000);
  if (scheduleLink) {
    await page.click(scheduleLink);
    await page.waitForTimeout(1000);
  } else {
    // Fallback to direct URL
    const directUrl = `${LEAGUE_HOME}eurocup/teams/${teamSlug}/schedule/`;
    await gotoAndWait(page, directUrl);
  }
  
  return page.url();
}

export async function scrape(page: Page, teamLabel: string): Promise<Row[]> {
  return withDebug(page, `EuroCup-${teamLabel}`, async () => {
    const tz = TEAM_TZ[teamLabel] || 'Europe/Madrid';
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
            const dateMatch = fixture.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
            if (!dateMatch) continue;
            
            let dateStr: string;
            if (dateMatch[3]) {
              dateStr = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
            } else {
              dateStr = `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}`;
            }
            
            const timeMatch = fixture.time.match(/(\d{1,2}):(\d{2})/);
            if (!timeMatch) continue;
            const timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
            
            const opponent = fixture.opponent.trim();
            const isHome = /vs|home/i.test(fixture.text);
            const isNeutral = /neutral/i.test(fixture.text);
            
            const { dateET, timeET } = toET(dateStr, timeStr, tz);
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

