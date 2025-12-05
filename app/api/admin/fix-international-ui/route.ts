import { NextResponse } from 'next/server';

export async function GET() {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Fix International Players</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .card {
      background: white;
      border-radius: 8px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-top: 0; }
    h2 { color: #666; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px; }
    button {
      background: #8b5cf6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      margin-right: 10px;
      font-weight: 600;
    }
    button:hover { background: #7c3aed; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .step { margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 6px; }
    .result { margin-top: 20px; padding: 15px; border-radius: 4px; }
    .success { background: #d4edda; color: #155724; }
    .error { background: #f8d7da; color: #721c24; }
    .info { background: #d1ecf1; color: #0c5460; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 400px; }
    .loading { color: #666; }
    ul { margin: 10px 0; }
    li { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔧 Fix International Player Associations</h1>
    <p><strong>Comprehensive tool to audit and fix all international players.</strong></p>
    
    <div class="step">
      <h2>Step 1: Audit All Players</h2>
      <p>Analyzes current state, identifies issues, checks API for correct teams.</p>
      <p><strong>⚠️ Takes 5-10 minutes due to API rate limiting.</strong></p>
      <button onclick="runAudit()" id="btn1">Run Audit</button>
      <div id="result1"></div>
    </div>
    
    <div class="step">
      <h2>Step 2: Comprehensive Fix</h2>
      <p>Fixes team IDs, fetches games, caches logos for ALL international players.</p>
      <p><strong>⚠️ Takes 5-10 minutes and uses API quota.</strong></p>
      <button onclick="runFix()" id="btn2">Run Comprehensive Fix</button>
      <div id="result2"></div>
    </div>
    
    <div class="step">
      <h2>Step 3: Verify Results</h2>
      <ol>
        <li>Check fix results above - should show 15-50 games per player</li>
        <li>Review the generated report files in project root</li>
        <li>Check any new team mappings that need to be added</li>
        <li>Restart dev server: <code>npm run dev</code></li>
        <li>Hard refresh player pages (Ctrl+Shift+R)</li>
      </ol>
      <div id="result3"></div>
    </div>
    
    <div class="step">
      <h2>Alternative: Legacy Fix Flow</h2>
      <p>Use the old step-by-step approach if needed.</p>
      <button onclick="fixTeamNames()" id="btn4">Fix Team Names (Legacy)</button>
      <button onclick="fetchAllGames()" id="btn5">Fetch Games (Legacy)</button>
      <div id="result4"></div>
    </div>
  </div>

  <script>
    async function runAudit() {
      const btn = document.getElementById('btn1');
      const result = document.getElementById('result1');
      
      btn.disabled = true;
      result.innerHTML = '<div class="result loading">⏳ Running comprehensive audit... This will take 5-10 minutes...</div>';
      
      try {
        const response = await fetch('/api/admin/run-international-audit', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          result.innerHTML = '<div class="result success"><strong>&#x2705; Audit Complete!</strong><pre>' + data.output + '</pre></div>';
        } else {
          result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><p>' + data.error + '</p><pre>' + (data.output || '') + (data.errors || '') + '</pre></div>';
        }
      } catch (error) {
        result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><p>' + error.message + '</p></div>';
      } finally {
        btn.disabled = false;
      }
    }
    
    async function runFix() {
      const btn = document.getElementById('btn2');
      const result = document.getElementById('result2');
      
      btn.disabled = true;
      result.innerHTML = '<div class="result loading">⏳ Running comprehensive fix... This will take 5-10 minutes...</div>';
      
      try {
        const response = await fetch('/api/admin/run-international-fix', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          result.innerHTML = '<div class="result success"><strong>&#x2705; Fix Complete!</strong><pre>' + data.output + '</pre></div>';
          document.getElementById('result3').innerHTML = '<div class="result info"><strong>&#x1F389; Done!</strong><p>Now restart your dev server and refresh player pages!</p></div>';
        } else {
          result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><p>' + data.error + '</p><pre>' + (data.output || '') + (data.errors || '') + '</pre></div>';
        }
      } catch (error) {
        result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><p>' + error.message + '</p></div>';
      } finally {
        btn.disabled = false;
      }
    }
    
    async function fixTeamNames() {
      const btn = document.getElementById('btn4');
      const result = document.getElementById('result4');
      
      btn.disabled = true;
      result.innerHTML = '<div class="result loading">⏳ Searching API and updating team names...</div>';
      
      try {
        const response = await fetch('/api/admin/fix-team-names', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          let html = '<div class="result success"><strong>&#x2705; Success!</strong><br><br>';
          data.results.forEach(r => {
            if (r.error) {
              html += '<p>&#x274C; ' + r.wrong + ' &rarr; ' + r.correct + ': ' + r.error + '</p>';
            } else {
              html += '<p>&#x2705; ' + r.wrong + ' &rarr; <strong>' + r.foundTeam + '</strong> (ID: ' + r.teamId + ', ' + r.country + ')<br>';
              html += '&nbsp;&nbsp;&nbsp;Updated ' + r.prospectsUpdated + ' prospect(s): ' + r.prospects.join(', ') + '</p>';
            }
          });
          html += '</div>';
          result.innerHTML = html;
        } else {
          result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><pre>' + JSON.stringify(data, null, 2) + '</pre></div>';
        }
      } catch (error) {
        result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><p>' + error.message + '</p></div>';
      } finally {
        btn.disabled = false;
      }
    }
    
    async function fetchAllGames() {
      const btn = document.getElementById('btn5');
      const result = document.getElementById('result4');
      
      btn.disabled = true;
      result.innerHTML = '<div class="result loading">⏳ Fetching games from API-Basketball... This may take 30-60 seconds...</div>';
      
      try {
        const response = await fetch('/api/admin/fix-all-international', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          let html = '<div class="result success"><strong>&#x2705; Complete!</strong><br><br>';
          html += '<p>Processed ' + data.prospectsProcessed + ' prospects:</p><ul>';
          
          data.results.forEach(r => {
            if (r.success) {
              html += '<li>&#x2705; <strong>' + r.name + '</strong> (' + r.team + '): ' + r.gamesFetched + ' games fetched</li>';
            } else {
              html += '<li>&#x274C; <strong>' + r.name + '</strong> (' + r.team + '): ' + r.error + '</li>';
            }
          });
          
          html += '</ul></div>';
          result.innerHTML = html;
        } else {
          result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><pre>' + JSON.stringify(data, null, 2) + '</pre></div>';
        }
      } catch (error) {
        result.innerHTML = '<div class="result error"><strong>&#x274C; Error</strong><p>' + error.message + '</p></div>';
      } finally {
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

