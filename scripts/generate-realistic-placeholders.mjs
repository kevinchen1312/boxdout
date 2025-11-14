#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Ensure logos directory exists
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

// Team configurations with authentic colors and better designs
const teams = [
  // Serbian ABA League
  { file: 'mega-superbet.svg', name: 'MEGA', fullName: 'MEGA SUPERBET', primary: '#000000', secondary: '#FFD700', style: 'shield' },
  { file: 'cedevita-olimpija.svg', name: 'CO', fullName: 'CEDEVITA OLIMPIJA', primary: '#00843D', secondary: '#FFFFFF', style: 'circle' },
  { file: 'bosna-bh-telecom.svg', name: 'BOSNA', fullName: 'BOSNA', primary: '#003087', secondary: '#FFFFFF', style: 'shield' },
  { file: 'bc-vienna.svg', name: 'VIENNA', fullName: 'BC VIENNA', primary: '#8B0000', secondary: '#FFD700', style: 'circle' },
  { file: 'crvena-zvezda.svg', name: '⭐', fullName: 'CRVENA ZVEZDA', primary: '#DC143C', secondary: '#FFFFFF', style: 'star' },
  { file: 'ilirija.svg', name: 'ILIRIJA', fullName: 'ILIRIJA', primary: '#0066CC', secondary: '#FFFFFF', style: 'circle' },
  { file: 'zadar.svg', name: 'ZADAR', fullName: 'KK ZADAR', primary: '#D41A1F', secondary: '#FFFFFF', style: 'shield' },
  { file: 'buducnost.svg', name: 'BUDUĆNOST', fullName: 'BUDUĆNOST', primary: '#0033A0', secondary: '#FFFFFF', style: 'shield' },
  { file: 'spartak.svg', name: 'SPARTAK', fullName: 'SPARTAK', primary: '#8B0000', secondary: '#FFD700', style: 'circle' },
  
  // EuroLeague - Turkish Teams
  { file: 'fenerbahce.svg', name: 'FB', fullName: 'FENERBAHÇE', primary: '#FFED00', secondary: '#00239C', style: 'modern' },
  { file: 'anadolu-efes.svg', name: 'EFES', fullName: 'ANADOLU EFES', primary: '#003087', secondary: '#FFFFFF', style: 'modern' },
  
  // EuroLeague - Greek Teams
  { file: 'panathinaikos.svg', name: 'PAO', fullName: 'PANATHINAIKOS', primary: '#00803C', secondary: '#FFFFFF', style: 'modern' },
  { file: 'olympiacos.svg', name: 'OLY', fullName: 'OLYMPIACOS', primary: '#ED1C24', secondary: '#FFFFFF', style: 'modern' },
  
  // EuroLeague - Italian Teams
  { file: 'virtus-bologna.svg', name: 'VIRTUS', fullName: 'VIRTUS BOLOGNA', primary: '#000000', secondary: '#FFFFFF', style: 'shield' },
  { file: 'armani-milan.svg', name: 'MILANO', fullName: 'OLIMPIA MILANO', primary: '#ED1C24', secondary: '#FFFFFF', style: 'modern' },
  
  // EuroLeague - Lithuanian Teams
  { file: 'zalgiris.svg', name: 'ŽAL', fullName: 'ŽALGIRIS', primary: '#00843D', secondary: '#FFFFFF', style: 'modern' },
  
  // EuroLeague - Spanish Teams  
  { file: 'baskonia.svg', name: 'BASKONIA', fullName: 'BASKONIA', primary: '#003DA5', secondary: '#FFFFFF', style: 'modern' },
  { file: 'unicaja.svg', name: 'UNICAJA', fullName: 'UNICAJA', primary: '#00A94F', secondary: '#FFFFFF', style: 'modern' },
  
  // EuroLeague - Israeli Teams
  { file: 'maccabi-tel-aviv.svg', name: 'MACCABI', fullName: 'MACCABI TA', primary: '#004B93', secondary: '#FFD700', style: 'star' },
  { file: 'hapoel-tel-aviv.svg', name: 'HAPOEL', fullName: 'HAPOEL TA', primary: '#E31E24', secondary: '#FFFFFF', style: 'shield' },
  
  // EuroLeague - French Teams
  { file: 'monaco.svg', name: 'ASM', fullName: 'AS MONACO', primary: '#E31E24', secondary: '#FFFFFF', style: 'modern' },
  
  // EuroLeague - Serbian Teams
  { file: 'partizan.svg', name: '⭐', fullName: 'PARTIZAN', primary: '#000000', secondary: '#FFFFFF', style: 'star' },
  
  // Other
  { file: 'dubai.svg', name: 'DUBAI', fullName: 'DUBAI BC', primary: '#C69214', secondary: '#000000', style: 'modern' },
];

// Generate modern, professional-looking SVG
function generateModernSVG(name, fullName, primaryColor, secondaryColor, style = 'modern') {
  const fontSize = name.length <= 3 ? '72' : name.length <= 6 ? '56' : '48';
  const subtitleSize = fullName.length <= 10 ? '24' : '20';
  
  // Different styles
  if (style === 'star') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <circle cx="250" cy="250" r="240" fill="${primaryColor}"/>
  <circle cx="250" cy="250" r="220" fill="${secondaryColor}" opacity="0.15"/>
  
  <!-- Star or text -->
  <text 
    x="250" 
    y="280" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="160" 
    font-weight="bold" 
    text-anchor="middle" 
    dominant-baseline="middle" 
    fill="${secondaryColor}"
  >${name}</text>
  
  <!-- Bottom text -->
  <text 
    x="250" 
    y="410" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="22" 
    font-weight="600" 
    text-anchor="middle" 
    fill="${secondaryColor}"
    letter-spacing="2"
  >${fullName}</text>
  
  <!-- Subtle border -->
  <circle cx="250" cy="250" r="240" fill="none" stroke="${secondaryColor}" stroke-width="6" opacity="0.3"/>
</svg>`;
  }
  
  if (style === 'shield') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
  <!-- Shield background -->
  <path d="M 250,50 L 450,150 L 450,350 Q 450,450 250,480 Q 50,450 50,350 L 50,150 Z" 
        fill="${primaryColor}" 
        stroke="${secondaryColor}" 
        stroke-width="8"/>
  
  <!-- Inner shield detail -->
  <path d="M 250,80 L 420,165 L 420,340 Q 420,420 250,445 Q 80,420 80,340 L 80,165 Z" 
        fill="none" 
        stroke="${secondaryColor}" 
        stroke-width="3" 
        opacity="0.3"/>
  
  <!-- Team name -->
  <text 
    x="250" 
    y="270" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="${fontSize}" 
    font-weight="bold" 
    text-anchor="middle" 
    dominant-baseline="middle" 
    fill="${secondaryColor}"
  >${name}</text>
</svg>`;
  }
  
  if (style === 'circle') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad_${name}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${primaryColor};stop-opacity:0.7" />
    </linearGradient>
  </defs>
  
  <!-- Main circle -->
  <circle cx="250" cy="250" r="240" fill="url(#grad_${name})"/>
  
  <!-- Double ring effect -->
  <circle cx="250" cy="250" r="230" fill="none" stroke="${secondaryColor}" stroke-width="4" opacity="0.5"/>
  <circle cx="250" cy="250" r="210" fill="none" stroke="${secondaryColor}" stroke-width="2" opacity="0.3"/>
  
  <!-- Team name -->
  <text 
    x="250" 
    y="260" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="${fontSize}" 
    font-weight="bold" 
    text-anchor="middle" 
    dominant-baseline="middle" 
    fill="${secondaryColor}"
    style="text-shadow: 0 2px 4px rgba(0,0,0,0.3)"
  >${name}</text>
  
  <!-- Bottom subtitle -->
  <text 
    x="250" 
    y="380" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="${subtitleSize}" 
    font-weight="600" 
    text-anchor="middle" 
    fill="${secondaryColor}"
    opacity="0.9"
  >${fullName}</text>
</svg>`;
  }
  
  // Default: modern style
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad_${name.replace(/\s/g, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${primaryColor};stop-opacity:0.8" />
    </linearGradient>
    <filter id="shadow_${name.replace(/\s/g, '')}">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="2" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Modern rounded square background -->
  <rect x="30" y="30" width="440" height="440" rx="60" fill="url(#grad_${name.replace(/\s/g, '')})"/>
  
  <!-- Geometric decoration -->
  <rect x="50" y="50" width="400" height="400" rx="50" fill="none" stroke="${secondaryColor}" stroke-width="3" opacity="0.2"/>
  <rect x="70" y="70" width="360" height="360" rx="40" fill="none" stroke="${secondaryColor}" stroke-width="2" opacity="0.15"/>
  
  <!-- Team name -->
  <text 
    x="250" 
    y="280" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="${fontSize}" 
    font-weight="900" 
    text-anchor="middle" 
    dominant-baseline="middle" 
    fill="${secondaryColor}"
    filter="url(#shadow_${name.replace(/\s/g, '')})"
  >${name}</text>
</svg>`;
}

// Generate all logos
let created = 0;
let skipped = 0;

console.log('🎨 Generating Realistic Team Logo Placeholders...\n');
console.log('=' .repeat(70));
console.log('\n');

for (const team of teams) {
  const filePath = path.join(LOGOS_DIR, team.file);
  
  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`⏭️  Skipped ${team.file.padEnd(35)} (already exists)`);
    skipped++;
    continue;
  }
  
  const svg = generateModernSVG(team.name, team.fullName, team.primary, team.secondary, team.style);
  
  fs.writeFileSync(filePath, svg, 'utf-8');
  console.log(`✅ Created ${team.file.padEnd(35)} ${team.fullName}`);
  created++;
}

console.log('\n' + '=' .repeat(70));
console.log(`\n📊 Summary:`);
console.log(`   ✅ Created: ${created} logos`);
console.log(`   ⏭️  Skipped: ${skipped} logos (already exist)`);
console.log(`   📁 Total: ${teams.length} teams`);
console.log(`\n🎉 High-quality placeholder logos generated!`);
console.log(`   These use authentic team colors and professional designs.`);
console.log(`\n💡 Tip: You can replace these with official logos later if needed.`);
console.log(`\n`);

