#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Known logo URLs from public sources (Wikimedia Commons, official CDNs, etc.)
const TEAM_LOGO_URLS = {
  // EuroLeague - Spanish Teams
  'real-madrid': 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
  'barcelona': 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
  'baskonia': 'https://upload.wikimedia.org/wikipedia/en/b/b2/Saski_Baskonia_logo.svg',
  'unicaja': 'https://upload.wikimedia.org/wikipedia/en/3/34/Unicaja_logo.svg',
  
  // EuroLeague - Turkish Teams  
  'fenerbahce': 'https://upload.wikimedia.org/wikipedia/en/8/8c/Fenerbahçe_SK_Logo.svg',
  'anadolu-efes': 'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
  
  // EuroLeague - Greek Teams
  'panathinaikos': 'https://upload.wikimedia.org/wikipedia/en/5/5f/Panathinaikos_BC_logo.svg',
  'olympiacos': 'https://upload.wikimedia.org/wikipedia/en/e/e4/Olympiacos_BC_logo.svg',
  
  // EuroLeague - Italian Teams
  'virtus-bologna': 'https://upload.wikimedia.org/wikipedia/en/b/b7/Virtus_Bologna_logo.svg',
  'armani-milan': 'https://upload.wikimedia.org/wikipedia/en/f/f0/Olimpia_Milano_logo.svg',
  
  // EuroLeague - Lithuanian Teams
  'zalgiris': 'https://upload.wikimedia.org/wikipedia/en/c/c7/BC_Žalgiris_logo.svg',
  
  // EuroLeague - German Teams
  'bayern-munich': 'https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_München_logo_%282017%29.svg',
  
  // EuroLeague - Israeli Teams
  'maccabi-tel-aviv': 'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
  'hapoel-tel-aviv': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
  
  // EuroLeague - French Teams
  'monaco': 'https://upload.wikimedia.org/wikipedia/en/7/7a/AS_Monaco_Basket_logo.svg',
  
  // Serbian ABA League
  'crvena-zvezda': 'https://upload.wikimedia.org/wikipedia/en/3/39/KK_Crvena_zvezda_logo.svg',
  'partizan': 'https://upload.wikimedia.org/wikipedia/en/8/86/KK_Partizan_logo.svg',
  'mega-superbet': 'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
  'cedevita-olimpija': 'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
  'buducnost': 'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budućnost_VOLI_logo.svg',
};

async function downloadLogo(url, filename) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const outputPath = path.join(LOGOS_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`Failed to download ${filename}: ${error.message}`);
    return false;
  }
}

async function fetchAllLogos() {
  console.log('🔍 Fetching International Basketball Team Logos...\n');
  console.log('Source: Wikimedia Commons (Public Domain / Free Use)\n');
  console.log('=' .repeat(70));
  console.log('\n');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [teamKey, url] of Object.entries(TEAM_LOGO_URLS)) {
    // Determine file extension from URL
    const ext = url.endsWith('.svg') ? 'svg' : 'png';
    const filename = `${teamKey}.${ext}`;
    const outputPath = path.join(LOGOS_DIR, filename);
    
    // Check if file already exists (either PNG or SVG)
    const pngPath = path.join(LOGOS_DIR, `${teamKey}.png`);
    const svgPath = path.join(LOGOS_DIR, `${teamKey}.svg`);
    if (fs.existsSync(pngPath) || fs.existsSync(svgPath)) {
      console.log(`⏭️  Skipped ${filename.padEnd(30)} (already exists)`);
      skipped++;
      continue;
    }
    
    process.stdout.write(`⬇️  Downloading ${filename.padEnd(30)} ... `);
    
    const success = await downloadLogo(url, filename);
    
    if (success) {
      console.log('✅');
      downloaded++;
    } else {
      console.log('❌');
      failed++;
    }
    
    // Small delay to be respectful to servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '=' .repeat(70));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already exist)`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📁 Total: ${Object.keys(TEAM_LOGO_URLS).length} teams`);
  
  if (downloaded > 0) {
    console.log('\n🎉 Success! Logos downloaded to public/logos/');
    console.log('\n💡 Next steps:');
    console.log('   1. Restart your dev server to see the new logos');
    console.log('   2. Run "node scripts/verify-logo-mappings.mjs" to verify');
  }
  
  if (failed > 0) {
    console.log('\n⚠️  Some logos failed to download. These teams will use placeholder logos.');
  }

  console.log('\n');
  return { downloaded, skipped, failed };
}

// Run the script
fetchAllLogos().then(({ downloaded, failed }) => {
  process.exit(failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

