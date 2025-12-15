import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/admin/fix-team-names
 * Fix common team name mismatches
 */
export async function POST() {
  const apiKey = process.env.API_BASKETBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  // Common team name corrections
  const corrections = [
    { wrong: 'Lyon-Villeurbanne', correct: 'ASVEL' },
    { wrong: 'Chalon/Saone', correct: 'Chalon' },
    { wrong: 'Partizan Mozzart Bet', correct: 'Partizan' },
  ];

  const results = [];

  try {
    for (const { wrong, correct } of corrections) {
      console.log(`\n[fix-team-names] Searching API for: ${correct}`);

      // Search API
      const searchUrl = `https://v1.basketball.api-sports.io/teams?search=${encodeURIComponent(correct)}`;
      const response = await fetch(searchUrl, {
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        results.push({ wrong, correct, error: `API error: ${response.status}` });
        continue;
      }

      const data = await response.json();
      const teams = data.response || [];

      if (teams.length === 0) {
        results.push({ wrong, correct, error: 'No teams found' });
        continue;
      }

      // Find best match (prioritize European leagues)
      const europeanTeam = teams.find((t: any) => 
        t.country?.name === 'France' || 
        t.country?.name === 'Serbia' ||
        t.country?.name === 'Spain' ||
        t.name.toLowerCase().includes(correct.toLowerCase())
      );

      const bestMatch = europeanTeam || teams[0];

      console.log(`[fix-team-names] Found: ${bestMatch.name} (ID: ${bestMatch.id}, Country: ${bestMatch.country?.name})`);

      // Update all prospects with this wrong name
      const { data: updated, error } = await supabaseAdmin
        .from('prospects')
        .update({
          team_name: bestMatch.name,
          team_id: bestMatch.id,
        })
        .eq('team_name', wrong)
        .select();

      if (error) {
        results.push({ wrong, correct, error: error.message });
      } else {
        results.push({
          wrong,
          correct,
          foundTeam: bestMatch.name,
          teamId: bestMatch.id,
          country: bestMatch.country?.name,
          logo: bestMatch.logo,
          prospectsUpdated: updated?.length || 0,
          prospects: (updated || []).map(p => p.full_name),
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      nextStep: 'Now run POST /api/admin/fix-all-international to fetch games',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}





