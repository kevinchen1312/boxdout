# Run schedule sync in parallel for speed

Write-Host ""
Write-Host "PARALLEL SCHEDULE SYNC" -ForegroundColor Cyan
Write-Host "Starting 8 parallel workers..." -ForegroundColor Yellow
Write-Host ""

$jobs = @()

$ranges = @(
    @{Start="A"; End="C"},
    @{Start="D"; End="F"},
    @{Start="G"; End="I"},
    @{Start="J"; End="L"},
    @{Start="M"; End="O"},
    @{Start="P"; End="R"},
    @{Start="S"; End="U"},
    @{Start="V"; End="Z"}
)

foreach ($range in $ranges) {
    $start = $range.Start
    $end = $range.End
    
    Write-Host "[$start-$end] Starting..." -ForegroundColor Green
    
    $job = Start-Job -ScriptBlock {
        param($start, $end)
        Set-Location $using:PWD
        npx ts-node scripts/sync-international-schedules-range.ts $start $end 2>&1
    } -ArgumentList $start, $end
    
    $jobs += @{Job=$job; Range="$start-$end"}
}

Write-Host ""
Write-Host "All workers started! Waiting for completion..." -ForegroundColor Yellow
Write-Host "This will take ~5-10 minutes" -ForegroundColor Green
Write-Host ""

$completed = 0
while ($completed -lt $jobs.Count) {
    Start-Sleep -Seconds 5
    
    foreach ($jobInfo in $jobs) {
        $job = $jobInfo.Job
        $range = $jobInfo.Range
        
        if ($job.State -eq 'Completed') {
            if ($job.HasMoreData) {
                Write-Host ""
                Write-Host "[$range] COMPLETED" -ForegroundColor Green
                Receive-Job -Job $job
            }
            $completed++
        }
        elseif ($job.State -eq 'Failed') {
            Write-Host ""
            Write-Host "[$range] FAILED" -ForegroundColor Red
            Receive-Job -Job $job
            $completed++
        }
    }
}

Wait-Job -Job $jobs.Job | Out-Null

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "FINAL SUMMARY" -ForegroundColor Cyan
Write-Host ""

foreach ($jobInfo in $jobs) {
    $job = $jobInfo.Job
    $range = $jobInfo.Range
    
    if ($job.State -eq 'Completed') {
        Write-Host "[$range] Success" -ForegroundColor Green
    } else {
        Write-Host "[$range] Failed" -ForegroundColor Red
    }
}

Remove-Job -Job $jobs.Job

Write-Host ""
Write-Host "Parallel sync complete!" -ForegroundColor Green
Write-Host ""
