import { NextResponse } from 'next/server';
import { fetchProspectScheduleFromApiBasketball } from '@/lib/loadSchedulesFromApiBasketball';
import type { TeamDirectoryEntry } from '@/lib/loadSchedules';

export async function GET() {
  console.log('\n🔵🔵🔵 CHECKING LNB GAMES FOR PARIS & ASVEL 🔵🔵🔵\n');
  
  try {
    // Create empty directory map for testing (team lookup will use API)
    const directory = new Map<string, TeamDirectoryEntry>();
    
    // Test Paris Basketball
    const parisProspect = {
      name: 'Mouhamed Faye',
      team: 'Paris Basket',
      teamDisplay: 'Paris Basketball',
    };
    
    console.log('🔵 Testing Paris Basketball...');
    const parisGames = await fetchProspectScheduleFromApiBasketball(
      parisProspect as any,
      'Paris Basketball',
      directory
    ) as any[];
    
    const parisLnbGames = parisGames.filter((g: any) => 
      g.league?.toLowerCase().includes('lnb') || 
      g.league?.toLowerCase().includes('pro a') ||
      g.league?.toLowerCase().includes('france')
    );
    
    console.log(`🔵 Paris: Total games = ${parisGames.length}, LNB games = ${parisLnbGames.length}`);
    
    // Test ASVEL
    const asvelProspect = {
      name: 'Adam Atamna',
      team: 'ASVEL',
      teamDisplay: 'ASVEL',
    };
    
    console.log('🔵 Testing ASVEL...');
    const asvelGames = await fetchProspectScheduleFromApiBasketball(
      asvelProspect as any,
      'ASVEL',
      directory
    ) as any[];
    
    const asvelLnbGames = asvelGames.filter((g: any) => 
      g.league?.toLowerCase().includes('lnb') || 
      g.league?.toLowerCase().includes('pro a') ||
      g.league?.toLowerCase().includes('france')
    );
    
    console.log(`🔵 ASVEL: Total games = ${asvelGames.length}, LNB games = ${asvelLnbGames.length}`);
    
    return NextResponse.json({
      success: true,
      paris: {
        totalGames: parisGames.length,
        lnbGames: parisLnbGames.length,
        sampleGames: parisGames.slice(0, 5).map((g: any) => ({
          date: g.date,
          opponent: g.opponent,
          league: g.league,
          home: g.home,
        })),
        lnbSampleGames: parisLnbGames.slice(0, 5).map((g: any) => ({
          date: g.date,
          opponent: g.opponent,
          league: g.league,
          home: g.home,
        })),
      },
      asvel: {
        totalGames: asvelGames.length,
        lnbGames: asvelLnbGames.length,
        sampleGames: asvelGames.slice(0, 5).map((g: any) => ({
          date: g.date,
          opponent: g.opponent,
          league: g.league,
          home: g.home,
        })),
        lnbSampleGames: asvelLnbGames.slice(0, 5).map((g: any) => ({
          date: g.date,
          opponent: g.opponent,
          league: g.league,
          home: g.home,
        })),
      },
    });
    
  } catch (error) {
    console.error('🔵❌ Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}





