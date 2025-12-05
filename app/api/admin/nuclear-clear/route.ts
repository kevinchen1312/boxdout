import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { clearScheduleCache, forceCacheInvalidation } from '@/lib/loadSchedules';
import { clearProspectCache } from '@/lib/loadProspects';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Clear ALL caches
    clearScheduleCache('espn');
    clearScheduleCache('myboard');
    clearProspectCache('espn');
    clearProspectCache('myboard');
    forceCacheInvalidation();
    
    console.log('[nuclear-clear] ☢️ ALL CACHES CLEARED');

    return NextResponse.json({
      success: true,
      message: 'All caches cleared! Now refresh the Adiguzel page.',
    });
  } catch (error) {
    console.error('[nuclear-clear] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to clear caches',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return new NextResponse(`
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h1>☢️ Nuclear Cache Clear</h1>
        <p>This will clear ALL caches (schedules, prospects, etc.)</p>
        <button onclick="clearCaches()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
          ☢️ CLEAR ALL CACHES
        </button>
        <div id="result" style="margin-top: 20px;"></div>
        <script>
          async function clearCaches() {
            document.getElementById('result').innerHTML = 'Clearing...';
            const response = await fetch('/api/admin/nuclear-clear', {method: 'POST'});
            const data = await response.json();
            document.getElementById('result').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
          }
        </script>
      </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html',
    }
  });
}

