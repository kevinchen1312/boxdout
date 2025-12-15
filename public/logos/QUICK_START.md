# Quick Start: Adding Real Team Logos

## 🎯 Goal
Replace SVG placeholder logos with actual PNG team logos for a professional look.

## 📊 Current Status
- ✅ NBL teams (10): Have actual logos
- ✅ ASVEL, Paris, Valencia, Joventut: Have actual logos  
- ⏳ EuroLeague & ABA League (16 teams): Need actual logos

## 🚀 Quick Steps

### 1. Run the helper script
```bash
node scripts/download-team-logos.mjs
```

This will show you:
- Which teams need logos
- Direct search links for each team
- Exact filenames to use

### 2. Download logos
For each team, visit the provided links and download their logo:
- **Preferred**: PNG format with transparent background
- **Size**: 500x500 pixels or larger
- **Quality**: High resolution official logos

### 3. Save logos
Save each downloaded logo to the correct location:
```
public/logos/[team-name].png
```

For example:
- `public/logos/real-madrid.png`
- `public/logos/barcelona.png`
- `public/logos/fenerbahce.png`

### 4. Verify
Run the verification script to check your progress:
```bash
node scripts/verify-logo-mappings.mjs
```

### 5. Refresh your site
The logos will automatically appear! No code changes needed.

## 🎨 Where to Find Logos

### Best Sources (in order):
1. **Wikimedia Commons** - https://commons.wikimedia.org/
   - Free to use, often has SVG versions
   - Search: "[Team name] logo"

2. **Official Team Websites**
   - Look for "Press Kit", "Media", or "Brand Assets"
   - Usually highest quality

3. **SportsLogos.net** - https://www.sportslogos.net/
   - Comprehensive collection
   - Organized by league

4. **Google Images**
   - Search: "[Team name] logo PNG transparent"
   - Filter by size: Large
   - Look for official sources

## 💡 Pro Tips

### Getting High-Quality Logos:
- Search for "logo PNG transparent" to find versions without backgrounds
- Look for "official logo" or "brand assets" for authentic versions
- Check Wikimedia Commons first - they often have SVG versions (best quality)

### If You Find an SVG:
SVG is better than PNG! Just save it as `.svg` instead of `.png`:
```
public/logos/real-madrid.svg
```

### If Logo Has White Background:
1. Use https://www.remove.bg/ to remove the background
2. Or search specifically for "transparent background" versions

### If Logo is Too Small:
- Look for "high resolution" or "vector" versions
- Wikimedia Commons often has large sizes
- Official team press kits have print-quality logos

## 🎯 Priority Teams (Start Here!)

These teams appear most frequently in your schedules:

1. **Real Madrid** - `real-madrid.png`
2. **FC Barcelona** - `barcelona.png`
3. **Fenerbahçe** - `fenerbahce.png`
4. **Panathinaikos** - `panathinaikos.png`
5. **Crvena Zvezda** - `crvena-zvezda.png`
6. **Partizan** - `partizan.png`

## ⚡ Fast Track

If you want to get started quickly:

```bash
# 1. See what you need
node scripts/download-team-logos.mjs

# 2. Download the top 6 priority teams first
#    (Use the search links provided by the script)

# 3. Check your progress
node scripts/verify-logo-mappings.mjs

# 4. Continue with the rest as time permits
```

## 🔄 How It Works

The system is already configured:
- ✅ Logo mappings are set up
- ✅ SVG placeholders are in place as fallbacks
- ✅ When you add a PNG file, it automatically displays
- ✅ No code changes required!

Just add the PNG files and refresh your browser!

## ❓ Need Help?

### Logo won't display?
1. Check filename matches exactly (lowercase, hyphens)
2. Verify it's in `public/logos/` directory
3. Ensure file is valid PNG format
4. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Can't find a logo?
- Try multiple search engines
- Check the team's Wikipedia page
- Look for their official social media profile images
- Ask in the team's subreddit or fan forums

### Logo looks blurry?
- Find a larger version (at least 500x500px)
- Look for SVG version (vector = infinite resolution)
- Check official team press kits

## 📝 Legal Note

Team logos are trademarks of their respective organizations. Use should be limited to:
- Factual reference and identification
- News and information purposes
- Non-commercial educational use

This is generally considered fair use for a schedule/information website.







