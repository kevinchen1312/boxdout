import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId, content, visibility, groupId, gameMetadata } = await req.json();

    if (!gameId || !content) {
      return NextResponse.json({ error: 'Missing gameId or content' }, { status: 400 });
    }

    // Filter prospects to only include those mentioned in the note content
    let finalContent = content;
    if (gameMetadata && gameMetadata.prospects && gameMetadata.prospects.length > 0) {
      const contentLower = content.toLowerCase();
      
      // Common suffixes to ignore when finding last name
      const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'];
      
      // Handle both old format (string[]) and new format ({name, team}[])
      const prospects = gameMetadata.prospects.map((p: string | { name: string; team: string }) => 
        typeof p === 'string' ? { name: p, team: '' } : p
      );
      
      // Only include prospects whose names appear in the note content
      const mentionedProspects = prospects.filter((player: { name: string; team: string }) => {
        const nameLower = player.name.toLowerCase();
        // Check for full name, last name, or first name match
        const nameParts = nameLower.split(' ').filter(part => !suffixes.includes(part));
        const lastName = nameParts[nameParts.length - 1] || '';
        const firstName = nameParts[0] || '';
        
        // Also check middle parts of the name (for cases like "Patrick Ngongba II")
        const middleParts = nameParts.slice(1, -1);
        const matchesMiddle = middleParts.some(part => part.length > 2 && contentLower.includes(part));
        
        return contentLower.includes(nameLower) || 
               (lastName.length > 2 && contentLower.includes(lastName)) ||
               (firstName.length > 2 && contentLower.includes(firstName)) ||
               matchesMiddle;
      });
      
      if (mentionedProspects.length > 0) {
        // Store as array of {name, team} objects
        const metadataTag = `\n<!--PROSPECTS:${JSON.stringify(mentionedProspects)}-->`;
        finalContent = content + metadataTag;
      }
    }

    // Validate visibility
    const validVisibility = ['self', 'friends', 'group', 'public'];
    if (visibility && !validVisibility.includes(visibility)) {
      return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 });
    }

    // Get user's Supabase ID
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prepare base note data
    const baseNoteData = {
      user_id: userData.id,
      game_id: gameId,
      content: finalContent,
      visibility: visibility || 'self',
      group_id: groupId || null,
    };

    // Simply insert without game_metadata since the column doesn't exist yet
    // When you add the column to your database, you can update this to include gameMetadata
    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert(baseNoteData)
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    return NextResponse.json({ note: data });
  } catch (error) {
    console.error('Error creating/updating note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

