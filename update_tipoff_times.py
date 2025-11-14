#!/usr/bin/env python3
"""
Update tipoff times in schedule files by fetching from official sources.
Only updates the time portion, preserving dates, opponents, and formatting.
"""

import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup
from fuzzywuzzy import fuzz
import time
import json

try:
    from playwright.sync_api import sync_playwright, Page, TimeoutError as PlaywrightTimeout
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("[WARN] Playwright not available. Install with: pip install playwright && playwright install chromium")

# Team mappings
TEAM_CONFIG = {
    'adam_atamna_schedule.txt': {
        'team_name': 'ASVEL',
        'team_display': 'ASVEL Basket',
        'timezone': 'Europe/Paris',
        'leagues': ['EuroLeague', 'LNB Pro A'],
        'club_url': 'https://www.ldlc-asvel.com',
        'euroleague_slug': 'asvel',
        'realgm_url': 'https://basketball.realgm.com/international/league/2/Eurocup/team/89/ASVEL-Basket/schedule',
    },
    'mouhamed_faye_schedule.txt': {
        'team_name': 'Paris Basketball',
        'team_display': 'Paris Basketball',
        'timezone': 'Europe/Paris',
        'leagues': ['EuroLeague', 'LNB Pro A'],
        'club_url': 'https://www.parisbasketball.paris',
        'euroleague_slug': 'paris-basketball',
        'realgm_url': 'https://basketball.realgm.com/international/league/1/Euroleague/team/2058/Paris-Basketball/schedule',
    },
    'sergio_de_larrea_schedule.txt': {
        'team_name': 'Valencia Basket',
        'team_display': 'Valencia Basket',
        'timezone': 'Europe/Madrid',
        'leagues': ['EuroLeague', 'Liga ACB'],
        'club_url': 'https://www.valenciabasket.com',
        'euroleague_slug': 'valencia',
        'realgm_url': 'https://basketball.realgm.com/international/league/1/Euroleague/team/56/Valencia-Basket/schedule/2026',
    },
    'michael_ruzic_schedule.txt': {
        'team_name': 'Joventut Badalona',
        'team_display': 'Joventut Badalona',
        'timezone': 'Europe/Madrid',
        'leagues': ['EuroCup', 'Liga ACB'],
        'club_url': 'https://www.penya.com',
        'eurocup_slug': 'joventut-badalona',
        'realgm_url': 'https://basketball.realgm.com/international/league/2/Eurocup/team/16/Joventut-Badalona/schedule',
    },
}

# League URLs
EUROLEAGUE_BASE = 'https://www.euroleaguebasketball.net'
EUROCUP_BASE = 'https://www.euroleaguebasketball.net/eurocup'
ACB_BASE = 'https://www.acb.com'
LNB_BASE = 'https://www.lnb.fr'

ET_TIMEZONE = ZoneInfo('America/New_York')

# Common headers for requests
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}


@dataclass
class Game:
    """Represents a game from the schedule file."""
    original_line: str
    date: datetime
    opponent: str
    is_home: bool  # True for "vs", False for "@"
    league: str
    existing_time: Optional[str] = None
    line_number: int = 0


@dataclass
class OfficialGame:
    """Represents a game from an official source."""
    date: datetime
    opponent: str
    is_home: bool
    local_time: datetime
    league: str


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse various date formats from schedule files."""
    formats = [
        '%b %d, %Y',  # Oct 1, 2025
        '%Y-%m-%d',   # 2025-10-01
        '%d %b %Y',   # 1 Oct 2025
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    
    return None


def parse_time(time_str: str) -> Optional[datetime.time]:
    """Parse time string in various formats."""
    # Remove common suffixes
    time_str = re.sub(r'\s*(ET|CET|CEST|local).*$', '', time_str, flags=re.IGNORECASE)
    time_str = time_str.strip()
    
    formats = [
        '%H:%M',      # 20:45
        '%I:%M %p',   # 8:45 PM
        '%H:%M:%S',   # 20:45:00
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt).time()
        except ValueError:
            continue
    
    return None


def extract_game_info(line: str, league: str) -> Optional[Game]:
    """Extract game information from a schedule line."""
    line = line.strip()
    
    # Skip empty lines, headers, and completed games (those with scores)
    if not line or line.startswith('#') or '(W ' in line or '(L ' in line:
        return None
    
    # Match patterns like:
    # "Oct 1, 2025 - vs Valencia Basket @ Astroballe"
    # "Nov 13, 2025 - vs Valencia Basket @ Halle Georges Carpentier Arena, 2:45 PM ET"
    
    # Try to extract date
    date_match = re.search(r'([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})', line)
    if not date_match:
        return None
    
    date_str = date_match.group(1)
    date = parse_date(date_str)
    if not date:
        return None
    
    # Extract home/away and opponent
    is_home = 'vs ' in line or ' vs ' in line
    is_away = '@ ' in line and not line.strip().startswith('@')
    
    if not (is_home or is_away):
        return None
    
    # Extract opponent name (between "vs"/"@" and "@" or end of line or comma)
    if is_home:
        opp_match = re.search(r'vs\s+([^@]+?)(?:@|,|$)', line)
    else:
        # For away games, opponent comes after the first @
        opp_match = re.search(r'@\s+([^@]+?)(?:@|,|$)', line)
    
    if not opp_match:
        return None
    
    opponent = opp_match.group(1).strip()
    
    # Extract existing time if present
    time_match = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*ET)', line, re.IGNORECASE)
    existing_time = time_match.group(1) if time_match else None
    
    return Game(
        original_line=line,
        date=date,
        opponent=opponent,
        is_home=is_home,
        league=league,
        existing_time=existing_time
    )


def normalize_team_name(name: str) -> str:
    """Normalize team name for matching."""
    # Remove common suffixes and normalize
    name = name.replace(' Basket', '').replace(' Basketball', '').replace(' Beko', '')
    name = name.replace(' FOX', '').replace(' SAD', '').replace(' Basket', '')
    name = name.replace(' AX Armani Exchange', ' Armani').replace(' AX', '')
    name = name.replace(' KK ', '').replace(' CB ', '')
    name = name.strip()
    return name.lower()


def fuzzy_match_teams(name1: str, name2: str, threshold: int = 80) -> bool:
    """Check if two team names match using fuzzy matching."""
    norm1 = normalize_team_name(name1)
    norm2 = normalize_team_name(name2)
    
    # Exact match after normalization
    if norm1 == norm2:
        return True
    
    # Fuzzy match
    ratio = fuzz.ratio(norm1, norm2)
    partial_ratio = fuzz.partial_ratio(norm1, norm2)
    
    return ratio >= threshold or partial_ratio >= 85


def fetch_realgm_schedule(realgm_url: str, team_tz: str, team_name: str, league: str) -> List[OfficialGame]:
    """Fetch schedule from RealGM (fallback aggregator)."""
    games = []
    
    if not realgm_url:
        return games
    
    try:
        response = requests.get(realgm_url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'lxml')
        
        # RealGM typically uses tables for schedules
        # Look for schedule table
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:  # Skip header
                cells = row.find_all(['td', 'th'])
                if len(cells) < 4:
                    continue
                
                # Try to extract date, time, opponent
                date_text = cells[0].get_text(strip=True) if len(cells) > 0 else ''
                time_text = cells[1].get_text(strip=True) if len(cells) > 1 else ''
                opp_text = cells[2].get_text(strip=True) if len(cells) > 2 else ''
                hoa_text = row.get_text()
                
                # Parse date (RealGM format varies)
                date_match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', date_text)
                if not date_match:
                    continue
                
                month, day, year = date_match.groups()
                try:
                    game_date = datetime(int(year), int(month), int(day))
                except ValueError:
                    continue
                
                # Parse time
                time_obj = parse_time(time_text)
                if not time_obj:
                    continue
                
                # Combine date and time
                local_dt = datetime.combine(game_date.date(), time_obj)
                
                # Determine home/away
                is_home = 'vs' in hoa_text.lower() or 'home' in hoa_text.lower()
                
                # Normalize opponent name
                opponent = opp_text.strip()
                
                games.append(OfficialGame(
                    date=game_date,
                    opponent=opponent,
                    is_home=is_home,
                    local_time=local_dt,
                    league=league
                ))
        
        if games:
            print(f"  [INFO] Found {len(games)} games from RealGM")
        
    except Exception as e:
        print(f"  [WARN] Failed to fetch RealGM schedule: {e}")
    
    return games


def fetch_euroleague_schedule_playwright(page: Page, team_slug: str, team_tz: str, team_name: str) -> List[OfficialGame]:
    """Fetch EuroLeague schedule using Playwright."""
    games = []
    
    if not PLAYWRIGHT_AVAILABLE:
        return games
    
    try:
        url = f'{EUROLEAGUE_BASE}/euroleague/teams/{team_slug}/schedule'
        page.goto(url, wait_until='load', timeout=60000)
        page.wait_for_timeout(5000)  # Wait for JS to render
        
        # Try multiple selectors (based on TypeScript code)
        selectors = [
            'table tbody tr',
            '.schedule-row',
            '[data-game]',
            '.game-card',
            '.match-item',
        ]
        
        for selector in selectors:
            try:
                elements = page.query_selector_all(selector)
                if elements:
                    print(f"  [INFO] Found {len(elements)} elements with selector: {selector}")
                    # Parse elements (implementation depends on actual HTML)
                    # For now, return empty - needs site-specific parsing
                    break
            except:
                continue
        
    except Exception as e:
        print(f"  [WARN] Failed to fetch EuroLeague schedule with Playwright: {e}")
    
    return games


def fetch_acb_schedule_web(team_name: str, team_tz: str, playwright_page: Optional[Page] = None) -> List[OfficialGame]:
    """Fetch Liga ACB schedule from web page."""
    games = []
    
    # ACB team IDs mapping
    ACB_TEAM_IDS = {
        'Valencia Basket': 13,
        'Joventut Badalona': 8,
    }
    
    team_id = ACB_TEAM_IDS.get(team_name)
    if not team_id:
        print(f"  [WARN] No ACB team ID found for {team_name}")
        return games
    
    try:
        # Try team-specific schedule page
        url = f'{ACB_BASE}/club/calendario/id/{team_id}'
        
        if playwright_page:
            print(f"  [INFO] Fetching ACB schedule with Playwright: {url}")
            playwright_page.goto(url, wait_until='networkidle', timeout=30000)
            playwright_page.wait_for_timeout(3000)
            html = playwright_page.content()
            soup = BeautifulSoup(html, 'lxml')
        else:
            print(f"  [INFO] Fetching ACB schedule with requests: {url}")
            response = requests.get(url, headers=HEADERS, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'lxml')
        
        print(f"  [DEBUG] Page title: {soup.title.string if soup.title else 'No title'}")
        
        # Look for schedule table or game cards
        # Common patterns: table with schedule rows, or divs with game info
        schedule_tables = soup.find_all('table', class_=re.compile(r'schedule|calendario|partido', re.I))
        
        if not schedule_tables:
            # Try finding any table with multiple rows
            all_tables = soup.find_all('table')
            for table in all_tables:
                rows = table.find_all('tr')
                if len(rows) > 5:  # Likely a schedule table
                    schedule_tables = [table]
                    break
        
        for table in schedule_tables:
            rows = table.find_all('tr')
            for row in rows[1:]:  # Skip header
                cells = row.find_all(['td', 'th'])
                if len(cells) < 3:
                    continue
                
                # Extract date, time, opponent from cells
                row_text = ' '.join([c.get_text(strip=True) for c in cells])
                
                # Try to find date (various formats)
                date_match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', row_text)
                if not date_match:
                    # Try Spanish date format
                    date_match = re.search(r'(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)', row_text, re.I)
                
                if not date_match:
                    continue
                
                # Parse date
                try:
                    if len(date_match.groups()) == 3:
                        if date_match.group(3).isdigit():
                            # DD/MM/YYYY or DD-MM-YYYY
                            day, month, year = date_match.groups()
                            game_date = datetime(int(year), int(month), int(day))
                        else:
                            # Spanish format - skip for now
                            continue
                    else:
                        continue
                except ValueError:
                    continue
                
                # Extract time
                time_match = re.search(r'(\d{1,2}):(\d{2})', row_text)
                if not time_match:
                    continue
                
                hour, minute = time_match.groups()
                try:
                    time_obj = datetime.strptime(f'{hour}:{minute}', '%H:%M').time()
                except:
                    continue
                
                # Combine date and time
                local_dt = datetime.combine(game_date.date(), time_obj)
                
                # Extract opponent (usually in a cell with team name)
                opponent = ''
                for cell in cells:
                    cell_text = cell.get_text(strip=True)
                    # Skip date/time cells
                    if re.search(r'\d{1,2}[:/]\d', cell_text):
                        continue
                    # Look for team-like text (capitalized, multiple words)
                    if re.search(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+', cell_text):
                        opponent = cell_text
                        break
                
                if not opponent:
                    continue
                
                # Determine home/away
                is_home = 'vs' in row_text.lower() or 'casa' in row_text.lower() or team_name.lower() in row_text.lower()
                
                games.append(OfficialGame(
                    date=game_date,
                    opponent=opponent,
                    is_home=is_home,
                    local_time=local_dt,
                    league='Liga ACB'
                ))
        
        if games:
            print(f"  [INFO] Found {len(games)} ACB games")
        
    except Exception as e:
        print(f"  [WARN] Failed to fetch ACB schedule: {e}")
        import traceback
        traceback.print_exc()
    
    return games


def fetch_lnb_schedule_web(team_name: str, team_tz: str, playwright_page: Optional[Page] = None) -> List[OfficialGame]:
    """Fetch LNB Pro A schedule from web page."""
    games = []
    
    # LNB team slugs mapping
    LNB_TEAM_SLUGS = {
        'ASVEL': 'ldlc-asvel',
        'Paris Basketball': 'paris-basketball',
    }
    
    team_slug = LNB_TEAM_SLUGS.get(team_name)
    if not team_slug:
        print(f"  [WARN] No LNB team slug found for {team_name}")
        return games
    
    try:
        # Try team-specific schedule page
        url = f'{LNB_BASE}/fr/equipe/{team_slug}/calendrier'
        
        if playwright_page:
            playwright_page.goto(url, wait_until='networkidle', timeout=30000)
            playwright_page.wait_for_timeout(3000)
            html = playwright_page.content()
            soup = BeautifulSoup(html, 'lxml')
        else:
            response = requests.get(url, headers=HEADERS, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'lxml')
        
        # Look for schedule elements
        # Common patterns: table rows, divs with game/match classes
        schedule_elements = (
            soup.find_all('tr', class_=re.compile(r'match|game|rencontre', re.I)) +
            soup.find_all('div', class_=re.compile(r'match|game|rencontre', re.I)) +
            soup.find_all('article', class_=re.compile(r'match|game|rencontre', re.I))
        )
        
        if not schedule_elements:
            # Fallback: look for any table
            tables = soup.find_all('table')
            for table in tables:
                schedule_elements = table.find_all('tr')
                if len(schedule_elements) > 5:
                    break
        
        for elem in schedule_elements:
            elem_text = elem.get_text(separator=' ', strip=True)
            
            # Extract date
            date_match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', elem_text)
            if not date_match:
                # Try French date format
                date_match = re.search(r'(\d{1,2})\s+(jan|fév|mar|avr|mai|jun|jui|aoû|sep|oct|nov|déc)', elem_text, re.I)
            
            if not date_match:
                continue
            
            # Parse date
            try:
                if len(date_match.groups()) == 3:
                    if date_match.group(3).isdigit():
                        day, month, year = date_match.groups()
                        game_date = datetime(int(year), int(month), int(day))
                    else:
                        continue
                else:
                    continue
            except ValueError:
                continue
            
            # Extract time
            time_match = re.search(r'(\d{1,2})[h:](\d{2})', elem_text)
            if not time_match:
                time_match = re.search(r'(\d{1,2}):(\d{2})', elem_text)
            
            if not time_match:
                continue
            
            hour, minute = time_match.groups()
            try:
                time_obj = datetime.strptime(f'{hour}:{minute}', '%H:%M').time()
            except:
                continue
            
            # Combine date and time
            local_dt = datetime.combine(game_date.date(), time_obj)
            
            # Extract opponent
            opponent = ''
            # Look for team name patterns
            team_pattern = re.search(r'(?:vs|contre|@)\s+([A-Z][^@\n]+?)(?:\s+@|\s+\(|\s*\d|$)', elem_text, re.I)
            if team_pattern:
                opponent = team_pattern.group(1).strip()
            
            if not opponent:
                continue
            
            # Determine home/away
            is_home = 'vs' in elem_text.lower() or 'domicile' in elem_text.lower() or team_name.lower() in elem_text.lower()
            
            games.append(OfficialGame(
                date=game_date,
                opponent=opponent,
                is_home=is_home,
                local_time=local_dt,
                league='LNB Pro A'
            ))
        
        if games:
            print(f"  [INFO] Found {len(games)} LNB games")
        
    except Exception as e:
        print(f"  [WARN] Failed to fetch LNB schedule: {e}")
        import traceback
        traceback.print_exc()
    
    return games


def convert_to_et(local_time: datetime, local_tz: str) -> datetime:
    """Convert local time to Eastern Time."""
    local_zone = ZoneInfo(local_tz)
    et_zone = ET_TIMEZONE
    
    # Localize the datetime
    local_dt = local_time.replace(tzinfo=local_zone)
    
    # Convert to ET
    et_dt = local_dt.astimezone(et_zone)
    
    return et_dt


def format_time_et(dt: datetime) -> str:
    """Format datetime as HH:MM AM/PM ET."""
    time_str = dt.strftime('%I:%M %p ET')
    # Remove leading zero from hour
    if time_str.startswith('0'):
        time_str = time_str[1:]
    return time_str


def match_game(game: Game, official_games: List[OfficialGame]) -> Optional[OfficialGame]:
    """Match a game from schedule file with official games."""
    best_match = None
    best_score = 0
    
    for official in official_games:
        # Date must match exactly (same day)
        if game.date.date() != official.date.date():
            continue
        
        # League must match
        if game.league != official.league:
            continue
        
        # Home/away must match
        if game.is_home != official.is_home:
            continue
        
        # Opponent must match (fuzzy)
        if fuzzy_match_teams(game.opponent, official.opponent):
            # Prefer exact matches, but accept fuzzy matches
            score = fuzz.ratio(normalize_team_name(game.opponent), 
                             normalize_team_name(official.opponent))
            if score > best_score:
                best_score = score
                best_match = official
    
    return best_match if best_score >= 75 else None


def update_line_with_time(original_line: str, new_time: str) -> str:
    """Update the time portion of a schedule line."""
    # Pattern: look for existing time before @ or at end
    # Remove existing time if present
    line = re.sub(r',\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\s*ET', '', original_line, flags=re.IGNORECASE)
    
    # Add new time before @ or at end
    if '@' in line and not line.rstrip().endswith('@'):
        # Insert before @ (but after opponent)
        # Find the last @ which is usually the venue
        parts = line.rsplit('@', 1)
        if len(parts) == 2:
            line = f"{parts[0]}, {new_time} @{parts[1]}"
        else:
            line = f"{line}, {new_time}"
    else:
        # Append at end
        line = f'{line}, {new_time}'
    
    return line


def process_schedule_file(file_path: Path, config: Dict, playwright_page: Optional[Page] = None) -> Tuple[int, int]:
    """Process a single schedule file and update tipoff times."""
    print(f"\n{'='*60}")
    print(f"Processing: {file_path.name}")
    print(f"Team: {config['team_name']}")
    print(f"{'='*60}")
    
    # Read file
    lines = file_path.read_text(encoding='utf-8').split('\n')
    
    updated_count = 0
    skipped_count = 0
    current_league = None
    
    # Fetch official schedules for all leagues
    official_games = []
    
    for league in config['leagues']:
        print(f"\nFetching {league} schedule...")
        
        if league == 'EuroLeague':
            # Try Playwright first, then RealGM fallback
            if playwright_page:
                games = fetch_euroleague_schedule_playwright(
                    playwright_page,
                    config.get('euroleague_slug', ''),
                    config['timezone'],
                    config['team_name']
                )
            else:
                games = []
            
            # Fallback to RealGM
            if not games:
                games = fetch_realgm_schedule(
                    config.get('realgm_url', ''),
                    config['timezone'],
                    config['team_name'],
                    league
                )
        elif league == 'EuroCup':
            games = fetch_realgm_schedule(
                config.get('realgm_url', ''),
                config['timezone'],
                config['team_name'],
                league
            )
        elif league == 'Liga ACB':
            games = fetch_acb_schedule_web(config['team_name'], config['timezone'], playwright_page)
            if not games:
                # Fallback to RealGM if available
                games = fetch_realgm_schedule(
                    config.get('realgm_url', ''),
                    config['timezone'],
                    config['team_name'],
                    league
                )
        elif league == 'LNB Pro A':
            games = fetch_lnb_schedule_web(config['team_name'], config['timezone'], playwright_page)
            if not games:
                # Fallback to RealGM if available
                games = fetch_realgm_schedule(
                    config.get('realgm_url', ''),
                    config['timezone'],
                    config['team_name'],
                    league
                )
        else:
            games = []
        
        official_games.extend(games)
        
        # Rate limiting
        time.sleep(1)
    
    print(f"\nFound {len(official_games)} official games")
    
    if not official_games:
        print("  [WARN] No official games fetched. Skipping updates.")
        return 0, 0
    
    # Process each line
    updated_lines = []
    unmatched_games = []
    
    for i, line in enumerate(lines):
        # Detect league section headers
        if any(league.upper() in line.upper() for league in config['leagues']):
            for league in config['leagues']:
                if league.upper() in line.upper():
                    current_league = league
                    break
        
        # Skip header lines, empty lines, completed games
        if (not line.strip() or 
            config['team_name'] in line and ('Rank:' in line or 'Source:' in line) or
            '(W ' in line or 
            '(L ' in line):
            updated_lines.append(line)
            continue
        
        # Extract game info
        if current_league:
            game = extract_game_info(line, current_league)
            
            if game:
                # Try to match with official games
                match = match_game(game, official_games)
                
                if match:
                    # Convert time to ET
                    et_time = convert_to_et(match.local_time, config['timezone'])
                    time_str = format_time_et(et_time)
                    
                    # Update line
                    updated_line = update_line_with_time(line, time_str)
                    updated_lines.append(updated_line)
                    updated_count += 1
                    
                    print(f"  ✓ Updated: {game.date.strftime('%b %d')} {'vs' if game.is_home else '@'} {game.opponent} -> {time_str}")
                else:
                    updated_lines.append(line)
                    skipped_count += 1
                    unmatched_games.append(game)
                    print(f"  ✗ Skipped: {game.date.strftime('%b %d')} {'vs' if game.is_home else '@'} {game.opponent} (no match found)")
            else:
                updated_lines.append(line)
        else:
            updated_lines.append(line)
    
    # Write updated file
    file_path.write_text('\n'.join(updated_lines), encoding='utf-8')
    
    # Log unmatched games
    if unmatched_games:
        log_path = file_path.parent / f"{file_path.stem}_unmatched.log"
        with log_path.open('w', encoding='utf-8') as f:
            f.write(f"Unmatched games for {config['team_name']}\n")
            f.write("="*60 + "\n\n")
            for game in unmatched_games:
                f.write(f"{game.date.strftime('%b %d, %Y')} - {'vs' if game.is_home else '@'} {game.opponent}\n")
    
    return updated_count, skipped_count


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Update tipoff times in schedule files')
    parser.add_argument('--dry-run', action='store_true', help='Test without modifying files')
    parser.add_argument('--file', help='Process only a specific file')
    args = parser.parse_args()
    
    print("Basketball Schedule Tipoff Time Updater")
    print("="*60)
    
    script_dir = Path(__file__).parent
    schedule_files = [
        'adam_atamna_schedule.txt',
        'mouhamed_faye_schedule.txt',
        'sergio_de_larrea_schedule.txt',
        'michael_ruzic_schedule.txt',
    ]
    
    if args.file:
        schedule_files = [args.file]
    
    total_updated = 0
    total_skipped = 0
    
    # Initialize Playwright if available
    playwright_page = None
    playwright_context = None
    
    if PLAYWRIGHT_AVAILABLE and not args.dry_run:
        try:
            playwright = sync_playwright().start()
            browser = playwright.chromium.launch(headless=True)
            playwright_context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            playwright_page = playwright_context.new_page()
        except Exception as e:
            print(f"[WARN] Could not initialize Playwright: {e}")
            playwright_page = None
    
    try:
        for filename in schedule_files:
            file_path = script_dir / filename
            
            if not file_path.exists():
                print(f"\n[ERROR] File not found: {filename}")
                continue
            
            config = TEAM_CONFIG.get(filename)
            if not config:
                print(f"\n[ERROR] No config for: {filename}")
                continue
            
            try:
                updated, skipped = process_schedule_file(file_path, config, playwright_page)
                total_updated += updated
                total_skipped += skipped
                
                print(f"\nSummary for {filename}:")
                print(f"  Updated: {updated}")
                print(f"  Skipped: {skipped}")
                
            except Exception as e:
                print(f"\n[ERROR] Failed to process {filename}: {e}")
                import traceback
                traceback.print_exc()
    finally:
        if playwright_context:
            playwright_context.close()
    
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Total games updated: {total_updated}")
    print(f"Total games skipped: {total_skipped}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
