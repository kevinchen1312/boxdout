import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env');
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', {
      status: 400,
    });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const { id, email_addresses, username } = evt.data;

    try {
      // Insert user into Supabase
      const { error } = await supabaseAdmin.from('users').insert({
        clerk_user_id: id,
        email: email_addresses[0]?.email_address || '',
        username: username || null,
      });

      if (error) {
        console.error('Error creating user in Supabase:', error);
        return new Response('Error creating user in database', { status: 500 });
      }

      console.log('User created in Supabase:', id);
    } catch (error) {
      console.error('Error processing user.created webhook:', error);
      return new Response('Error processing webhook', { status: 500 });
    }
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, username } = evt.data;

    try {
      // Update user in Supabase
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          email: email_addresses[0]?.email_address || '',
          username: username || null,
        })
        .eq('clerk_user_id', id);

      if (error) {
        console.error('Error updating user in Supabase:', error);
        return new Response('Error updating user in database', { status: 500 });
      }

      console.log('User updated in Supabase:', id);
    } catch (error) {
      console.error('Error processing user.updated webhook:', error);
      return new Response('Error processing webhook', { status: 500 });
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;

    try {
      // Delete user from Supabase (cascade will handle related records)
      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('clerk_user_id', id);

      if (error) {
        console.error('Error deleting user from Supabase:', error);
        return new Response('Error deleting user from database', { status: 500 });
      }

      console.log('User deleted from Supabase:', id);
    } catch (error) {
      console.error('Error processing user.deleted webhook:', error);
      return new Response('Error processing webhook', { status: 500 });
    }
  }

  return new Response('', { status: 200 });
}







