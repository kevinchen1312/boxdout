#!/usr/bin/env node
/**
 * Detect teams that still have placeholders or lack logos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, '..', 'public', 'logos');
const schedulesDir = path.join(__dirname, '..', 'public', 'data', 'pro_schedules');

// Read the logo mappings
const loadSchedulesPath = path.join(__dirname, '..', 'lib', 'loadSchedules.ts');
const loadSchedulesContent = fs.readFileSync(loadSchedulesPath, 'utf-8');

// Extract INTERNATIONAL_TEAM_LOGOS mapping
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
  
  // Extract team names from schedule format
  // Lines like: "Nov 15, 2025 - @ Dreamland Gran Canaria @ Centro Insular de Deportes"
  // Better patterns that avoid venue names
  const lines = content.split('\n');
  for (const line of lines) {
    // Skip header lines
    if (line.includes('Schedule') || line.includes('Rank:') || line.includes('Source:')) continue;
    
    // Match patterns like: "vs Team Name" or "@ Team Name" or "v. Team Name"
    const patterns = [
      /(?:vs|@|v\.)\s+([A-Z][A-Za-z\s&'-]+?)(?:\s+@|\s*\(|$)/,
      /(?:vs|@|v\.)\s+([A-Z][A-Za-z\s&'-]+?)(?:\s+\d{1,2}:\d{2})/,
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let teamName = match[1].trim();
        // Filter out common false positives
        if (teamName && 
            teamName.length > 2 && 
            teamName.length < 50 &&
            !teamName.match(/^(Arena|Stadium|Centre|Hall|Palacio|Pabellon|Palau|Salle|Le Colisee|RAC|Qudos|John Cain|Spark|MyState|Wolfbrook|Derwent|Brisbane Entertainment|Cairns Convention|WIN Entertainment|Adelaide Entertainment|Casey|AIS|Antares|Astroballe|Audi Dome|Bilbao Arena|Centro Insular|Fernando Buesa|Hadar Yosef|Halle Georges|Holon City|Jose Maria|La Meilleraie|Mediolanum|Menora|Olympic Indoor|Pabellon|Palacio|Palais|Pavello|Pazo|Peace and Friendship|Poliesportiu|Principe Felipe|Rhenus|Salle|Sinan Erdem|Stade Louis|Stark|Unipol|Zalgiris)/i) &&
            !teamName.match(/^\d{1,2}:\d{2}/) &&
            !teamName.includes('ET') &&
            !teamName.includes('PM') &&
            !teamName.includes('AM') &&
            !teamName.includes('TBA') &&
            !teamName.includes('Schedule') &&
            !teamName.includes('Rank:')) {
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

// Check which teams are missing logos
const missingLogos = [];
const teamsWithPlaceholders = [];
const teamsWithLogos = [];

for (const teamName of teamNames) {
  const normalized = normalizeForLookup(teamName);
  const logoPath = logoMappings[normalized];
  
  if (!logoPath) {
    // Check if it's a college team (they use ESPN API)
    if (!teamName.match(/\b(University|College|State|Tech|State)\b/i)) {
      missingLogos.push(teamName);
    }
  } else {
    // Check if logo file exists
    const logoFileName = logoPath.replace('/logos/', '').replace(/^\/+/, '');
    const logoBaseName = logoFileName.replace(/\.(png|svg|jpg|jpeg|webp)$/i, '');
    
    if (!logoFiles.has(logoBaseName)) {
      teamsWithPlaceholders.push({ team: teamName, expected: logoFileName });
    } else {
      teamsWithLogos.push(teamName);
    }
  }
}

// Also check for placeholder SVG files (small files are likely placeholders)
const placeholderFiles = [];
if (fs.existsSync(logosDir)) {
  const files = fs.readdirSync(logosDir);
  for (const file of files) {
    if (file.match(/\.(svg|png)$/i)) {
      const filePath = path.join(logosDir, file);
      const stats = fs.statSync(filePath);
      // SVG placeholders are usually very small (< 5KB) or PNG placeholders (< 10KB)
      if ((file.endsWith('.svg') && stats.size < 5000) || 
          (file.endsWith('.png') && stats.size < 10000)) {
        placeholderFiles.push({ file, size: stats.size });
      }
    }
  }
}

console.log('🔍 Logo Detection Report\n');
console.log('='.repeat(70));
console.log(`\n📊 Statistics:`);
console.log(`   Total teams found in schedules: ${teamNames.size}`);
console.log(`   Teams with logos: ${teamsWithLogos.length}`);
console.log(`   Teams missing logos: ${missingLogos.length}`);
console.log(`   Teams with placeholder/missing files: ${teamsWithPlaceholders.length}`);
console.log(`   Potential placeholder files: ${placeholderFiles.length}`);

if (missingLogos.length > 0) {
  console.log(`\n❌ Teams Missing Logo Mappings (${missingLogos.length}):`);
  const sorted = [...missingLogos].sort();
  for (const team of sorted) {
    console.log(`   - ${team}`);
  }
}

if (teamsWithPlaceholders.length > 0) {
  console.log(`\n⚠️  Teams with Missing Logo Files (${teamsWithPlaceholders.length}):`);
  for (const { team, expected } of teamsWithPlaceholders) {
    console.log(`   - ${team} (expected: ${expected})`);
  }
}

if (placeholderFiles.length > 0) {
  console.log(`\n⚠️  Potential Placeholder Files (${placeholderFiles.length}):`);
  for (const { file, size } of placeholderFiles) {
    console.log(`   - ${file} (${size} bytes)`);
  }
}

// Show some teams with logos for verification
if (teamsWithLogos.length > 0) {
  console.log(`\n✅ Sample Teams with Logos (showing first 10):`);
  const sample = [...teamsWithLogos].sort().slice(0, 10);
  for (const team of sample) {
    const normalized = normalizeForLookup(team);
    const logoPath = logoMappings[normalized];
    console.log(`   - ${team} → ${logoPath}`);
  }
}

console.log('\n' + '='.repeat(70) + '\n');

