// scripts/leagues/aba_kls.ts
import { Page } from 'playwright';
import { withDebug, gotoAndWait, waitForAny, toET, retry, Row } from './common';

const TZ = 'Europe/Belgrade';
const ABA_HOME = 'https://www.aba-liga.com/';

const SELECTORS = [
  {
    // Mega Superbet website structure: games are in month sections with format "DD Day - HH:MM"
    row: 'h4, h5, [class*="month"], section h4',
    date: null, // Will parse from parent section
    time: null, // Will parse from text
    opp: null, // Will parse from text
    compConst: 'ABA',
    parseFromText: true, // Flag to use text parsing
  },
  {
    row: 'table tbody tr',
    date: 'td:nth-child(1), .date',
    time: 'td:nth-child(2), .time',
    opp: 'td:nth-child(3), .opponent',
    compConst: 'ABA',
  },
  {
    row: '.match, [class*="match"]',
    date: '.date, [class*="datum"]',
    time: '.time, [class*="vreme"]',
    opp: '.opponent, [class*="protivnik"]',
    compConst: 'ABA',
  },
];

export async function discover(page: Page, teamLabel: string): Promise<string> {
  // Use direct URL to Mega Superbet schedule page
  const directUrl = 'https://www.bcmegabasket.net/en/aba-liga/aba-liga-2026-2026/';
  return directUrl;
}

export async function scrape(page: Page, teamLabel: string): Promise<Row[]> {
  return withDebug(page, `ABA-KLS-${teamLabel}`, async () => {
    const rows: Row[] = [];
    
    // Try ABA League
    try {
      const abaUrl = await retry(() => discover(page, teamLabel));
      await gotoAndWait(page, abaUrl);
      
      // First try: parse from page text (Mega Superbet website format)
      // Try to get the main content area, not the whole body
      let pageText = '';
      const contentSelectors = [
        'main',
        'article',
        '.content',
        '[class*="content"]',
        '[class*="schedule"]',
        '[class*="fixture"]',
        '#main-content',
      ];
      
      for (const selector of contentSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            pageText = await element.textContent() || '';
            if (pageText.length > 500) {
              console.log(`Using content from selector: ${selector}`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Fallback to body if no content area found
      if (!pageText || pageText.length < 500) {
        pageText = await page.textContent('body') || '';
      }
      
      console.log(`Page text length: ${pageText.length} chars`);
      
      // Parse from single-line text format
      // Format: "October 202505 Sun - 17:00Cedevita Olimpija117 - 81Mega SuperbetMatch Report..."
      const gameMatches: Array<{date: string, time: string, opponent: string, isHome: boolean}> = [];
      
      // Split by month headers first
      const monthPattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi;
      const months: Array<{name: string, year: string, start: number, end: number}> = [];
      const allMatches: Array<{name: string, year: string, index: number}> = [];
      
      // Find all month headers first
      let match;
      while ((match = monthPattern.exec(pageText)) !== null) {
        allMatches.push({
          name: match[1],
          year: match[2],
          index: match.index,
        });
      }
      
      // Create month sections
      for (let i = 0; i < allMatches.length; i++) {
        const current = allMatches[i];
        const next = allMatches[i + 1];
        months.push({
          name: current.name,
          year: current.year,
          start: current.index + (current.name + ' ' + current.year).length,
          end: next ? next.index : pageText.length,
        });
      }
      
      console.log(`Found ${months.length} month sections`);
      
      // Process each month section
      for (const month of months) {
        const sectionText = pageText.substring(month.start, month.end);
        console.log(`Processing ${month.name} ${month.year}, section length: ${sectionText.length}`);
        
        // Find all game times in this section: "05 Sun - 17:00" or "16 Sun - 20:00"
        const gameTimePattern = /(\d{1,2})\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*-\s*(\d{1,2}):(\d{2})/gi;
        let gameMatch;
        
        while ((gameMatch = gameTimePattern.exec(sectionText)) !== null) {
          const day = parseInt(gameMatch[1]);
          const hour = parseInt(gameMatch[3]);
          const minute = parseInt(gameMatch[4]);
          const gameStart = gameMatch.index;
          // Look ahead more chars to capture full opponent name, but stop at next game
          const nextGameMatch = sectionText.substring(gameStart + 20).match(/\d{1,2}\s+(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*-\s*\d{1,2}:/);
          const gameEnd = nextGameMatch 
            ? gameStart + 20 + (nextGameMatch.index ?? 0)
            : Math.min(gameStart + 300, sectionText.length);
          const gameText = sectionText.substring(gameStart, gameEnd);
          
          console.log(`Found game: ${day} ${month.name} ${month.year} at ${hour}:${minute}`);
          
          // Extract opponent from the text after the time
          let opponent = '';
          let isHome = false;
          
          // Pattern 1: "Mega SuperbetVSZadar" or "Mega SuperbetVSBudućnost VOLI" (home, no space after VS)
          // Match team name after "Mega SuperbetVS" - be more permissive with characters
          const vsHomeMatch1 = gameText.match(/Mega SuperbetVS([A-Z][A-Za-z\sćčžšđ]+?)(?:\s*Match Report|$|\d{1,2}\s+(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)|(?=\d{1,2}\s+(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)))/);
          if (vsHomeMatch1) {
            opponent = vsHomeMatch1[1].trim();
            isHome = true;
          }
          // Pattern 2: "Mega Superbet VS Zadar" (home, with spaces)
          else {
            const vsHomeMatch2 = gameText.match(/Mega Superbet\s+VS\s+([A-Z][^V]*?)(?:Match Report|$|\d|Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
            if (vsHomeMatch2) {
              opponent = vsHomeMatch2[1].trim();
              isHome = true;
            }
            // Pattern 3: "Spartak Office ShoesVSMega Superbet" or "Budućnost VOLIVSMega Superbet" (away, no space)
            else {
              // Match team name before "VSMega Superbet", handling multi-word team names
              const vsAwayMatch1 = gameText.match(/([A-Z][A-Za-z\s]+?)(?:VSMega Superbet|VSMega)/);
              if (vsAwayMatch1) {
                opponent = vsAwayMatch1[1].trim();
                isHome = false;
              }
              // Pattern 4: "Spartak Office Shoes VS Mega Superbet" (away, with spaces)
              else {
                const vsAwayMatch2 = gameText.match(/([A-Z][^V]*?)\s+VS\s+Mega Superbet/);
                if (vsAwayMatch2) {
                  opponent = vsAwayMatch2[1].trim();
                  isHome = false;
                }
                // Pattern 5: Score format "Cedevita Olimpija117 - 81Mega Superbet" (away)
                else {
                  const scoreAwayMatch = gameText.match(/([A-Z][^0-9]*?)\d+\s*-\s*\d+Mega Superbet/);
                  if (scoreAwayMatch) {
                    opponent = scoreAwayMatch[1].trim();
                    isHome = false;
                  }
                  // Pattern 6: Score format "Mega Superbet106 - 88Bosna BH Telecom" (home)
                  else {
                    const scoreHomeMatch = gameText.match(/Mega Superbet\d+\s*-\s*\d+([A-Z][^M]*?)(?:Match Report|$)/);
                    if (scoreHomeMatch) {
                      opponent = scoreHomeMatch[1].trim();
                      isHome = true;
                    }
                  }
                }
              }
            }
          }
          
          if (opponent) {
            // Clean up opponent name - remove day names, times, scores, etc.
            opponent = opponent
              .replace(/\d+/g, '') // Remove numbers
              .replace(/Match Report/gi, '')
              .replace(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*-\s*:/gi, '') // Remove "Sun - :" patterns
              .replace(/:\s*/g, '') // Remove colons
              .replace(/^\s*-\s*/, '') // Remove leading dashes
              .trim();
            
            // Fix common issues
            if (opponent.includes('Vienna') && opponent.includes('Sun')) {
              opponent = opponent.replace(/Vienna.*?Sun.*?/, '').trim();
            }
            if (opponent.startsWith('Sun -')) {
              opponent = opponent.replace(/^Sun\s*-\s*/, '').trim();
            }
            // Fix "VOLI" -> "Budućnost VOLI" (from "Budućnost VOLIVSMega")
            if (opponent === 'VOLI' || opponent.endsWith('VOLI')) {
              // Look back in gameText to find full name
              const buducnostMatch = gameText.match(/(Budućnost\s+VOLI)/);
              if (buducnostMatch) {
                opponent = buducnostMatch[1];
              } else {
                opponent = 'Budućnost VOLI';
              }
            }
            // Remove "Vienna" prefix if it appears before team name
            if (opponent.startsWith('Vienna ')) {
              opponent = opponent.replace(/^Vienna\s+/, '');
            }
            
            // Convert month name to number
            const monthMap: Record<string, string> = {
              'January': '01', 'February': '02', 'March': '03', 'April': '04',
              'May': '05', 'June': '06', 'July': '07', 'August': '08',
              'September': '09', 'October': '10', 'November': '11', 'December': '12',
            };
            const monthNum = monthMap[month.name] || '01';
            const dateStr = `${month.year}-${monthNum}-${String(day).padStart(2, '0')}`;
            const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            
            console.log(`  -> ${dateStr} ${timeStr}: ${isHome ? 'H' : 'A'} vs ${opponent}`);
            
            gameMatches.push({
              date: dateStr,
              time: timeStr,
              opponent: opponent,
              isHome: isHome,
            });
          } else {
            console.log(`  -> Could not extract opponent from: ${gameText.substring(0, 100)}`);
          }
        }
      }
      
      // Convert to rows
      for (const game of gameMatches) {
        const { dateET, timeET } = toET(game.date, game.time, TZ);
        rows.push({
          dateET,
          timeET,
          comp: 'ABA',
          opp: game.opponent,
          hoa: game.isHome ? 'H' : 'A',
          url: abaUrl,
        });
      }
      
      // Fallback: try selector-based parsing if text parsing didn't work
      if (rows.length === 0) {
        for (const selectorSet of SELECTORS) {
          if (selectorSet.parseFromText) continue; // Skip text-based selector
          
          try {
            const found = await waitForAny(page, [selectorSet.row], 3000);
            if (!found) continue;
            
            const fixtures = await page.$$eval(selectorSet.row, (elements, sel) => {
              return elements.map((el) => {
                const getText = (sel: string) => {
                  const elem = el.querySelector(sel);
                  return elem?.textContent?.trim() || '';
                };
                
                const dateText = sel.date ? sel.date.split(',').map(s => getText(s.trim())).find(t => t) || '' : '';
                const timeText = sel.time ? sel.time.split(',').map(s => getText(s.trim())).find(t => t) || '' : '';
                const oppText = sel.opp ? sel.opp.split(',').map(s => getText(s.trim())).find(t => t) || '' : '';
                
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
                const isHome = /vs|domaci|home/i.test(fixture.text);
                const isNeutral = /neutral/i.test(fixture.text);
                
                const { dateET, timeET } = toET(dateStr, timeStr, TZ);
                rows.push({
                  dateET,
                  timeET,
                  comp: 'ABA',
                  opp: opponent,
                  hoa: isNeutral ? '*' : (isHome ? 'H' : 'A'),
                  url: abaUrl,
                });
              }
              
              if (rows.length > 0) break;
            }
          } catch (err) {
            continue;
          }
        }
      }
    } catch (err) {
      console.error('ABA scraping failed:', err);
    }
    
    // TODO: Try KLS if needed (similar structure)
    
    return rows;
  });
}

