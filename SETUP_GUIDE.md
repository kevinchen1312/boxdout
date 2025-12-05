# Social Features Setup Guide

This guide will help you set up the new Clerk OAuth and social features for the Prospect Game Planner.

## Features Added

✅ **Clerk Authentication** - OAuth-based user authentication  
✅ **Watched Games** - Mark games as watched with eye icon  
✅ **Game Notes** - Write notes with visibility controls (self/friends/groups/public)  
✅ **Friend System** - Send/accept friend requests and manage friendships  
✅ **Groups** - Create custom groups and add members  
✅ **Friend Activity** - See what friends have watched  
✅ **User Profiles** - View stats, manage friends and groups  

## Prerequisites

1. Node.js 18+ installed
2. A Clerk account (https://clerk.com)
3. A Supabase account (https://supabase.com)

## Step 1: Set up Clerk

1. **Create a Clerk Application:**
   - Go to https://dashboard.clerk.com
   - Click "Add application"
   - Choose your authentication methods (Email, Google, GitHub, etc.)
   - Copy your API keys

2. **Configure Clerk Webhook:**
   - In Clerk Dashboard, go to Webhooks
   - Add endpoint: `https://your-domain.com/api/webhooks/clerk`
   - Subscribe to events: `user.created`, `user.updated`, `user.deleted`
   - Copy the signing secret

## Step 2: Set up Supabase

1. **Create a Supabase Project:**
   - Go to https://supabase.com/dashboard
   - Create a new project
   - Wait for the database to initialize

2. **Run the Database Schema:**
   - Go to SQL Editor in Supabase Dashboard
   - Copy the contents of `lib/db/schema.sql`
   - Run the SQL script to create tables and RLS policies

3. **Copy API Keys:**
   - Go to Project Settings > API
   - Copy your Project URL and anon/public key
   - Copy your service_role key (keep this secret!)

## Step 3: Configure Environment Variables

Create a `.env.local` file in the root directory (or update your existing one):

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
```

**Important:** Never commit `.env.local` to version control!

## Step 4: Install Dependencies

Dependencies are already added to `package.json`. If you need to reinstall:

```bash
npm install
```

New packages added:
- `@clerk/nextjs` - Clerk authentication
- `@supabase/supabase-js` - Supabase client
- `svix` - Webhook verification

## Step 5: Update Middleware Configuration

The middleware is already configured in `middleware.ts`. If you need to add more protected routes, update the `isPublicRoute` matcher:

```typescript
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/rankings(.*)',
  '/your-new-route(.*)', // Add your routes here
]);
```

## Step 6: Run the Application

```bash
npm run dev
```

Visit http://localhost:3000

## Step 7: Test the Features

1. **Sign Up/Sign In:**
   - Click "Sign Up" in the header
   - Create an account with email or OAuth provider
   - You'll be automatically signed in

2. **Mark Games as Watched:**
   - Browse games in the calendar
   - Click the eye icon on any game
   - Icon turns blue when marked as watched

3. **Add Notes to Games:**
   - Click the compose (pencil) icon on any game
   - Write your note in the slide-out panel
   - Choose visibility (Only Me/Friends/Groups/Public)
   - Click Save

4. **Add Friends:**
   - Go to Profile page (click Profile in header)
   - Switch to "Friends" tab
   - Enter a friend's username and send request
   - They can accept from their Profile page

5. **Create Groups:**
   - Go to Profile page
   - Switch to "Groups" tab
   - Create a group and add members
   - Share notes with specific groups

6. **View Friend Activity:**
   - On the main page, expand "Friend Activity" section
   - See what games your friends have watched

## Database Schema Overview

### Tables Created:
- `users` - User profiles synced from Clerk
- `watched_games` - Games marked as watched by users
- `notes` - Game notes with visibility controls
- `friend_requests` - Pending/accepted/rejected friend requests
- `friends` - Active friendships
- `groups` - User-created groups
- `group_members` - Group membership records

### Row Level Security (RLS):
All tables have RLS policies that:
- Users can only modify their own data
- Friends can see each other's friend-visible content
- Group members can see group-visible content
- Public content is visible to everyone

## API Routes Added

### Authentication:
- `POST /api/webhooks/clerk` - Clerk webhook for user sync

### Watched Games:
- `POST /api/watched/toggle` - Toggle watched status
- `GET /api/watched/list` - Get user's watched games
- `GET /api/watched/friends` - Get friends' watched games

### Notes:
- `POST /api/notes/create` - Create/update note
- `GET /api/notes/get?gameId={id}` - Get notes for a game
- `DELETE /api/notes/delete?noteId={id}` - Delete note

### Friends:
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/accept` - Accept friend request
- `POST /api/friends/reject` - Reject friend request
- `DELETE /api/friends/remove?friendId={id}` - Remove friend
- `GET /api/friends/list` - List friends and requests

### Groups:
- `POST /api/groups/create` - Create group
- `GET /api/groups/list` - List user's groups
- `DELETE /api/groups/delete?groupId={id}` - Delete group
- `POST /api/groups/members/add` - Add group member
- `DELETE /api/groups/members/remove?groupId={id}&memberId={id}` - Remove member
- `GET /api/groups/members/list?groupId={id}` - List group members

## Troubleshooting

### Clerk Webhook Not Working
- Verify webhook URL is correct and accessible
- Check webhook signing secret matches
- Look for errors in Clerk Dashboard > Webhooks > Logs

### Users Not Created in Supabase
- Check webhook is receiving events
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check Supabase logs for errors

### RLS Policies Blocking Queries
- Make sure users are authenticated with Clerk
- Verify JWT is being passed to Supabase
- Check RLS policies allow the operation

### Notes Not Visible to Friends
- Confirm users are actually friends (check `friends` table)
- Verify note visibility is set to "friends"
- Check RLS policies for notes table

## Security Best Practices

1. **Never expose service role key** - Only use in server-side API routes
2. **Always use RLS** - Database security is enforced at the database level
3. **Validate webhook signatures** - Prevents unauthorized user creation
4. **Use HTTPS in production** - Required for Clerk webhooks
5. **Rotate keys regularly** - Update API keys periodically

## Support

For issues:
- Clerk: https://clerk.com/docs
- Supabase: https://supabase.com/docs
- Next.js: https://nextjs.org/docs

## Next Steps

Consider adding:
- Email notifications for friend requests
- Real-time updates with Supabase subscriptions
- Comment threads on notes
- Direct messaging between friends
- Activity feeds
- User avatars and bios
- Search for users by username/email
- Block/report functionality






