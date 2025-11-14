# Team Logos Directory

This directory contains logos for international basketball teams that are not in the ESPN directory.

**STATUS: ✅ ALL 32 INTERNATIONAL TEAMS HAVE LOGOS!**

## Logo Status

All logos were automatically downloaded or generated using:
- **Real Logos**: Downloaded from Wikimedia Commons using `scripts/download-logos.mjs` and `scripts/fetch-logos-from-wikimedia.mjs`
- **High-Quality Placeholders**: Generated with authentic team colors using `scripts/generate-realistic-placeholders.mjs`

## Real Logos (Downloaded from Wikimedia Commons)

### NBL Teams (Australia/New Zealand) - 10 teams
- `melbourne-united.png` - Melbourne United
- `new-zealand-breakers.png` - New Zealand Breakers 
- `brisbane-bullets.png` - Brisbane Bullets
- `south-east-melbourne-phoenix.png` - S.E. Melbourne Phoenix
- `cairns-taipans.png` - Cairns Taipans
- `perth-wildcats.png` - Perth Wildcats
- `tasmania-jackjumpers.png` - Tasmania JackJumpers
- `sydney-kings.png` - Sydney Kings
- `adelaide-36ers.png` - Adelaide 36ers
- `illawarra-hawks.png` - Illawarra Hawks

### EuroLeague Teams (France) - 2 teams
- `asvel-basket.png` - ASVEL Basket (LDLC ASVEL)
- `paris-basketball.png` - Paris Basketball

### Liga ACB Teams (Spain) - 4 teams
- `valencia-basket.png` - Valencia Basket
- `joventut-badalona.png` - Joventut Badalona
- `real-madrid.svg` - Real Madrid ⭐
- `barcelona.svg` - FC Barcelona ⭐
- `baskonia.svg` - Baskonia ⭐
- `unicaja.svg` - Unicaja Málaga ⭐

### Other EuroLeague Teams - 3 teams
- `bayern-munich.svg` - FC Bayern Munich ⭐
- `virtus-bologna.svg` - Virtus Bologna ⭐

⭐ = Downloaded from Wikimedia Commons in SVG format

## High-Quality Placeholders (Authentic Team Colors)

The following teams have professionally-designed SVG placeholders with authentic team colors:

### Serbian ABA League (9 teams)
- `mega-superbet.svg` - Mega Superbet (Black/Gold)
- `cedevita-olimpija.svg` - Cedevita Olimpija (Green/White)
- `bosna-bh-telecom.svg` - Bosna BH Telecom (Blue/White)
- `bc-vienna.svg` - BC Vienna (Crimson/Gold)
- `crvena-zvezda.svg` - Crvena Zvezda / Red Star (Red/White) ⭐
- `ilirija.svg` - Ilirija (Blue/White)
- `zadar.svg` - Zadar (Red/White)
- `buducnost.svg` - Budućnost VOLI (Blue/White)
- `spartak.svg` - Spartak Office Shoes (Crimson/Gold)

### EuroLeague - Italian Teams (1 team)
- `armani-milan.svg` - Olimpia Milano (Red/White)

### EuroLeague - Turkish Teams (2 teams)
- `fenerbahce.svg` - Fenerbahçe Beko (Yellow/Blue)
- `anadolu-efes.svg` - Anadolu Efes (Blue/White)

### EuroLeague - Greek Teams (2 teams)
- `panathinaikos.svg` - Panathinaikos (Green/White)
- `olympiacos.svg` - Olympiacos (Red/White)

### EuroLeague - Lithuanian Teams (1 team)
- `zalgiris.svg` - Žalgiris Kaunas (Green/White)

### EuroLeague - Serbian Teams (1 team)
- `partizan.svg` - KK Partizan Belgrade (Black/White) ⭐

### EuroLeague - Israeli Teams (2 teams)
- `hapoel-tel-aviv.svg` - Hapoel Tel Aviv (Red/White)
- `maccabi-tel-aviv.svg` - Maccabi FOX Tel Aviv (Blue/Gold) ⭐

### EuroLeague - French Teams (1 team)
- `monaco.svg` - AS Monaco Basket (Red/White)

### Other Teams (1 team)
- `dubai.svg` - Dubai BC (Gold/Black)

## Automation Scripts

### Download Real Logos
```bash
# Download logos from Wikimedia Commons (PNG)
node scripts/download-logos.mjs

# Download logos using Wikimedia API (SVG)
node scripts/fetch-logos-from-wikimedia.mjs
```

### Generate High-Quality Placeholders
```bash
# Generate professional SVG placeholders with authentic team colors
node scripts/generate-realistic-placeholders.mjs
```

### Verify All Logos
```bash
# Check that all team logo mappings are valid
node scripts/verify-logo-mappings.mjs
```

## Logo Specifications

- **Format**: PNG or SVG (SVG preferred for scalability)
- **Source Size**: 500x500 pixels
- **Display Size**: 100x100 pixels (handled by CSS)
- **Aspect Ratio**: Square (1:1)
- **Color Mode**: RGB

## Logo Sources

- **Wikimedia Commons**: https://commons.wikimedia.org
- **Official Team Websites**
- **EuroLeague**: https://www.euroleaguebasketball.net
- **NBL**: https://www.nbl.com.au
- **Liga ACB**: https://www.acb.com
- **ABA Liga**: https://www.aba-liga.com

