# Step-by-Step: Finding Your API Endpoint

## Step 1: Click on "Documentation" 
In your left sidebar, click the **book icon** (📚) that says **"Documentation"**

This should take you to the API documentation page.

## Step 2: Look for "Getting Started" or "Quick Start"
Once in Documentation, look for:
- "Getting Started" section
- "Quick Start" guide  
- "API Reference"
- Example code snippets

## Step 3: Find the Base URL
In the documentation, you should see something like:

```
Base URL: https://v1.api-sport.io/basketball
```

OR example API calls like:
```
GET https://v1.api-sport.io/basketball/teams?search=Valencia
```

## Step 4: Alternative - Check "Technical Questions" in FAQ
1. Go to FAQ (you're already there)
2. Click **"Technical questions"** in the left sidebar
3. Look for questions about endpoints or URLs

## What to Look For
The endpoint will look something like:
- `https://v1.api-sport.io/basketball`
- `https://api.api-sport.io/basketball`
- `https://api-basketball.com/api`
- Or similar format

## Once You Find It
Copy the base URL and update your `.env.local`:
```bash
API_SPORTS_ENDPOINT=https://your-endpoint-here
API_SPORTS_BASKETBALL_KEY=137753bdboce20234730692c73
```

Then restart your dev server.






