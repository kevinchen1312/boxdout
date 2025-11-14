// scripts/fetch-pro-schedules.ts
import { chromium, type Browser } from 'playwright';
import { setDebugMode, writeTxt, Row } from './leagues/common';
import * as nbl from './leagues/nbl';
import * as acb from './leagues/acb';
import * as lnb from './leagues/lnb';
import * as abaKls from './leagues/aba_kls';
import * as euroleague from './leagues/euroleague';
import * as eurocup from './leagues/eurocup';

// Parse CLI args
const args = process.argv.slice(2);
const DEBUG = args.includes('--debug');
const HEADFUL = args.includes('--headful');
const playersArg = args.find(arg => arg.startsWith('--players='));
const PLAYERS = playersArg ? playersArg.split('=')[1].split(',') : null;

setDebugMode(DEBUG);

// Rate limiting helper
async function rateLimit() {
  await new Promise(resolve => setTimeout(resolve, 350 + Math.random() * 200));
}

async function run() {
  const browser = await chromium.launch({ 
    headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  // Block heavy assets (but allow JavaScript and CSS for dynamic content)
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const resourceType = route.request().resourceType();
    
    // Always allow JavaScript, CSS, and document requests
    if (resourceType === 'script' || resourceType === 'stylesheet' || resourceType === 'document') {
      route.continue();
      return;
    }
    
    // Block fonts, analytics, ads
    if (
      url.match(/\.(woff|woff2|ttf|otf|eot)$/i) ||
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('facebook.net') ||
      url.includes('doubleclick') ||
      url.includes('ads') ||
      url.includes('advertising')
    ) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  try {
    // DASH DANIELS — Melbourne United (NBL)
    if (!PLAYERS || PLAYERS.includes('daniels')) {
      console.log('\n=== Fetching Dash Daniels (Melbourne United) ===');
      try {
        const rows = await nbl.scrape(page, 'Melbourne United');
        writeTxt('dash_daniels_schedule.txt', rows);
      } catch (err) {
        console.error('Error fetching Dash Daniels:', err);
      }
      await rateLimit();
    }
    
    // KARIM LOPEZ — New Zealand Breakers (NBL)
    if (!PLAYERS || PLAYERS.includes('lopez')) {
      console.log('\n=== Fetching Karim Lopez (New Zealand Breakers) ===');
      try {
        const rows = await nbl.scrape(page, 'New Zealand Breakers');
        writeTxt('karim_lopez_schedule.txt', rows);
      } catch (err) {
        console.error('Error fetching Karim Lopez:', err);
      }
      await rateLimit();
    }
    
    // SERGIO DE LARREA — Valencia (ACB + EuroLeague)
    if (!PLAYERS || PLAYERS.includes('delarrea')) {
      console.log('\n=== Fetching Sergio de Larrea (Valencia Basket) ===');
      const rows: Row[] = [];
      try {
        const acbRows = await acb.scrape(page, 'Valencia Basket');
        rows.push(...acbRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching Valencia ACB:', err);
      }
      try {
        const elRows = await euroleague.scrape(page, 'Valencia Basket');
        rows.push(...elRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching Valencia EuroLeague:', err);
      }
      writeTxt('sergio_de_larrea_schedule.txt', rows);
    }
    
    // OGNJEN SRZENTIC — Mega (ABA + KLS)
    if (!PLAYERS || PLAYERS.includes('srzentic')) {
      console.log('\n=== Fetching Ognjen Srzentic (Mega Superbet) ===');
      try {
        const rows = await abaKls.scrape(page, 'Mega Superbet');
        writeTxt('ognjen_srzentic_schedule.txt', rows);
      } catch (err) {
        console.error('Error fetching Ognjen Srzentic:', err);
      }
      await rateLimit();
    }
    
    // LUIGI SUIGO — Mega (ABA + KLS)
    if (!PLAYERS || PLAYERS.includes('suigo')) {
      console.log('\n=== Fetching Luigi Suigo (Mega Superbet) ===');
      try {
        const rows = await abaKls.scrape(page, 'Mega Superbet');
        writeTxt('luigi_suigo_schedule.txt', rows);
      } catch (err) {
        console.error('Error fetching Luigi Suigo:', err);
      }
      await rateLimit();
    }
    
    // ADAM ATAMNA — ASVEL (LNB + EuroLeague)
    if (!PLAYERS || PLAYERS.includes('atamna')) {
      console.log('\n=== Fetching Adam Atamna (ASVEL) ===');
      const rows: Row[] = [];
      try {
        const lnbRows = await lnb.scrape(page, 'ASVEL');
        rows.push(...lnbRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching ASVEL LNB:', err);
      }
      try {
        const elRows = await euroleague.scrape(page, 'ASVEL');
        rows.push(...elRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching ASVEL EuroLeague:', err);
      }
      writeTxt('adam_atamna_schedule.txt', rows);
    }
    
    // MICHAEL RUZIC — Joventut (ACB + EuroCup)
    if (!PLAYERS || PLAYERS.includes('ruzic')) {
      console.log('\n=== Fetching Michael Ruzic (Joventut Badalona) ===');
      const rows: Row[] = [];
      try {
        const acbRows = await acb.scrape(page, 'Joventut Badalona');
        rows.push(...acbRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching Joventut ACB:', err);
      }
      try {
        const ecRows = await eurocup.scrape(page, 'Joventut Badalona');
        rows.push(...ecRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching Joventut EuroCup:', err);
      }
      writeTxt('michael_ruzic_schedule.txt', rows);
    }
    
    // MOUHAMED FAYE — Paris (LNB + EuroLeague)
    if (!PLAYERS || PLAYERS.includes('faye')) {
      console.log('\n=== Fetching Mouhamed Faye (Paris Basketball) ===');
      const rows: Row[] = [];
      try {
        const lnbRows = await lnb.scrape(page, 'Paris Basketball');
        rows.push(...lnbRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching Paris LNB:', err);
      }
      try {
        const elRows = await euroleague.scrape(page, 'Paris Basketball');
        rows.push(...elRows);
        await rateLimit();
      } catch (err) {
        console.error('Error fetching Paris EuroLeague:', err);
      }
      writeTxt('mouhamed_faye_schedule.txt', rows);
    }
    
    console.log('\n=== All schedules fetched successfully! ===');
  } catch (err) {
    console.error('Fatal error:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
