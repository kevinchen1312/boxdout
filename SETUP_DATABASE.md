# Database Setup Instructions

If you're seeing 500 errors for custom players or other features, you likely need to set up the database tables.

## Quick Setup

Run the SQL schema in your Supabase project:

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy and paste the contents of `lib/db/schema.sql`
5. Run the query

This will create all necessary tables:
- `users` - User profiles linked to Clerk
- `custom_players` - User-added custom players
- `custom_player_games` - Games for custom players
- `prospects` - Shared prospect data from ESPN/external sources
- `user_rankings` - User's personal rankings
- `watched_games` - Games marked as watched
- `notes` - Game notes
- `friends` / `friend_requests` - Social features
- `groups` / `group_members` - Group features

## Alternative: Run Schema File Directly

If you have the Supabase CLI installed:

```bash
supabase db push
```

Or use the Supabase API:

```bash
psql -h <your-supabase-host> -U postgres -d postgres -f lib/db/schema.sql
```

## Troubleshooting

### Error: "relation does not exist"
This means a table hasn't been created. Run the schema.sql file.

### Error: "permission denied"
Make sure you're using the `service_role` key (not the `anon` key) in your `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Custom Players Not Loading
1. Check that the `custom_players` table exists in your database
2. Verify your Supabase connection is working
3. Check browser console for specific error messages





