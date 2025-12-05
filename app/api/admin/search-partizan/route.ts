import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.API_BASKETBALL_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Search for Partizan teams
    const searchUrl = `https://v1.basketball.api-sports.io/teams?search=Partizan`;
    const response = await fetch(searchUrl, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      count: data.response?.length || 0,
      teams: (data.response || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        country: t.country?.name,
        logo: t.logo,
      })),
      raw: data,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}




