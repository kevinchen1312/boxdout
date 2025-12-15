#!/usr/bin/env node
/**
 * Download Real Madrid logo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Try multiple sources for Real Madrid logo
const realMadridUrls = [
  'https://static.acb.com/img/www/clubes2024/2425RealMadridLogo.png',
  'https://static.acb.com/img/www/clubes2023/RealMadridLogo.png',
  'https://static.acb.com/logos/1718/real_madrid_00.png',
  'https://upload.wikimedia.org/wikipedia/en/thumb/9/9a/Real_Madrid_CF_logo.svg/200px-Real_Madrid_CF_logo.svg.png',
  'https://upload.wikimedia.org/wikipedia/en/9/9a/Real_Madrid_CF_logo.svg',
];

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const ext = url.includes('.svg') ? 'svg' : 'png';
    const finalPath = filepath.replace(/\.(svg|png)$/, `.${ext}`);
    
    if (finalPath !== filepath && fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.acb.com/',
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
          return downloadFile(absoluteUrl, finalPath).then(resolve).catch(reject);
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
        if (finalPath !== filepath) {
          if (fs.existsSync(filepath)) fs.renameSync(filepath, finalPath);
        }
        const stats = fs.statSync(finalPath);
        if (stats.size < 100) {
          fs.unlinkSync(finalPath);
          reject(new Error('File too small'));
          return;
        }
        resolve({ size: stats.size, path: finalPath });
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
  console.log('🏀 Downloading Real Madrid Logo\n');
  console.log('='.repeat(70));
  
  const filepath = path.join(logosDir, 'real-madrid.svg');
  
  for (let i = 0; i < realMadridUrls.length; i++) {
    const url = realMadridUrls[i];
    process.stdout.write(`[${i + 1}/${realMadridUrls.length}] Trying ${url.substring(0, 60)}... `);
    
    try {
      const result = await downloadFile(url, filepath);
      console.log(`✓ Success! (${result.size} bytes) → ${path.basename(result.path)}`);
      
      // Update mapping if we got PNG instead of SVG
      if (result.path.endsWith('.png')) {
        console.log(`\n⚠️  Note: Downloaded PNG instead of SVG. Update mapping to use PNG.`);
      }
      
      return;
    } catch (error) {
      console.log(`✗ ${error.message.substring(0, 40)}`);
    }
  }
  
  console.log(`\n❌ All sources failed`);
}

main().catch(console.error);







