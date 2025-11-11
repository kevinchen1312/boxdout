# 2026 NBA Draft Prospects Calendar

A Next.js web application that displays a calendar showing college basketball games featuring top 2026 NBA draft prospects. The app automatically fetches game schedules from ESPN's API and highlights games with top prospects.

## Features

- 📅 **Interactive Calendar View**: Browse games by month with an intuitive calendar interface
- 🏀 **Prospect Tracking**: See which top 100 prospects are playing in each game
- 🔄 **Auto-Refresh**: Game data updates automatically every 5 minutes
- 💡 **Hover Details**: Hover over games to see prospect names, rankings, and positions
- 📱 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- ⚡ **Fast Performance**: Built with Next.js for optimal loading and navigation

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Data Source**: ESPN Hidden API for college basketball schedules
- **Date Handling**: date-fns
- **HTTP Client**: axios

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd prospectcal
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
prospectcal/
├── app/
│   ├── api/
│   │   └── games/
│   │       ├── route.ts          # API route for single date
│   │       └── range/
│   │           └── route.ts      # API route for date range
│   ├── components/
│   │   ├── Calendar.tsx          # Main calendar component
│   │   ├── GameCard.tsx          # Game display component
│   │   └── LoadingSkeleton.tsx   # Loading state component
│   ├── data/
│   │   └── prospects.ts          # Top 100 prospects data
│   ├── hooks/
│   │   └── useGames.ts           # Custom hook for game data
│   ├── utils/
│   │   └── gameMatching.ts       # Logic to match games with prospects
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## How It Works

1. **Data Fetching**: The app fetches college basketball game schedules from ESPN's API
2. **Prospect Matching**: Games are cross-referenced with the top 100 prospects list
3. **Calendar Display**: Only games featuring prospects are displayed on the calendar
4. **Interactive Details**: Hover over games to see which prospects are playing
5. **Auto-Update**: Data refreshes every 5 minutes to stay current

## API Routes

### GET /api/games
Fetch games for a specific date.

**Query Parameters**:
- `date`: Date in YYYYMMDD format (optional, defaults to today)

**Response**:
```json
{
  "games": [...],
  "date": "20241110"
}
```

### GET /api/games/range
Fetch games for a date range.

**Query Parameters**:
- `startDate`: Start date in YYYY-MM-DD format (required)
- `endDate`: End date in YYYY-MM-DD format (required)

**Response**:
```json
{
  "games": {
    "2024-11-10": [...],
    "2024-11-11": [...]
  }
}
```

## Customization

### Update Prospects List
Edit `app/data/prospects.ts` to modify the prospects list or add new prospects.

### Adjust Auto-Refresh Interval
In `app/page.tsx`, change the interval value (currently set to 5 minutes):
```typescript
const interval = setInterval(() => {
  // ...
}, 5 * 60 * 1000); // Change this value
```

### Styling
Modify `app/globals.css` and Tailwind classes in components to customize the appearance.

## Production Build

To create a production build:

```bash
npm run build
npm start
```

## Deployment

This app can be deployed to any platform that supports Next.js:

- **Vercel** (recommended): `vercel deploy`
- **Netlify**: Connect your repository
- **Docker**: Use the included Dockerfile (if created)

## Data Sources

- **Prospect Rankings**: ESPN's 2026 NBA Draft Big Board
- **Game Schedules**: ESPN's hidden API endpoints
  - Scoreboard: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- ESPN for providing the prospect rankings and game data
- Next.js team for the excellent framework
- College basketball community for prospect information
