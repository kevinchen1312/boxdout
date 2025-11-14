#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Sample team names from schedules to test
const testTeams = [
  // Serbian ABA League
  'Mega Superbet',
  'Cedevita Olimpija',
  'Bosna BH Telecom',
  'BC Vienna',
  'Crvena zvezda Meridianbet',
  'Ilirija',
  'Zadar',
  'Budućnost VOLI',
  'Spartak Office Shoes',
  
  // EuroLeague - Spanish
  'Real Madrid',
  'Barca',
  'FC Barcelona',
  'Baskonia',
  'Unicaja',
  
  // EuroLeague - Italian
  'Virtus Bologna',
  'AX Armani Exchange Milan',
  
  // EuroLeague - Turkish
  'Fenerbahce Beko',
  'Anadolu Efes',
  
  // EuroLeague - Greek
  'Panathinaikos',
  'Olympiacos',
  
  // EuroLeague - Other
  'Zalgiris',
  'Bayern Munich',
  'KK Partizan',
  'Hapoel Tel Aviv',
  'Maccabi FOX Tel Aviv',
  'AS Monaco Basket',
  'Dubai',
  
  // NBL
  'Melbourne United',
  'New Zealand Breakers',
  
  // French
  'ASVEL Basket',
  'Paris Basketball',
  
  // Spanish
  'Valencia Basket',
];

// Normalize function (same as in loadSchedules.ts)
const normalizeForLookup = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

// International team logos (from loadSchedules.ts)
const INTERNATIONAL_TEAM_LOGOS = {
  // NBL Teams
  'melbourneunited': '/logos/melbourne-united.png',
  'newzealandbreakers': '/logos/new-zealand-breakers.png',
  'brisbanebullets': '/logos/brisbane-bullets.png',
  'semelbournephoenix': '/logos/south-east-melbourne-phoenix.png',
  'southeastmelbournephoenix': '/logos/south-east-melbourne-phoenix.png',
  'cairnstaipans': '/logos/cairns-taipans.png',
  'taipans': '/logos/cairns-taipans.png',
  'perthwildcats': '/logos/perth-wildcats.png',
  'wildcats': '/logos/perth-wildcats.png',
  'tasmaniajackjumpers': '/logos/tasmania-jackjumpers.png',
  'jackjumpers': '/logos/tasmania-jackjumpers.png',
  'sydneykings': '/logos/sydney-kings.png',
  'kings': '/logos/sydney-kings.png',
  'adelaide36ers': '/logos/adelaide-36ers.png',
  '36ers': '/logos/adelaide-36ers.png',
  'illawarrahawks': '/logos/illawarra-hawks.png',
  'hawks': '/logos/illawarra-hawks.png',
  
  // EuroLeague Teams
  'asvelbasket': '/logos/asvel-basket.png',
  'ldlcasvel': '/logos/asvel-basket.png',
  'asvel': '/logos/asvel-basket.png',
  'parisbasketball': '/logos/paris-basketball.png',
  'valenciabasket': '/logos/valencia-basket.png',
  'valencia': '/logos/valencia-basket.png',
  'joventutbadalona': '/logos/joventut-badalona.png',
  'penya': '/logos/joventut-badalona.png',
  
  // Serbian ABA League
  'megasuperbet': '/logos/mega-superbet.svg',
  'mega': '/logos/mega-superbet.svg',
  'cedevitaolimpija': '/logos/cedevita-olimpija.svg',
  'olimpija': '/logos/cedevita-olimpija.svg',
  'bosnabhtelecom': '/logos/bosna-bh-telecom.svg',
  'bosna': '/logos/bosna-bh-telecom.svg',
  'bcvienna': '/logos/bc-vienna.svg',
  'vienna': '/logos/bc-vienna.svg',
  'crvenazvezdameridianbet': '/logos/crvena-zvezda.svg',
  'kkcrvenazvezda': '/logos/crvena-zvezda.svg',
  'crvenazvezda': '/logos/crvena-zvezda.svg',
  'redstar': '/logos/crvena-zvezda.svg',
  'ilirija': '/logos/ilirija.svg',
  'zadar': '/logos/zadar.svg',
  'buducnostvoli': '/logos/buducnost.svg',
  'buducnost': '/logos/buducnost.svg',
  'spartakofficeshoes': '/logos/spartak.svg',
  'spartak': '/logos/spartak.svg',
  
  // EuroLeague - Spanish
  'realmadrid': '/logos/real-madrid.svg',
  'madrid': '/logos/real-madrid.svg',
  'fcbarcelona': '/logos/barcelona.svg',
  'barca': '/logos/barcelona.svg',
  'barcelona': '/logos/barcelona.svg',
  'baskonia': '/logos/baskonia.svg',
  'unicaja': '/logos/unicaja.svg',
  
  // EuroLeague - Italian
  'virtusbologna': '/logos/virtus-bologna.svg',
  'virtus': '/logos/virtus-bologna.svg',
  'bologna': '/logos/virtus-bologna.svg',
  'axarmaniexchangemilan': '/logos/armani-milan.svg',
  'armanimilano': '/logos/armani-milan.svg',
  'olimpiamilano': '/logos/armani-milan.svg',
  'milan': '/logos/armani-milan.svg',
  
  // EuroLeague - Turkish
  'fenerbahcebeko': '/logos/fenerbahce.svg',
  'fenerbahce': '/logos/fenerbahce.svg',
  'anadoluefes': '/logos/anadolu-efes.svg',
  'efes': '/logos/anadolu-efes.svg',
  
  // EuroLeague - Greek
  'panathinaikos': '/logos/panathinaikos.svg',
  'pao': '/logos/panathinaikos.svg',
  'olympiacos': '/logos/olympiacos.svg',
  'olympiakos': '/logos/olympiacos.svg',
  
  // EuroLeague - Lithuanian
  'zalgiris': '/logos/zalgiris.svg',
  'zalgiriskaunas': '/logos/zalgiris.svg',
  
  // EuroLeague - German
  'bayernmunich': '/logos/bayern-munich.svg',
  'bayern': '/logos/bayern-munich.svg',
  'fcbayernmunchen': '/logos/bayern-munich.svg',
  
  // EuroLeague - Serbian
  'kkpartizan': '/logos/partizan.svg',
  'partizan': '/logos/partizan.svg',
  'partizanbelgrade': '/logos/partizan.svg',
  
  // EuroLeague - Israeli
  'hapoeltelaviv': '/logos/hapoel-tel-aviv.svg',
  'hapoel': '/logos/hapoel-tel-aviv.svg',
  'maccabifoxtelaviv': '/logos/maccabi-tel-aviv.svg',
  'maccabi': '/logos/maccabi-tel-aviv.svg',
  'maccabitelaviv': '/logos/maccabi-tel-aviv.svg',
  
  // EuroLeague - French
  'asmonacobasket': '/logos/monaco.svg',
  'monaco': '/logos/monaco.svg',
  'asmonaco': '/logos/monaco.svg',
  
  // EuroLeague - Other
  'dubai': '/logos/dubai.svg',
};

console.log('🔍 Verifying Logo Mappings...\n');

let passed = 0;
let failed = 0;

for (const teamName of testTeams) {
  const normalized = normalizeForLookup(teamName);
  const logoPath = INTERNATIONAL_TEAM_LOGOS[normalized];
  
  if (logoPath) {
    // Check if file exists
    const fullPath = path.join(process.cwd(), 'public', logoPath.replace('/logos/', 'logos/'));
    const exists = fs.existsSync(fullPath);
    
    if (exists) {
      console.log(`✅ ${teamName.padEnd(30)} → ${logoPath}`);
      passed++;
    } else {
      console.log(`⚠️  ${teamName.padEnd(30)} → ${logoPath} (FILE NOT FOUND)`);
      failed++;
    }
  } else {
    console.log(`❌ ${teamName.padEnd(30)} → NO MAPPING FOUND`);
    failed++;
  }
}

console.log(`\n📊 Results:`);
console.log(`   ✅ Passed: ${passed}/${testTeams.length}`);
console.log(`   ❌ Failed: ${failed}/${testTeams.length}`);

if (failed === 0) {
  console.log(`\n🎉 All team logos are properly mapped and files exist!`);
  process.exit(0);
} else {
  console.log(`\n⚠️  Some teams are missing logo mappings or files.`);
  process.exit(1);
}

