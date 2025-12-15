#!/usr/bin/env node
/**
 * Download Dubai basketball team logo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Try multiple sources for Dubai logo
const logoUrls = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Dubai_logo.svg/200px-Dubai_logo.svg.png',
  'https://upload.wikimedia.org/wikipedia/commons/8/8d/Dubai_logo.svg',
  'https://www.fiba.basketball/images.fiba.com/Graphic/0/Logo/2024/10/30/15/09/logo_20241030150948.png',
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
  console.log('🏀 Downloading Dubai Logo\n');
  console.log('='.repeat(70));
  
  const filepath = path.join(logosDir, 'dubai.png');
  
  for (let i = 0; i < logoUrls.length; i++) {
    const url = logoUrls[i];
    process.stdout.write(`[${i + 1}/${logoUrls.length}] Trying ${url.substring(0, 60)}... `);
    
    try {
      const result = await downloadFile(url, filepath);
      console.log(`✓ Success! (${result.size} bytes) → ${path.basename(result.path)}`);
      
      // Update mapping if we got PNG instead of SVG
      if (result.path.endsWith('.png')) {
        console.log(`\n✓ Downloaded PNG. Mapping already points to PNG.`);
      }
      
      return;
    } catch (error) {
      console.log(`✗ ${error.message.substring(0, 40)}`);
    }
  }
  
  console.log(`\n❌ All sources failed - trying alternative approach...`);
  
  // Try creating a simple logo based on Dubai's colors (red, white, green)
  console.log(`\nCreating a simple Dubai logo based on UAE colors...`);
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="#FF0000"/>
  <rect x="0" y="0" width="500" height="125" fill="#000000"/>
  <rect x="0" y="375" width="500" height="125" fill="#00843D"/>
  <text x="250" y="280" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="white" text-anchor="middle">DUBAI</text>
</svg>`;
  
  const svgPath = path.join(logosDir, 'dubai.svg');
  fs.writeFileSync(svgPath, svgContent);
  console.log(`✓ Created simple Dubai logo (${svgContent.length} bytes)`);
  
  // Update mapping to use SVG
  console.log(`\n⚠️  Note: Created SVG logo. Update mapping to use SVG if needed.`);
}

main().catch(console.error);







