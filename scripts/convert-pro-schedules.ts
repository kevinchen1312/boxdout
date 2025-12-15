// Convert CSV schedules from public/data/pro_schedules/ to root directory format
import fs from 'node:fs';
import path from 'node:path';
import { parse, format } from 'date-fns';

const PRO_SCHEDULES_DIR = path.resolve('public/data/pro_schedules');
const ROOT_DIR = process.cwd();

interface ProspectInfo {
  name: string;
  rank: number;
  team: string;
  filename: string;
}

const PROSPECTS: ProspectInfo[] = [
  { name: 'Ognjen Srzentic', rank: 50, team: 'Mega Superbet', filename: 'ognjen_srzentic_schedule.txt' },
  { name: 'Luigi Suigo', rank: 72, team: 'Mega Superbet', filename: 'luigi_suigo_schedule.txt' },
];

function convert24To12Hour(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function convertCSVToSchedule(csvPath: string, prospect: ProspectInfo): string {
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n').filter(line => line.trim());
  
  const header = `${prospect.name} 2025-26 ${prospect.team} Schedule`;
  const rankLine = `Rank: #${prospect.rank}`;
  const gameLines: string[] = [];
  
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 5) continue;
    
    const [dateStr, timeET, comp, opponent, hoa, venue, url] = parts;
    
    // Parse date: "2025-10-05" -> "Oct 5, 2025"
    const date = parse(dateStr, 'yyyy-MM-dd', new Date());
    if (Number.isNaN(date.getTime())) continue;
    const dateFormatted = format(date, 'MMM d, yyyy');
    
    // Parse time: "11:00 ET" -> "11:00 AM ET"
    const timeMatch = timeET.match(/(\d{1,2}):(\d{2})\s*ET/);
    if (!timeMatch) continue;
    const time24 = `${timeMatch[1]}:${timeMatch[2]}`;
    const time12 = convert24To12Hour(time24);
    
    // Determine vs/at
    const prefix = hoa === 'H' ? 'vs' : hoa === 'A' ? 'at' : 'vs';
    
    // Build game line: "Oct 5, 2025 — at Cedevita Olimpija — 11:00 AM ET — TV: TBA"
    let gameLine = `${dateFormatted} — ${prefix} ${opponent} — ${time12} ET — TV: TBA`;
    if (venue && venue.trim()) {
      gameLine += ` (${venue})`;
    }
    
    gameLines.push(gameLine);
  }
  
  return [
    header,
    rankLine,
    '',
    ...gameLines,
    '',
    'Notes:',
    `- Games from ${comp} schedule.`,
    `- Source: ${url || 'Team website'}`,
    '',
  ].join('\n');
}

// Convert each prospect's schedule
for (const prospect of PROSPECTS) {
  const csvPath = path.join(PRO_SCHEDULES_DIR, prospect.filename);
  const outputPath = path.join(ROOT_DIR, prospect.filename);
  
  if (!fs.existsSync(csvPath)) {
    console.log(`CSV file not found: ${csvPath}`);
    continue;
  }
  
  try {
    const scheduleContent = convertCSVToSchedule(csvPath, prospect);
    fs.writeFileSync(outputPath, scheduleContent, 'utf-8');
    console.log(`Converted and wrote ${prospect.filename}`);
  } catch (err) {
    console.error(`Error converting ${prospect.filename}:`, err);
  }
}

console.log('Conversion complete!');







