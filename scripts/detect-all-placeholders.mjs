#!/usr/bin/env node
/**
 * Detect all teams with placeholders or missing logos (including college teams)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');

// Read the logo mappings
const loadSchedulesPath = path.join(__dirname, '..', 'lib', 'loadSchedules.ts');
const loadSchedulesContent = fs.readFileSync(loadSchedulesPath, 'utf-8');

// Extract all logo mappings
const logoMappings = {};
const mappingMatch = loadSchedulesContent.match(/const INTERNATIONAL_TEAM_LOGOS[^=]*=\s*\{([^}]+)\}/s);
if (mappingMatch) {
  const mappings = mappingMatch[1];
  const lines = mappings.split('\n');
  for (const line of lines) {
    const match = line.match(/'([^']+)':\s*'([^']+)'/);
    if (match) {
      const [, key, logoPath] = match;
      logoMappings[key] = logoPath;
    }
  }
}

// Get all logo files
const logoFiles = new Set();
if (fs.existsSync(logosDir)) {
  const files = fs.readdirSync(logosDir);
  for (const file of files) {
    if (file.match(/\.(png|svg|jpg|jpeg|webp)$/i)) {
      const baseName = file.replace(/\.(png|svg|jpg|jpeg|webp)$/i, '');
      logoFiles.add(baseName);
    }
  }
}

// Extract team names from schedule files
const teamNames = new Set();

function findScheduleFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findScheduleFiles(fullPath));
    } else if (entry.name.endsWith('_schedule.txt')) {
      files.push(fullPath);
    }
  }
  return files;
}

const scheduleFiles = findScheduleFiles(path.join(__dirname, '..'));

for (const scheduleFile of scheduleFiles) {
  const content = fs.readFileSync(scheduleFile, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes('Schedule') || line.includes('Rank:') || line.includes('Source:')) continue;
    
    // Match patterns like: "vs Team Name" or "@ Team Name" or "v. Team Name"
    const patterns = [
      /(?:vs|@|v\.)\s+([A-Z][A-Za-z\s&'.-]+?)(?:\s+@|\s*\(|$)/,
      /(?:vs|@|v\.)\s+([A-Z][A-Za-z\s&'.-]+?)(?:\s+\d{1,2}:\d{2})/,
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let teamName = match[1].trim();
        // Filter out common false positives
        if (teamName && 
            teamName.length > 2 && 
            teamName.length < 60 &&
            !teamName.match(/^(Arena|Stadium|Centre|Hall|Palacio|Pabellon|Palau|Salle|Le Colisee|RAC|Qudos|John Cain|Spark|MyState|Wolfbrook|Derwent|Brisbane Entertainment|Cairns Convention|WIN Entertainment|Adelaide Entertainment|Casey|AIS|Antares|Astroballe|Audi Dome|Bilbao Arena|Centro Insular|Fernando Buesa|Hadar Yosef|Halle Georges|Holon City|Jose Maria|La Meilleraie|Mediolanum|Menora|Olympic Indoor|Pabellon|Palacio|Palais|Pavello|Pazo|Peace and Friendship|Poliesportiu|Principe Felipe|Rhenus|Salle|Sinan Erdem|Stade Louis|Stark|Unipol|Zalgiris|United Supermarkets|Reed Arena|Gallagher-Iba|State Farm|Benchmark|Petersen|College Park|Madison Square|Fertitta|CU Events|Moody|Crisler|Breslin|Value City|Welsh-Ryan|Capital One|Carver-Hawkeye|Dickies|American Airlines|Baha Mar|Brisbane Entertainment|Cairns Convention|WIN Entertainment|Adelaide Entertainment|Casey|AIS|Antares|Astroballe|Audi Dome|Bilbao Arena|Centro Insular|Fernando Buesa|Hadar Yosef|Halle Georges|Holon City|Jose Maria|La Meilleraie|Mediolanum|Menora|Olympic Indoor|Pabellon|Palacio|Palais|Pavello|Pazo|Peace and Friendship|Poliesportiu|Principe Felipe|Rhenus|Salle|Sinan Erdem|Stade Louis|Stark|Unipol|Zalgiris)/i) &&
            !teamName.match(/^\d{1,2}:\d{2}/) &&
            !teamName.includes('ET') &&
            !teamName.includes('PM') &&
            !teamName.includes('AM') &&
            !teamName.includes('TBA') &&
            !teamName.includes('Schedule') &&
            !teamName.includes('Rank:') &&
            !teamName.includes('Source:')) {
          teamNames.add(teamName);
        }
      }
    }
  }
}

// Normalize team name for lookup (same as in loadSchedules.ts)
function normalizeForLookup(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Check which teams are missing logos or have placeholders
const missingLogos = [];
const teamsWithPlaceholders = [];
const teamsWithLogos = [];
const smallFiles = [];

for (const teamName of teamNames) {
  const normalized = normalizeForLookup(teamName);
  const logoPath = logoMappings[normalized];
  
  if (!logoPath) {
    missingLogos.push(teamName);
  } else {
    // Check if logo file exists
    const logoFileName = logoPath.replace('/logos/', '').replace(/^\/+/, '');
    const logoBaseName = logoFileName.replace(/\.(png|svg|jpg|jpeg|webp)$/i, '');
    
    if (!logoFiles.has(logoBaseName)) {
      teamsWithPlaceholders.push({ team: teamName, expected: logoFileName, reason: 'File missing' });
    } else {
      // Check file size - small files might be placeholders
      const filePath = path.join(logosDir, logoFileName);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        // SVG placeholders are usually very small (< 2KB) or PNG placeholders (< 5KB)
        if ((logoFileName.endsWith('.svg') && stats.size < 2000) || 
            (logoFileName.endsWith('.png') && stats.size < 5000)) {
          smallFiles.push({ team: teamName, file: logoFileName, size: stats.size });
        } else {
          teamsWithLogos.push(teamName);
        }
      }
    }
  }
}

console.log('🔍 Complete Placeholder Detection Report\n');
console.log('='.repeat(70));
console.log(`\n📊 Statistics:`);
console.log(`   Total teams found in schedules: ${teamNames.size}`);
console.log(`   Teams with real logos: ${teamsWithLogos.length}`);
console.log(`   Teams missing logo mappings: ${missingLogos.length}`);
console.log(`   Teams with missing files: ${teamsWithPlaceholders.length}`);
console.log(`   Teams with small files (potential placeholders): ${smallFiles.length}`);

if (missingLogos.length > 0) {
  console.log(`\n❌ Teams Missing Logo Mappings (${missingLogos.length}):`);
  const sorted = [...missingLogos].sort();
  for (const team of sorted) {
    console.log(`   - ${team}`);
  }
}

if (teamsWithPlaceholders.length > 0) {
  console.log(`\n⚠️  Teams with Missing Logo Files (${teamsWithPlaceholders.length}):`);
  for (const { team, expected, reason } of teamsWithPlaceholders) {
    console.log(`   - ${team} (expected: ${expected}) - ${reason}`);
  }
}

if (smallFiles.length > 0) {
  console.log(`\n⚠️  Teams with Small Files (Potential Placeholders) (${smallFiles.length}):`);
  for (const { team, file, size } of smallFiles) {
    console.log(`   - ${team} → ${file} (${size} bytes)`);
  }
}

// Show Mega Superbet opponents specifically
const megaOpponents = ['Cedevita Olimpija', 'Bosna BH Telecom', 'BC Vienna', 'Crvena zvezda', 'Ilirija', 'Zadar', 'Budućnost VOLI', 'Spartak Office Shoes'];
console.log(`\n🏀 Mega Superbet Opponents Status:`);
for (const opponent of megaOpponents) {
  const normalized = normalizeForLookup(opponent);
  const logoPath = logoMappings[normalized];
  if (!logoPath) {
    console.log(`   ❌ ${opponent} - No mapping`);
  } else {
    const logoFileName = logoPath.replace('/logos/', '').replace(/^\/+/, '');
    const logoBaseName = logoFileName.replace(/\.(png|svg|jpg|jpeg|webp)$/i, '');
    if (!logoFiles.has(logoBaseName)) {
      console.log(`   ⚠️  ${opponent} - Mapping exists but file missing: ${logoFileName}`);
    } else {
      const filePath = path.join(logosDir, logoFileName);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if ((logoFileName.endsWith('.svg') && stats.size < 2000) || 
            (logoFileName.endsWith('.png') && stats.size < 5000)) {
          console.log(`   ⚠️  ${opponent} - Small file (${stats.size} bytes): ${logoFileName}`);
        } else {
          console.log(`   ✅ ${opponent} - OK: ${logoFileName} (${stats.size} bytes)`);
        }
      }
    }
  }
}

console.log('\n' + '='.repeat(70) + '\n');

