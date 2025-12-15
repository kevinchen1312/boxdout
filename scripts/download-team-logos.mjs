#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// Teams that need real logos (currently have SVG placeholders)
const teamsNeedingLogos = [
  {
    file: 'mega-superbet',
    name: 'Mega Superbet',
    searches: [
      'https://www.google.com/search?q=Mega+Superbet+logo+PNG+transparent',
      'https://commons.wikimedia.org/w/index.php?search=Mega+Superbet+logo',
    ],
  },
  {
    file: 'crvena-zvezda',
    name: 'Crvena Zvezda (Red Star Belgrade)',
    searches: [
      'https://www.google.com/search?q=KK+Crvena+Zvezda+logo+PNG+transparent',
      'https://www.kkcrvenazvezda.rs/',
      'https://commons.wikimedia.org/w/index.php?search=Crvena+zvezda+basketball+logo',
    ],
  },
  {
    file: 'partizan',
    name: 'KK Partizan Belgrade',
    searches: [
      'https://www.google.com/search?q=KK+Partizan+Belgrade+logo+PNG+transparent',
      'https://www.partizan.rs/basketball/',
      'https://commons.wikimedia.org/w/index.php?search=Partizan+Belgrade+logo',
    ],
  },
  {
    file: 'real-madrid',
    name: 'Real Madrid Basketball',
    searches: [
      'https://www.google.com/search?q=Real+Madrid+basketball+logo+PNG+transparent',
      'https://www.realmadrid.com/en/basketball',
      'https://commons.wikimedia.org/w/index.php?search=Real+Madrid+logo',
    ],
  },
  {
    file: 'barcelona',
    name: 'FC Barcelona Basketball',
    searches: [
      'https://www.google.com/search?q=FC+Barcelona+logo+PNG+transparent',
      'https://www.fcbarcelona.com/en/basketball',
      'https://commons.wikimedia.org/w/index.php?search=FC+Barcelona+logo',
    ],
  },
  {
    file: 'fenerbahce',
    name: 'Fenerbahçe Beko',
    searches: [
      'https://www.google.com/search?q=Fenerbahce+basketball+logo+PNG+transparent',
      'https://www.fenerbahce.org/basketball',
      'https://commons.wikimedia.org/w/index.php?search=Fenerbahce+logo',
    ],
  },
  {
    file: 'panathinaikos',
    name: 'Panathinaikos Athens',
    searches: [
      'https://www.google.com/search?q=Panathinaikos+basketball+logo+PNG+transparent',
      'https://www.paobc.gr/',
      'https://commons.wikimedia.org/w/index.php?search=Panathinaikos+logo',
    ],
  },
  {
    file: 'olympiacos',
    name: 'Olympiacos Piraeus',
    searches: [
      'https://www.google.com/search?q=Olympiacos+basketball+logo+PNG+transparent',
      'https://www.olympiacosbc.gr/',
      'https://commons.wikimedia.org/w/index.php?search=Olympiacos+logo',
    ],
  },
  {
    file: 'maccabi-tel-aviv',
    name: 'Maccabi Tel Aviv',
    searches: [
      'https://www.google.com/search?q=Maccabi+Tel+Aviv+basketball+logo+PNG+transparent',
      'https://www.maccabi.co.il/',
      'https://commons.wikimedia.org/w/index.php?search=Maccabi+Tel+Aviv+logo',
    ],
  },
  {
    file: 'zalgiris',
    name: 'Žalgiris Kaunas',
    searches: [
      'https://www.google.com/search?q=Zalgiris+Kaunas+logo+PNG+transparent',
      'https://www.zalgiris.lt/',
      'https://commons.wikimedia.org/w/index.php?search=Zalgiris+logo',
    ],
  },
  {
    file: 'bayern-munich',
    name: 'FC Bayern Munich Basketball',
    searches: [
      'https://www.google.com/search?q=Bayern+Munich+basketball+logo+PNG+transparent',
      'https://fcbayern.com/basketball',
      'https://commons.wikimedia.org/w/index.php?search=FC+Bayern+logo',
    ],
  },
  {
    file: 'anadolu-efes',
    name: 'Anadolu Efes',
    searches: [
      'https://www.google.com/search?q=Anadolu+Efes+logo+PNG+transparent',
      'https://www.anadoluefessk.org/',
    ],
  },
  {
    file: 'virtus-bologna',
    name: 'Virtus Bologna',
    searches: [
      'https://www.google.com/search?q=Virtus+Bologna+logo+PNG+transparent',
      'https://www.virtus.it/',
    ],
  },
  {
    file: 'armani-milan',
    name: 'Olimpia Milano',
    searches: [
      'https://www.google.com/search?q=Olimpia+Milano+logo+PNG+transparent',
      'https://www.olimpiamilano.com/',
    ],
  },
  {
    file: 'baskonia',
    name: 'Baskonia Vitoria',
    searches: [
      'https://www.google.com/search?q=Baskonia+logo+PNG+transparent',
      'https://www.baskonia.com/',
    ],
  },
  {
    file: 'monaco',
    name: 'AS Monaco Basket',
    searches: [
      'https://www.google.com/search?q=AS+Monaco+basketball+logo+PNG+transparent',
      'https://www.monacobs.com/',
    ],
  },
];

console.log('🔍 International Basketball Team Logos - Download Guide\n');
console.log('=' .repeat(70));
console.log('\n📋 INSTRUCTIONS:\n');
console.log('1. For each team below, search links are provided');
console.log('2. Download the logo (PNG format preferred, 500x500px or larger)');
console.log('3. Save it to: public/logos/[filename].png');
console.log('4. Look for transparent background versions when possible');
console.log('5. Run "node scripts/verify-logo-mappings.mjs" to check your progress\n');
console.log('=' .repeat(70));
console.log('\n');

// Check which logos are missing
const missingLogos = [];
const hasSVGPlaceholder = [];

for (const team of teamsNeedingLogos) {
  const pngPath = path.join(LOGOS_DIR, `${team.file}.png`);
  const svgPath = path.join(LOGOS_DIR, `${team.file}.svg`);
  
  const hasPNG = fs.existsSync(pngPath);
  const hasSVG = fs.existsSync(svgPath);
  
  if (!hasPNG) {
    missingLogos.push(team);
    if (hasSVG) {
      hasSVGPlaceholder.push(team);
    }
  }
}

if (missingLogos.length === 0) {
  console.log('✅ All teams have PNG logos! Great job!\n');
  process.exit(0);
}

console.log(`📊 Status: ${missingLogos.length} team(s) need logos\n`);
console.log('─'.repeat(70));
console.log('\n');

// Print download instructions for each missing logo
for (let i = 0; i < missingLogos.length; i++) {
  const team = missingLogos[i];
  console.log(`\n${i + 1}. ${team.name}`);
  console.log(`   Save as: public/logos/${team.file}.png\n`);
  console.log('   🔗 Search/Download Links:');
  team.searches.forEach((url, idx) => {
    console.log(`      ${idx + 1}) ${url}`);
  });
  console.log('\n' + '─'.repeat(70));
}

console.log('\n\n💡 TIPS:\n');
console.log('• Look for "transparent background" or "PNG" versions');
console.log('• SportsLogos.net often has high-quality logos');
console.log('• Wikimedia Commons has many team logos (SVG format)');
console.log('• Official team websites usually have logos in their press/media sections');
console.log('• If you find an SVG, you can convert it to PNG online');
console.log('\n📝 Recommended tools:');
console.log('• PNG conversion: https://cloudconvert.com/svg-to-png');
console.log('• Remove background: https://www.remove.bg/');
console.log('• Resize images: https://www.iloveimg.com/resize-image');

console.log('\n\n🎯 PRIORITY TEAMS (most commonly appearing in schedules):');
const priority = ['real-madrid', 'barcelona', 'fenerbahce', 'panathinaikos', 'crvena-zvezda', 'partizan'];
const priorityTeams = missingLogos.filter(t => priority.includes(t.file));
if (priorityTeams.length > 0) {
  priorityTeams.forEach(t => console.log(`   • ${t.name}`));
} else {
  console.log('   ✅ All priority teams have logos!');
}

console.log('\n');







