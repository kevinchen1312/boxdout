import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  
  if (!query || query.length < 2) {
    return NextResponse.json({ prospects: [] });
  }
  
  try {
    // Search for prospects by name in the prospects table
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('name, team_name, team_id, source, league')
      .ilike('name', `%${query}%`)
      .limit(10);
    
    if (error) {
      console.error('[API/prospects/search] Error:', error);
      return NextResponse.json({ error: 'Failed to search prospects' }, { status: 500 });
    }
    
    // Map to expected format
    const mappedProspects = (prospects || []).map(p => ({
      name: p.name,
      team: p.team_name,
      teamDisplay: p.team_name,
      teamId: p.team_id,
      source: p.source,
      league: p.league,
    }));
    
    return NextResponse.json({ prospects: mappedProspects });
  } catch (err) {
    console.error('[API/prospects/search] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

