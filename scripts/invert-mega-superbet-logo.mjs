#!/usr/bin/env node
/**
 * Invert Mega Superbet logo colors and make background transparent
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Try to find a version with transparent background or dark version
const alternativeUrls = [
  'https://www.bcmegabasket.net/wp-content/uploads/2024/06/mega-pink-outline.png',
  'https://www.aba-liga.com/images/club/50x50/13.png',
];

// Simple approach: Download alternative versions that might have transparent backgrounds
async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.bcmegabasket.net/',
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
  console.log('🏀 Finding Mega Superbet Logo with Transparent Background\n');
  console.log('='.repeat(70));
  
  const filepath = path.join(logosDir, 'mega-superbet.png');
  const tempPath = path.join(logosDir, 'mega-superbet-temp.png');
  
  // Backup current file
  if (fs.existsSync(filepath)) {
    const backupPath = filepath + '.white-backup';
    fs.copyFileSync(filepath, backupPath);
    console.log(`📦 Backed up white background version\n`);
  }
  
  for (let i = 0; i < alternativeUrls.length; i++) {
    const url = alternativeUrls[i];
    process.stdout.write(`[${i + 1}/${alternativeUrls.length}] Trying ${url.substring(0, 60)}... `);
    
    try {
      const size = await downloadFile(url, tempPath);
      
      // Verify it's a valid PNG
      const buf = fs.readFileSync(tempPath);
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
        fs.unlinkSync(tempPath);
        console.log(`✗ Not a valid PNG`);
        continue;
      }
      
      // Check if it has transparency (check for tRNS chunk or alpha channel)
      const pngData = buf.toString('binary');
      const hasTransparency = pngData.includes('tRNS') || 
                             (buf[25] & 0x04) !== 0; // Check if alpha channel exists
      
      console.log(`✓ Success! (${size} bytes${hasTransparency ? ', has transparency' : ''})`);
      
      // Replace the file
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      fs.renameSync(tempPath, filepath);
      
      console.log(`\n✅ Logo replaced!`);
      console.log(`   File: ${filepath}`);
      console.log(`   Size: ${size} bytes`);
      console.log(`\n💡 This version should have better visibility on white backgrounds`);
      return;
    } catch (error) {
      console.log(`✗ ${error.message.substring(0, 40)}`);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
  
  console.log(`\n⚠️  Could not find alternative version.`);
  console.log(`   The current logo may need manual editing to add transparency or invert colors.`);
}

main().catch(console.error);






