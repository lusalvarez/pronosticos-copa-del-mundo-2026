$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$freeze = 1781118000000

Write-Host "Current time (UTC ms): $now"
Write-Host "Freeze day1 (UTC ms): $freeze"
Write-Host "Is frozen? $($now -ge $freeze)"
Write-Host "Time until freeze (hours): $(($freeze - $now) / (1000 * 60 * 60))"

# Made with Bob
