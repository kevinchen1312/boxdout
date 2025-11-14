#!/usr/bin/env node
/**
 * Script to download international team logos
 * Run with: node scripts/download-logos.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Ensure logos directory exists
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// Logo URLs - using direct image URLs from reliable sources
// Using Wikipedia Commons and direct image URLs with proper headers
const logoUrls = {
  'melbourne-united.png': 'https://cdn.prod.website-files.com/689d925d97d31acf23d27214/689d925d97d31acf23d2723b_3e87889501022c352a21265feb9ac70f_Club%20Logo_NEG.webp',
  // NBL teams - using Wikipedia Commons (these are public domain/fair use)
  'new-zealand-breakers.png': 'https://upload.wikimedia.org/wikipedia/en/8/8a/New_Zealand_Breakers_logo.svg',
  'brisbane-bullets.png': 'https://upload.wikimedia.org/wikipedia/en/5/5a/Brisbane_Bullets_logo.svg',
  'south-east-melbourne-phoenix.png': 'https://upload.wikimedia.org/wikipedia/en/9/9a/South_East_Melbourne_Phoenix_logo.svg',
  'cairns-taipans.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1c/Cairns_Taipans_logo.svg/500px-Cairns_Taipans_logo.svg.png',
  'perth-wildcats.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6a/Perth_Wildcats_logo.svg/500px-Perth_Wildcats_logo.svg.png',
  'tasmania-jackjumpers.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Tasmania_JackJumpers_logo.svg/500px-Tasmania_JackJumpers_logo.svg.png',
  'sydney-kings.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8a/Sydney_Kings_logo.svg/500px-Sydney_Kings_logo.svg.png',
  'adelaide-36ers.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/86/Adelaide_36ers_logo.svg/500px-Adelaide_36ers_logo.svg.png',
  'illawarra-hawks.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/27/Illawarra_Hawks_logo.svg/500px-Illawarra_Hawks_logo.svg.png',
  // EuroLeague teams - using Wikipedia Commons
  'asvel-basket.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0c/LDLC_ASVEL_logo.svg/500px-LDLC_ASVEL_logo.svg.png',
  'paris-basketball.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a5/Paris_Basketball_logo.svg/500px-Paris_Basketball_logo.svg.png',
  'valencia-basket.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Valencia_Basket_logo.svg/500px-Valencia_Basket_logo.svg.png',
  // Liga ACB - using Wikipedia Commons
  'joventut-badalona.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/Joventut_Badalona_logo.svg/500px-Joventut_Badalona_logo.svg.png',
  // EuroLeague - Spanish teams (using SVG directly - higher quality and more reliable)
  'real-madrid.svg': 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
  'barcelona.svg': 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
  'baskonia.svg': 'https://upload.wikimedia.org/wikipedia/en/b/b2/Saski_Baskonia_logo.svg',
  'unicaja.svg': 'https://upload.wikimedia.org/wikipedia/en/3/34/Unicaja_logo.svg',
  // EuroLeague - Turkish teams
  'fenerbahce.svg': 'https://upload.wikimedia.org/wikipedia/en/8/8c/Fenerbah%C3%A7e_SK_Logo.svg',
  'anadolu-efes.svg': 'https://upload.wikimedia.org/wikipedia/en/3/36/Anadolu_Efes_S.K._logo.svg',
  // EuroLeague - Greek teams
  'panathinaikos.svg': 'https://upload.wikimedia.org/wikipedia/commons/3/38/Panathinaikos_BC_logo.svg',
  'olympiacos.svg': 'https://upload.wikimedia.org/wikipedia/en/e/e4/Olympiacos_BC_logo.svg',
  // EuroLeague - Italian teams
  'virtus-bologna.svg': 'https://upload.wikimedia.org/wikipedia/en/b/b7/Virtus_Bologna_logo.svg',
  'armani-milan.svg': 'https://upload.wikimedia.org/wikipedia/en/f/f0/Olimpia_Milano_logo.svg',
  // EuroLeague - Lithuanian teams
  'zalgiris.svg': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/BC_%C5%BDalgiris_logo.svg',
  // EuroLeague - German teams
  'bayern-munich.svg': 'https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg',
  // EuroLeague - Israeli teams
  'maccabi-tel-aviv.svg': 'https://upload.wikimedia.org/wikipedia/en/7/7c/Maccabi_Tel_Aviv_BC_logo.svg',
  'hapoel-tel-aviv.svg': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Hapoel_Tel_Aviv_B.C._logo.svg',
  // EuroLeague - French teams
  'monaco.svg': 'https://upload.wikimedia.org/wikipedia/en/7/7a/AS_Monaco_Basket_logo.svg',
  // ABA League teams
  'crvena-zvezda.svg': 'https://upload.wikimedia.org/wikipedia/en/3/39/KK_Crvena_zvezda_logo.svg',
  'partizan.svg': 'https://upload.wikimedia.org/wikipedia/en/8/86/KK_Partizan_logo.svg',
  'mega-superbet.svg': 'https://upload.wikimedia.org/wikipedia/en/5/57/KK_Mega_logo.svg',
  'cedevita-olimpija.svg': 'https://upload.wikimedia.org/wikipedia/en/9/9c/Cedevita_Olimpija_logo.svg',
  'buducnost.svg': 'https://upload.wikimedia.org/wikipedia/en/2/29/KK_Budu%C4%87nost_VOLI_logo.svg',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      }
    };
    
    protocol.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading international team logos...\n');
  
  for (const [filename, url] of Object.entries(logoUrls)) {
    const filepath = path.join(logosDir, filename);
    
    // Skip if file already exists
    if (fs.existsSync(filepath)) {
      console.log(`✓ ${filename} already exists, skipping...`);
      continue;
    }
    
    try {
      console.log(`Downloading ${filename} from ${url}...`);
      await downloadFile(url, filepath);
      console.log(`✓ Downloaded ${filename}\n`);
    } catch (error) {
      console.error(`✗ Failed to download ${filename}: ${error.message}\n`);
    }
  }
  
  console.log('Done!');
}

main().catch(console.error);
