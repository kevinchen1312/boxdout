#!/usr/bin/env node
/**
 * Download logos for college teams not in ESPN directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// College teams with placeholder logos - try to find their logos
const collegeTeams = {
  'lindenwood-lions': [
    'https://lindenwoodlions.com/images/logos/site/site.png',
    'https://lindenwoodlions.com/images/logos/lacrosse/300/Lindenwood.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Lindenwood_Lions_logo.svg/200px-Lindenwood_Lions_logo.svg.png',
  ],
  'queens-university': [
    'https://queensathletics.com/images/logos/site/site.png',
    'https://queensathletics.com/images/logos/basketball/300/Queens.png',
    'https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/Queens_University_logo.svg/200px-Queens_University_logo.svg.png',
  ],
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
      timeout: 20000,
    };
    
    const req = https.get(url, options, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        const location = response.headers.location;
        if (location) {
          const absoluteUrl = location.startsWith('http') ? location : new URL(location, url).href;
          return downloadFile(absoluteUrl, filepath).then(resolve).catch(reject);
        }
        reject(new Error('Redirect without location'));
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(filepath);
        if (stats.size < 1000) {
          fs.unlinkSync(filepath);
          reject(new Error('File too small'));
          return;
        }
        resolve(stats.size);
      });
    });
    
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('🏀 Downloading College Team Logos\n');
  console.log('='.repeat(70));
  
  let success = 0;
  let failed = 0;
  
  for (const [teamName, urls] of Object.entries(collegeTeams)) {
    const filepath = path.join(logosDir, `${teamName}.png`);
    
    console.log(`\n📥 ${teamName.toUpperCase()}:`);
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        process.stdout.write(`  [${i + 1}/${urls.length}] Trying... `);
        const size = await downloadFile(url, filepath);
        console.log(`✓ Success! (${size} bytes)`);
        success++;
        break;
      } catch (error) {
        process.stdout.write(`✗ ${error.message.substring(0, 40)}\n`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
    }
    
    if (!fs.existsSync(filepath)) {
      console.log(`  ❌ All sources failed`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ✅ ${success} | ❌ ${failed}\n`);
}

main().catch(console.error);

