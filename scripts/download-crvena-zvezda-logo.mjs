#!/usr/bin/env node
/**
 * Download Crvena Zvezda logo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Try multiple sources for Crvena Zvezda logo
const logoUrls = [
  'https://www.aba-liga.com/images/club/500x500/2.png',
  'https://www.aba-liga.com/images/club/200x200/2.png',
  'https://www.aba-liga.com/images/club/50x50/2.png',
  'https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/KK_Crvena_zvezda_logo.svg/200px-KK_Crvena_zvezda_logo.svg.png',
  'https://upload.wikimedia.org/wikipedia/en/5/5a/KK_Crvena_zvezda_logo.svg',
];

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const ext = url.includes('.svg') ? 'svg' : 'png';
    const finalPath = filepath.replace(/\.(svg|png)$/, `.${ext}`);
    
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
        if (stats.size < 1000) {
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
  console.log('🏀 Downloading Crvena Zvezda Logo\n');
  console.log('='.repeat(70));
  
  const filepath = path.join(logosDir, 'crvena-zvezda.png');
  
  for (let i = 0; i < logoUrls.length; i++) {
    const url = logoUrls[i];
    process.stdout.write(`[${i + 1}/${logoUrls.length}] Trying ${url.substring(0, 60)}... `);
    
    try {
      const result = await downloadFile(url, filepath);
      console.log(`✓ Success! (${result.size} bytes) → ${path.basename(result.path)}`);
      
      // Update mapping if we got PNG instead of SVG
      if (result.path.endsWith('.png')) {
        console.log(`\n⚠️  Note: Downloaded PNG. Will update mapping to use PNG.`);
      }
      
      return;
    } catch (error) {
      console.log(`✗ ${error.message.substring(0, 40)}`);
    }
  }
  
  console.log(`\n❌ All sources failed`);
}

main().catch(console.error);

