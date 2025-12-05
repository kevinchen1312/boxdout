import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createProfile() {
  const clerkUserId = 'user_35RaTH4KLKMRLZo7gV3kPMNS4Ut';
  
  console.log(`Creating profile for Clerk user: ${clerkUserId}\n`);

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle();

  if (existing) {
    console.log('✅ Profile already exists:');
    console.log(`   ID: ${existing.id}`);
    console.log(`   Email: ${existing.email || 'N/A'}`);
    return;
  }

  // Create new profile
  console.log('Creating new profile...');
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      clerk_user_id: clerkUserId,
      email: 'user@prospectcal.com', // Placeholder
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating profile:', error);
    process.exit(1);
  }

  console.log('✅ Profile created successfully!');
  console.log(`   ID: ${newProfile.id}`);
  console.log(`   Clerk User ID: ${newProfile.clerk_user_id}`);
  
  console.log('\n🎉 Now refresh your calendar page and Hoshikawa\'s games should appear!');
}

createProfile().catch(console.error);




