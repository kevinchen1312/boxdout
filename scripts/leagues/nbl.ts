// scripts/leagues/nbl.ts
import { Page } from 'playwright';
import { withDebug, gotoAndWait, waitForAny, toET, retry, Row } from './common';

// Determine timezone based on team - New Zealand teams use Pacific/Auckland
function getTimezone(teamLabel: string): string {
  const normalized = teamLabel.toLowerCase();
  if (normalized.includes('new zealand') || normalized.includes('breakers')) {
    return 'Pacific/Auckland';
  }
  return 'Australia/Melbourne';
}

const LEAGUE_HOME = 'https://www.nbl.com.au/';

const SELECTORS = [
  {
    row: '[class*="schedule"], [class*="fixture"], [class*="game"], [data-round] > *',
    date: '[class*="date"], time, .date',
    time: '[class*="time"], .time',
    opp: '[class*="opponent"], [class*="team"], .opponent, .team-name',
    compConst: 'NBL',
  },
  {
    row: 'table tbody tr, .schedule-row, [data-round] tr',
    date: 'td:nth-child(1), .date, [class*="date"], time',
    time: 'td:nth-child(2), .time, [class*="time"]',
    opp: 'td:nth-child(3), td:nth-child(4), .opponent, [class*="opponent"], .team-name',
    compConst: 'NBL',
  },
  {
    row: '.fixture-item, .game-row, [class*="fixture"], [class*="game"]',
    date: '.date, [class*="date"], time',
    time: '.time, [class*="time"]',
    opp: '.opponent, [class*="opponent"], .team-name',
    compConst: 'NBL',
  },
];

export async function discover(page: Page, teamLabel: string): Promise<string> {
  console.log(`Discovering ${teamLabel} schedule page...`);
  
  const normalized = teamLabel.toLowerCase();
  const isNewZealand = normalized.includes('new zealand') || normalized.includes('breakers');
  
  // Try direct URL first (more reliable)
  const directUrls = isNewZealand ? [
    'https://www.nbl.com.au/team/new-zealand-breakers/fixtures',
    'https://www.nbl.com.au/team/new-zealand-breakers/schedule',
    'https://www.nbl.com.au/teams/new-zealand-breakers',
    'https://www.breakers.co.nz/schedule',
    'https://www.breakers.co.nz/fixtures',
  ] : [
    'https://www.melbourneutd.com.au/schedule',
    'https://www.nbl.com.au/team/melbourne-united/fixtures',
    'https://www.nbl.com.au/team/melbourne-united/schedule',
    'https://www.nbl.com.au/teams/melbourne-united',
  ];
  
  for (const url of directUrls) {
    try {
      await gotoAndWait(page, url);
      const title = await page.title();
      console.log(`Tried ${url}, got title: ${title}`);
      if (title && !title.toLowerCase().includes('not found') && !title.toLowerCase().includes('404')) {
        return url;
      }
    } catch (err) {
      console.log(`Failed to load ${url}:`, err);
      continue;
    }
  }
  
  // Fallback: try navigation from homepage
  try {
    await gotoAndWait(page, LEAGUE_HOME);
    const title = await page.title();
    console.log(`League homepage title: ${title}`);
    
    // Try to find team link
    const teamSelectors = [
      `a:has-text("${teamLabel}")`,
      `a[href*="melbourne-united"]`,
      `a[href*="team"]:has-text("Melbourne")`,
      '.team-link, [class*="team"] a',
    ];
    
    const foundSelector = await waitForAny(page, teamSelectors, 5000);
    if (foundSelector) {
      await page.click(foundSelector);
      await page.waitForTimeout(2000);
    }
    
    // Look for fixtures/schedule link
    const fixtureSelectors = [
      'a:has-text("Fixtures")',
      'a:has-text("Schedule")',
      'a:has-text("Results")',
      'a[href*="fixture"], a[href*="schedule"]',
    ];
    
    const fixtureLink = await waitForAny(page, fixtureSelectors, 5000);
    if (fixtureLink) {
      await page.click(fixtureLink);
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.error('Navigation failed:', err);
  }
  
  return page.url();
}

export async function scrape(page: Page, teamLabel: string): Promise<Row[]> {
  return withDebug(page, `NBL-${teamLabel}`, async () => {
    const tz = getTimezone(teamLabel);
    const url = await retry(() => discover(page, teamLabel));
    await gotoAndWait(page, url);
    
    const rows: Row[] = [];
    
    // Try parsing from full page text as fallback (for Melbourne United site)
    const pageText = await page.textContent('body') || '';
    const pageHTML = await page.content();
    console.log(`Page text length: ${pageText.length}, HTML length: ${pageHTML.length}`);
    
    // Try to find schedule table or game elements
    const scheduleContent = await page.evaluate(() => {
      // Look for tables, schedule sections, or game rows
      const tables = Array.from(document.querySelectorAll('table'));
      const scheduleSections = Array.from(document.querySelectorAll('[class*="schedule"], [class*="fixture"], [class*="game"]'));
      return {
        tableCount: tables.length,
        scheduleCount: scheduleSections.length,
        sampleText: document.body?.innerText?.substring(0, 1000) || '',
      };
    });
    console.log(`Found ${scheduleContent.tableCount} tables, ${scheduleContent.scheduleCount} schedule elements`);
    console.log(`Sample text: ${scheduleContent.sampleText.substring(0, 500)}`);
    
    // Parse from schedule elements found on page
    const gameData = await page.evaluate(() => {
      const games: any[] = [];
      // Find all elements that might contain game info
      const elements = Array.from(document.querySelectorAll('[class*="schedule"], [class*="fixture"], [class*="game"]'));
      
      for (const el of elements) {
        const text = el.textContent || '';
        // Look for date patterns: "18 Sep 25" or "Sep 18, 2025" or "21 Aug 25"
        const dateMatch = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{2,4})/i);
        if (!dateMatch) continue;
        
        // Look for time: "7:30 pm" or "2:30 pm"
        const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (!timeMatch) continue;
        
        // Look for team names (not Melbourne United)
        const teamMatch = text.match(/(Tasmania|Sydney|Perth|Brisbane|Cairns|Adelaide|Illawarra|New Zealand|S\.E\. Melbourne|South East Melbourne)/i);
        if (!teamMatch) continue;
        
        games.push({
          text,
          dateMatch,
          timeMatch,
          teamMatch,
        });
      }
      return games;
    });
    
    console.log(`Found ${gameData.length} potential games from schedule elements`);
    
    for (const game of gameData) {
      try {
        const dateMatch = game.dateMatch;
        const timeMatch = game.timeMatch;
        const teamMatch = game.teamMatch;
        
        // Parse date
        let day: string, month: string, year: string;
        if (dateMatch[1]) {
          // Format: "18 Sep 25"
          day = dateMatch[1];
          month = dateMatch[2];
          year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
        } else if (dateMatch[4]) {
          // Format: "Sep 18, 2025"
          day = dateMatch[5];
          month = dateMatch[4];
          year = dateMatch[7];
        } else {
          console.log(`Could not parse date from match: ${dateMatch}`);
          continue;
        }
        
        const monthMap: Record<string, string> = {
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
          'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        const monthLower = month.toLowerCase();
        const monthNum = monthMap[monthLower];
        if (!monthNum) {
          console.log(`Invalid month: ${month}`);
          continue;
        }
        const dateStr = `${year}-${monthNum}-${String(day).padStart(2, '0')}`;
        console.log(`Parsed date: ${dateStr} from ${day} ${month} ${year}`);
        
        // Parse time
        let hour24 = parseInt(timeMatch[1]);
        const minute = timeMatch[2];
        if (timeMatch[3].toLowerCase() === 'pm' && hour24 !== 12) hour24 += 12;
        if (timeMatch[3].toLowerCase() === 'am' && hour24 === 12) hour24 = 0;
        const timeStr = `${String(hour24).padStart(2, '0')}:${minute}`;
        
        // Determine home/away
        const isHome = game.text.toLowerCase().includes('melbourne united') && 
                      game.text.toLowerCase().indexOf('melbourne united') < game.text.toLowerCase().indexOf(teamMatch[0].toLowerCase());
        
        const { dateET, timeET } = toET(dateStr, timeStr, tz);
        rows.push({
          dateET,
          timeET,
          comp: 'NBL',
          opp: teamMatch[0].trim(),
          hoa: isHome ? 'H' : 'A',
          url,
        });
      } catch (err) {
        console.log(`Error parsing game: ${err}`);
        continue;
      }
    }
    
    // If we found games, return them
    if (rows.length > 0) {
      console.log(`Successfully parsed ${rows.length} games`);
      return rows;
    }
    
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
            // Parse date
            const dateMatch = fixture.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
            if (!dateMatch) continue;
            
            const dateStr = dateMatch[3] || dateMatch[6]
              ? `${dateMatch[3] || dateMatch[6]}-${String(dateMatch[2] || dateMatch[5]).padStart(2, '0')}-${String(dateMatch[1] || dateMatch[4]).padStart(2, '0')}`
              : null;
            if (!dateStr) continue;
            
            // Parse time
            const timeMatch = fixture.time.match(/(\d{1,2}):(\d{2})/);
            if (!timeMatch) continue;
            let timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
            
            // Check for AM/PM
            const ampmMatch = fixture.time.match(/(AM|PM)/i);
            if (ampmMatch) {
              const hours = parseInt(timeMatch[1]);
              const isPM = /PM/i.test(ampmMatch[0]);
              if (isPM && hours !== 12) {
                timeStr = `${String(hours + 12).padStart(2, '0')}:${timeMatch[2]}`;
              } else if (!isPM && hours === 12) {
                timeStr = `00:${timeMatch[2]}`;
              }
            }
            
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
        // Try next selector set
        continue;
      }
    }
    
    return rows;
  });
}

