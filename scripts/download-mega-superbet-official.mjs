#!/usr/bin/env node
/**
 * Download Mega Superbet logo from official website
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Official Mega Superbet website logo URLs
const logoUrls = [
  'https://www.bcmegabasket.net/wp-content/uploads/2025/01/superbet-01.png',
  'https://www.bcmegabasket.net/wp-content/uploads/2024/06/mega-pink-outline.png',
  'https://www.bcmegabasket.net/wp-content/uploads/2025/01/Mega-Superbet-Logo.png',
  'https://www.aba-liga.com/images/club/50x50/13.png',
];

function downloadFile(url, filepath) {
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
        // Check dimensions
        const width = ((buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) >>> 0;
        const height = ((buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]) >>> 0;
        if (width === 0 || height === 0) {
          fs.unlinkSync(filepath);
          reject(new Error('Invalid dimensions'));
          return;
        }
        resolve({ size: stats.size, width, height });
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
  console.log('🏀 Downloading Mega Superbet Logo from Official Website\n');
  console.log('='.repeat(70));
  
  const filepath = path.join(logosDir, 'mega-superbet.png');
  
  // Remove old file
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log('🗑️  Removed old logo file\n');
  }
  
  for (let i = 0; i < logoUrls.length; i++) {
    const url = logoUrls[i];
    process.stdout.write(`[${i + 1}/${logoUrls.length}] Trying ${url.substring(0, 70)}... `);
    
    try {
      const result = await downloadFile(url, filepath);
      console.log(`✓ Success! (${result.size} bytes, ${result.width}x${result.height}px)`);
      console.log(`\n✅ Logo downloaded successfully!`);
      console.log(`   File: ${filepath}`);
      console.log(`   Size: ${result.size} bytes`);
      console.log(`   Dimensions: ${result.width}x${result.height}px`);
      console.log(`\n💡 Next steps:`);
      console.log(`   1. Hard refresh browser (Ctrl+F5)`);
      console.log(`   2. Check http://localhost:3000/logos/mega-superbet.png`);
      return;
    } catch (error) {
      console.log(`✗ ${error.message.substring(0, 40)}`);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }
  }
  
  console.log(`\n❌ All sources failed`);
}

main().catch(console.error);

