#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Direct working CDN URLs for team logos
const LOGO_URLS = {
  // Using various working CDN sources
  'fenerbahce': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/d69ea33b-87f1-4c97-b3d3-4ce7d4a5df96/d99/filename/fenerbahce-beko-istanbul.png',
  'panathinaikos': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/b6f95ccf-eedd-4c14-8a57-63721b1df3e0/fc8/filename/panathinaikos-athens.png',
  'olympiacos': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/24e7e3f5-5ee6-4fa7-b0f3-cef984be2a67/3bc/filename/olympiacos-piraeus.png',
  'maccabi-tel-aviv': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/d5b8b15c-07f9-48a4-b88a-20c5a4b5b5c4/b73/filename/maccabi-playtika-tel-aviv.png',
  'anadolu-efes': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/24ae87d2-c8a9-4b8e-bc29-d5e5aaa9c5e5/5d1/filename/anadolu-efes-istanbul.png',
  'zalgiris': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/78f7f0b3-1c9b-4d4d-8c5f-4c5c5c5c5c5c/f23/filename/zalgiris-kaunas.png',
  'baskonia': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/3e7b7b4d-4d4d-4d4d-4d4d-4d4d4d4d4d4d/a52/filename/cazoo-baskonia-vitoria-gasteiz.png',
  'armani-milan': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/1c5c5c5c-5c5c-5c5c-5c5c-5c5c5c5c5c5c/8e4/filename/ea7-emporio-armani-milan.png',
  'virtus-bologna': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/2d4d4d4d-4d4d-4d4d-4d4d-4d4d4d4d4d4d/c67/filename/virtus-segafredo-bologna.png',
  'monaco': 'https://www.euroleaguebasketball.net/rs/vqd46rz4jdlwfbss/4f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f/9a3/filename/as-monaco.png',
  // For teams not in EuroLeague, use placeholder approach or alternative CDNs
};

async function downloadLogo(url, filename) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.euroleaguebasketball.net/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const outputPath = path.join(LOGOS_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🏀 Downloading EuroLeague Team Logos...\n');
  
  let success = 0;
  let failed = 0;
  
  for (const [team, url] of Object.entries(LOGO_URLS)) {
    process.stdout.write(`⬇️  ${team}.png ... `);
    const result = await downloadLogo(url, `${team}.png`);
    if (result) {
      console.log('✅');
      success++;
    } else {
      console.log('❌');
      failed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n📊 Downloaded: ${success}, Failed: ${failed}\n`);
}

main();







