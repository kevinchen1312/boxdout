import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/update-pokusevski
 * Manually update Pokusevski with correct team ID
 */
export async function GET() {
  try {
    // Update Pokusevski with Partizan team ID
    const { data, error } = await supabaseAdmin
      .from('prospects')
      .update({
        team_id: 40,  // Partizan Mozzart Bet
        team_name: 'Partizan Mozzart Bet',
      })
      .ilike('full_name', '%pokusevski%')
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: data?.length || 0,
      prospects: data,
      message: 'Updated! Now click the fix button again at /api/admin/fix-pokusevski-complete',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}




