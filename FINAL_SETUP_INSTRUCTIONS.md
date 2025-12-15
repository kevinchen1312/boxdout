# Final Setup Instructions

## ✅ Found the Correct Endpoint!

From the documentation you found:
- **Endpoint:** `https://v1.basketball.api-sports.io`
- **Header:** `x-apisports-key`

## Next Steps:

1. **Update your `.env.local` file:**
   ```bash
   API_SPORTS_BASKETBALL_KEY=137753bdboce20234730692c73
   ```
   
   Make sure this matches the API key shown in your dashboard under "My Access".

2. **Restart your dev server:**
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

3. **The code is now updated** to use:
   - Endpoint: `https://v1.basketball.api-sports.io`
   - Header: `x-apisports-key`
   - Your API key from `.env.local`

## If It Still Doesn't Work:

The API might be expecting the key in a different format. Check the documentation page you're on:
- Look for "Authentication" section
- Check if there are example code snippets showing how to use the API key
- See if it shows the exact header format or if the key goes in the URL

Once you restart the server, the international games should start appearing!






