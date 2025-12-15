import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * POST /api/admin/run-international-audit
 * Runs the international players audit script
 */
export async function POST() {
  const apiKey = process.env.API_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API_BASKETBALL_KEY not configured' }, { status: 500 });
  }

  try {
    console.log('[run-international-audit] Starting audit...');
    
    // Run the audit script using npx ts-node
    const { stdout, stderr } = await execAsync(
      'npx ts-node scripts/audit-international-players.ts',
      {
        env: {
          ...process.env,
          API_BASKETBALL_KEY: apiKey,
        },
        timeout: 600000, // 10 minutes timeout
      }
    );

    console.log('[run-international-audit] Script output:', stdout);
    if (stderr) {
      console.error('[run-international-audit] Script errors:', stderr);
    }

    // Try to read the generated report
    const reportPath = path.join(process.cwd(), 'international-players-audit-report.json');
    let report = null;
    try {
      const reportContent = fs.readFileSync(reportPath, 'utf-8');
      report = JSON.parse(reportContent);
    } catch (e) {
      console.warn('[run-international-audit] Could not read report file');
    }

    return NextResponse.json({
      success: true,
      message: 'Audit completed successfully',
      output: stdout,
      errors: stderr || null,
      report,
    });
  } catch (error: any) {
    console.error('[run-international-audit] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      output: error.stdout || null,
      errors: error.stderr || null,
    }, { status: 500 });
  }
}

export async function GET() {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Run International Audit</title>
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
        button {
          background: #8b5cf6;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          font-weight: 600;
        }
        button:hover { background: #7c3aed; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        pre {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 4px;
          overflow-x: auto;
          max-height: 600px;
          font-size: 12px;
        }
        .loading { color: #666; }
        .success { color: #10b981; }
        .error { color: #ef4444; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🔍 Run International Players Audit</h1>
        <p><strong>This will audit ALL international players:</strong></p>
        <ul>
          <li>Check team associations and IDs</li>
          <li>Verify games are fetched</li>
          <li>Check logo status</li>
          <li>Search API for correct team info</li>
          <li>Generate detailed report</li>
        </ul>
        <p><strong>⚠️ This may take 5-10 minutes due to API rate limiting.</strong></p>
        <button onclick="runAudit()" id="btn">Run Audit</button>
        <div id="result"></div>
      </div>

      <script>
        async function runAudit() {
          const btn = document.getElementById('btn');
          const result = document.getElementById('result');
          
          btn.disabled = true;
          result.innerHTML = '<div class="loading"><h3>⏳ Running audit...</h3><p>This will take several minutes. Please wait...</p></div>';
          
          try {
            const response = await fetch('/api/admin/run-international-audit', { 
              method: 'POST',
            });
            const data = await response.json();
            
            if (data.success) {
              result.innerHTML = \`
                <div class="success">
                  <h3>✅ Audit Completed!</h3>
                  <pre>\${data.output}</pre>
                </div>
              \`;
            } else {
              result.innerHTML = \`
                <div class="error">
                  <h3>❌ Audit Failed</h3>
                  <p>\${data.error}</p>
                  <pre>\${data.output || ''}\${data.errors || ''}</pre>
                </div>
              \`;
            }
          } catch (error) {
            result.innerHTML = \`
              <div class="error">
                <h3>❌ Error</h3>
                <p>\${error.message}</p>
              </div>
            \`;
          } finally {
            btn.disabled = false;
          }
        }
      </script>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}





