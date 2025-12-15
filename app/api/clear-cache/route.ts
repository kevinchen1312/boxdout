import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { clearScheduleCache } from '@/lib/loadSchedules';

// Simple endpoint to clear all caches
export async function POST() {
  try {
    // Clear in-memory cache
    clearScheduleCache();
    
    // Clear Supabase cache
    const { error } = await supabaseAdmin
      .from('game_cache')
      .delete()
      .like('cache_key', '%games%');
    
    if (error) {
      console.error('[Clear Cache] Supabase error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'All caches cleared successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Clear Cache] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Also support GET for testing
export async function GET() {
  return POST();
}






