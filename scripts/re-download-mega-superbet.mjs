#!/usr/bin/env node
/**
 * Re-download Mega Superbet logo to ensure it's valid
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Try multiple sources for Mega Superbet logo
const logoUrls = [
  'https://www.aba-liga.com/images/club/500x500/13.png',
  'https://www.aba-liga.com/images/club/200x200/13.png',
  'https://www.aba-liga.com/images/club/50x50/13.png',
  'https://www.bcmegabasket.net/en/wp-content/uploads/2025/01/Mega-Superbet-Logo.png',
];

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.aba-liga.com/',
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
      
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('image') && !contentType.includes('octet-stream') && !contentType.includes('binary')) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(new Error(`Not an image: ${contentType}`));
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
        // Verify it's a valid PNG
        const buf = fs.readFileSync(filepath);
        if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
          fs.unlinkSync(filepath);
          reject(new Error('Not a valid PNG file'));
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
  console.log('🏀 Re-downloading Mega Superbet Logo\n');
  console.log('='.repeat(70));
  
  const filepath = path.join(logosDir, 'mega-superbet.png');
  
  // Backup old file if it exists
  if (fs.existsSync(filepath)) {
    const backupPath = filepath + '.backup';
    fs.copyFileSync(filepath, backupPath);
    console.log(`📦 Backed up existing file to ${path.basename(backupPath)}\n`);
  }
  
  for (let i = 0; i < logoUrls.length; i++) {
    const url = logoUrls[i];
    process.stdout.write(`[${i + 1}/${logoUrls.length}] Trying ${url.substring(0, 60)}... `);
    
    try {
      const size = await downloadFile(url, filepath);
      console.log(`✓ Success! (${size} bytes)`);
      console.log(`\n✅ Logo downloaded successfully!`);
      console.log(`   File: ${filepath}`);
      console.log(`   Size: ${size} bytes`);
      console.log(`\n💡 Next steps:`);
      console.log(`   1. Restart Next.js dev server`);
      console.log(`   2. Hard refresh browser (Ctrl+F5)`);
      console.log(`   3. Check http://localhost:3000/logos/mega-superbet.png`);
      return;
    } catch (error) {
      console.log(`✗ ${error.message.substring(0, 40)}`);
    }
  }
  
  console.log(`\n❌ All sources failed`);
  console.log(`\n⚠️  Restoring backup if available...`);
  if (fs.existsSync(filepath + '.backup')) {
    fs.copyFileSync(filepath + '.backup', filepath);
    console.log(`   Restored backup file`);
  }
}

main().catch(console.error);







