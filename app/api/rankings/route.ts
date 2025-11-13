import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { loadProspects, clearProspectCache } from '@/lib/loadProspects';
import { clearScheduleCache } from '@/lib/loadSchedules';

const MY_BOARD_PATH = join(process.cwd(), 'my_board_2026.txt');
const ESPN_BOARD_PATH = join(process.cwd(), 'top_100_espn_2026_big_board.txt');

// GET /api/rankings - Retrieve current myBoard rankings
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get('source') || 'myboard';
    
    if (source !== 'espn' && source !== 'myboard') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "espn" or "myboard"' },
        { status: 400 }
      );
    }
    
    const prospects = loadProspects(source as 'espn' | 'myboard');
    
    return NextResponse.json({ 
      prospects,
      source 
    });
  } catch (error) {
    console.error('Error loading rankings:', error);
    return NextResponse.json(
      { error: 'Failed to load rankings' },
      { status: 500 }
    );
  }
}

// POST /api/rankings - Save updated myBoard rankings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prospects, resetToESPN } = body;
    
    // If resetToESPN is true, copy ESPN rankings to myBoard
    if (resetToESPN === true) {
      const espnContent = readFileSync(ESPN_BOARD_PATH, 'utf-8');
      const tempPath = MY_BOARD_PATH + '.tmp';
      writeFileSync(tempPath, espnContent, 'utf-8');
      renameSync(tempPath, MY_BOARD_PATH);
      
      // Clear caches
      clearProspectCache('myboard');
      clearScheduleCache('myboard');
      
      return NextResponse.json({ 
        success: true,
        message: 'Rankings reset to ESPN rankings'
      });
    }
    
    // Validate prospects array
    if (!Array.isArray(prospects)) {
      return NextResponse.json(
        { error: 'Invalid format: prospects must be an array' },
        { status: 400 }
      );
    }
    
    if (prospects.length !== 100) {
      return NextResponse.json(
        { error: `Invalid format: Expected 100 prospects, got ${prospects.length}` },
        { status: 400 }
      );
    }
    
    // Validate each prospect has required fields
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      if (!prospect.name || !prospect.position || !prospect.team) {
        return NextResponse.json(
          { error: `Invalid prospect at index ${i}: missing required fields` },
          { status: 400 }
        );
      }
    }
    
    // Generate file content
    const lines: string[] = [];
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      const rank = String(i + 1).padStart(2, '0');
      lines.push(`${rank}. ${prospect.name} - ${prospect.position}, ${prospect.team}`);
    }
    
    const content = lines.join('\n') + '\n';
    
    // Write atomically (temp file -> rename)
    const tempPath = MY_BOARD_PATH + '.tmp';
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, MY_BOARD_PATH);
    
    // Clear caches to force reload with new rankings
    clearProspectCache('myboard');
    clearScheduleCache('myboard');
    
    return NextResponse.json({ 
      success: true,
      message: 'Rankings saved successfully'
    });
  } catch (error) {
    console.error('Error saving rankings:', error);
    return NextResponse.json(
      { error: 'Failed to save rankings' },
      { status: 500 }
    );
  }
}

