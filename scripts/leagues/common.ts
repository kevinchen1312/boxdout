// scripts/leagues/common.ts
import { Page } from 'playwright';
import { DateTime } from 'luxon';
import fs from 'node:fs';
import path from 'node:path';

export type Row = {
  dateET: string;
  timeET: string;
  comp: string;
  opp: string;
  hoa: 'H' | 'A' | '*';
  venue?: string;
  url: string;
};

const DEBUG_DIR = path.resolve('debug');
const ensure = (p: string) => fs.mkdirSync(p, { recursive: true });
ensure(DEBUG_DIR);

let DEBUG_MODE = false;

export function setDebugMode(enabled: boolean) {
  DEBUG_MODE = enabled;
}

export async function withDebug<T>(
  page: Page,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (DEBUG_MODE) {
      await saveDebug(page, name);
    }
    throw error;
  }
}

export async function saveDebug(page: Page, name: string): Promise<void> {
  ensure(DEBUG_DIR);
  const safeName = name.replace(/[^a-zA-Z0-9-]/g, '_');
  
  try {
    // Save HTML
    const html = await page.content();
    fs.writeFileSync(
      path.join(DEBUG_DIR, `${safeName}.html`),
      html,
      'utf8'
    );
    
    // Save screenshot
    await page.screenshot({
      path: path.join(DEBUG_DIR, `${safeName}.png`),
      fullPage: true,
    });
    
    // Save network log (simplified - just URL and status)
    const networkLog = {
      url: page.url(),
      title: await page.title(),
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(DEBUG_DIR, `${safeName}-network.json`),
      JSON.stringify(networkLog, null, 2),
      'utf8'
    );
    
    console.log(`Debug files saved: debug/${safeName}.*`);
  } catch (err) {
    console.error(`Failed to save debug files for ${name}:`, err);
  }
}

export async function gotoAndWait(page: Page, url: string): Promise<void> {
  // Use load event to ensure page is fully loaded
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForLoadState('load');
  // Wait for JavaScript to render dynamic content
  await page.waitForTimeout(5000);
  
  // Try to wait for any content to appear
  try {
    await page.waitForSelector('body', { timeout: 10000 });
    // Wait a bit more for dynamic content
    await page.waitForTimeout(3000);
  } catch (err) {
    // Continue anyway
  }
}

export async function waitForAny(
  page: Page,
  selectors: string[],
  timeout: number = 8000
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout });
      return selector;
    } catch {
      // Try next selector
    }
  }
  return null;
}

export function toET(dateStr: string, timeStr: string, tz: string): { dateET: string; timeET: string } {
  // dateStr like '2025-11-14', timeStr like '19:30'
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: tz });
  const et = dt.setZone('America/New_York');
  return { dateET: et.toFormat('yyyy-LL-dd'), timeET: et.toFormat('HH:mm') };
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number } = {}
): Promise<T> {
  const { retries = 3, delay = 500 } = options;
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}

const OUT_DIR = path.resolve('public/data/pro_schedules');
ensure(OUT_DIR);

export function writeTxt(file: string, rows: Row[]): void {
  // Remove duplicates based on date, time, opponent, competition
  const uniqueRows = Array.from(
    new Map(
      rows.map((r) => [`${r.dateET}-${r.timeET}-${r.opp}-${r.comp}`, r])
    ).values()
  );
  
  // Sort by date, then time
  uniqueRows.sort((a, b) => {
    const dateCompare = a.dateET.localeCompare(b.dateET);
    if (dateCompare !== 0) return dateCompare;
    return a.timeET.localeCompare(b.timeET);
  });

  const text = uniqueRows
    .map((r) => [
      r.dateET,
      `${r.timeET} ET`,
      r.comp,
      r.opp,
      r.hoa,
      r.venue || '',
      r.url,
    ].join(', '))
    .join('\n');
  
  fs.writeFileSync(path.join(OUT_DIR, file), text + '\n', 'utf8');
  console.log(`Wrote ${uniqueRows.length} games to ${file}`);
}

