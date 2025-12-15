#!/usr/bin/env python3
"""
Test script to verify parsing logic before running the full update script.
"""

import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

def parse_date(date_str: str):
    """Parse date from schedule file."""
    formats = ['%b %d, %Y']  # Oct 1, 2025
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None

def extract_game_info(line: str):
    """Extract game information from a schedule line."""
    line = line.strip()
    
    if not line or '(W ' in line or '(L ' in line:
        return None
    
    # Extract date
    date_match = re.search(r'([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})', line)
    if not date_match:
        return None
    
    date = parse_date(date_match.group(1))
    if not date:
        return None
    
    # Extract home/away and opponent
    is_home = 'vs ' in line
    is_away = '@ ' in line and not line.startswith('@')
    
    if is_home:
        opp_match = re.search(r'vs\s+([^@]+?)(?:@|,|$)', line)
    elif is_away:
        opp_match = re.search(r'@\s+([^@]+?)(?:@|,|$)', line)
    else:
        return None
    
    if not opp_match:
        return None
    
    opponent = opp_match.group(1).strip()
    
    # Extract existing time if present
    time_match = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*ET)', line, re.IGNORECASE)
    existing_time = time_match.group(1) if time_match else None
    
    return {
        'date': date,
        'opponent': opponent,
        'is_home': is_home,
        'existing_time': existing_time,
        'line': line
    }

# Test with a few lines from the schedule files
test_lines = [
    "Nov 13, 2025 - vs Valencia Basket @ Halle Georges Carpentier Arena, 2:45 PM ET",
    "Nov 12, 2025 - @ AX Armani Exchange Milan @ Mediolanum Forum, 2:30 PM ET",
    "Oct 1, 2025 - vs Valencia Basket @ Astroballe",
    "Nov 19, 2025 - vs AS Monaco Basket @ Astroballe, 2:00 PM ET",
]

print("Testing parsing logic:")
print("=" * 60)

for line in test_lines:
    game = extract_game_info(line)
    if game:
        print(f"\nLine: {line}")
        print(f"  Date: {game['date'].strftime('%b %d, %Y')}")
        print(f"  Opponent: {game['opponent']}")
        print(f"  Home: {game['is_home']}")
        print(f"  Existing time: {game['existing_time']}")
    else:
        print(f"\nLine: {line}")
        print(f"  Could not parse")

print("\n" + "=" * 60)
print("Parsing test complete!")







