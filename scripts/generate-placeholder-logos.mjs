#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Ensure logos directory exists
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

// Team configurations with colors and abbreviations
const teams = [
  // Serbian ABA League
  { file: 'mega-superbet.png', abbr: 'MEGA', name: 'Mega Superbet', color: '#1E3A8A' },
  { file: 'cedevita-olimpija.png', abbr: 'CO', name: 'Cedevita Olimpija', color: '#15803D' },
  { file: 'bosna-bh-telecom.png', abbr: 'BOSNA', name: 'Bosna BH', color: '#B91C1C' },
  { file: 'bc-vienna.png', abbr: 'VIE', name: 'BC Vienna', color: '#7C3AED' },
  { file: 'crvena-zvezda.png', abbr: 'CZ', name: 'Crvena Zvezda', color: '#DC2626' },
  { file: 'ilirija.png', abbr: 'ILI', name: 'Ilirija', color: '#0891B2' },
  { file: 'zadar.png', abbr: 'ZAD', name: 'Zadar', color: '#EA580C' },
  { file: 'buducnost.png', abbr: 'BUD', name: 'Budućnost', color: '#1E40AF' },
  { file: 'spartak.png', abbr: 'SPK', name: 'Spartak', color: '#991B1B' },
  
  // EuroLeague - Spanish Teams
  { file: 'real-madrid.png', abbr: 'RM', name: 'Real Madrid', color: '#FFFFFF', textColor: '#000000' },
  { file: 'barcelona.png', abbr: 'FCB', name: 'FC Barcelona', color: '#A50044' },
  { file: 'baskonia.png', abbr: 'BAS', name: 'Baskonia', color: '#003DA5' },
  { file: 'unicaja.png', abbr: 'UNI', name: 'Unicaja', color: '#00A94F' },
  
  // EuroLeague - Italian Teams
  { file: 'virtus-bologna.png', abbr: 'VBO', name: 'Virtus Bologna', color: '#000000' },
  { file: 'armani-milan.png', abbr: 'MIL', name: 'AX Milan', color: '#ED1C24' },
  
  // EuroLeague - Turkish Teams
  { file: 'fenerbahce.png', abbr: 'FEN', name: 'Fenerbahçe', color: '#FFED00', textColor: '#00239C' },
  { file: 'anadolu-efes.png', abbr: 'EFS', name: 'Anadolu Efes', color: '#003087' },
  
  // EuroLeague - Greek Teams
  { file: 'panathinaikos.png', abbr: 'PAO', name: 'Panathinaikos', color: '#00803C' },
  { file: 'olympiacos.png', abbr: 'OLY', name: 'Olympiacos', color: '#ED1C24' },
  
  // EuroLeague - Lithuanian Teams
  { file: 'zalgiris.png', abbr: 'ŽAL', name: 'Žalgiris', color: '#00A651' },
  
  // EuroLeague - German Teams
  { file: 'bayern-munich.png', abbr: 'FCB', name: 'Bayern Munich', color: '#DC052D' },
  
  // EuroLeague - Serbian Teams
  { file: 'partizan.png', abbr: 'PAR', name: 'Partizan', color: '#000000' },
  
  // EuroLeague - Israeli Teams
  { file: 'hapoel-tel-aviv.png', abbr: 'HAP', name: 'Hapoel TA', color: '#E31E24' },
  { file: 'maccabi-tel-aviv.png', abbr: 'MAC', name: 'Maccabi TA', color: '#004B93' },
  
  // EuroLeague - French Teams
  { file: 'monaco.png', abbr: 'MON', name: 'AS Monaco', color: '#E31E24' },
  
  // EuroLeague - Other Teams
  { file: 'dubai.png', abbr: 'DXB', name: 'Dubai BC', color: '#C69214' },
];

// Generate SVG placeholder
function generateSVG(abbr, name, bgColor, textColor = '#FFFFFF') {
  const fontSize = abbr.length <= 3 ? '48' : abbr.length === 4 ? '36' : '32';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="${bgColor}"/>
  <text 
    x="250" 
    y="250" 
    font-family="Arial, sans-serif" 
    font-size="${fontSize}" 
    font-weight="bold" 
    text-anchor="middle" 
    dominant-baseline="middle" 
    fill="${textColor}"
  >${abbr}</text>
  <text 
    x="250" 
    y="320" 
    font-family="Arial, sans-serif" 
    font-size="18" 
    font-weight="normal" 
    text-anchor="middle" 
    dominant-baseline="middle" 
    fill="${textColor}" 
    opacity="0.8"
  >${name}</text>
</svg>`;
}

// Generate all placeholder logos
let created = 0;
let skipped = 0;

for (const team of teams) {
  const filePath = path.join(LOGOS_DIR, team.file);
  const svgPath = filePath.replace('.png', '.svg');
  
  // Check if file already exists
  if (fs.existsSync(filePath) || fs.existsSync(svgPath)) {
    console.log(`⏭️  Skipped ${team.file} (already exists)`);
    skipped++;
    continue;
  }
  
  const svg = generateSVG(team.abbr, team.name, team.color, team.textColor);
  
  // Save as SVG (can be converted to PNG later if needed)
  fs.writeFileSync(svgPath, svg, 'utf-8');
  console.log(`✅ Created ${svgPath.replace(process.cwd(), '.')}`);
  created++;
}

console.log(`\n📊 Summary:`);
console.log(`   Created: ${created} logos`);
console.log(`   Skipped: ${skipped} logos (already exist)`);
console.log(`   Total: ${teams.length} teams`);
console.log('\nNote: SVG files created. These can be used directly or converted to PNG using a tool like ImageMagick:');
console.log('   cd public/logos && for f in *.svg; do magick "$f" "$(basename "$f" .svg).png"; done');

