<#
.SYNOPSIS
  TaskFlow Generic Local Runner (Windows)
  Polls the TaskFlow Capability queue, executes local scripts or binaries,
  extends leases via heartbeats, and reports machine-readable status back.

.DESCRIPTION
  This runner is 100% generic. It contains NO video-specific or capability-specific
  logic. All invocation parameters, command lines, and status checks are dynamically
  driven by the Capability's registered executionConfig and inputPayload.

.EXAMPLE
  .\scripts\taskflow-runner.ps1 -ApiUrl "https://api.app.journaltogrow.com" -ApiKey "..." -Once
#>

param(
    [string]$ApiUrl,
    [string]$ApiKey,
    [int]$PollIntervalSec = 10,
    [int]$HeartbeatIntervalSec = 30,
    [switch]$Once,
    [switch]$VerboseLog
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "..\taskflow-runner.json"

if (Test-Path $ConfigFile) {
    try {
        $cfg = Get-Content -Raw $ConfigFile | ConvertFrom-Json
        if (-not $ApiUrl -and $cfg.url) { $ApiUrl = $cfg.url }
        if (-not $ApiKey -and $cfg.apiKey) { $ApiKey = $cfg.apiKey }
        if ($cfg.pollIntervalSec) { $PollIntervalSec = [int]$cfg.pollIntervalSec }
        if ($cfg.heartbeatIntervalSec) { $HeartbeatIntervalSec = [int]$cfg.heartbeatIntervalSec }
    } catch {
        Write-Warning "[Runner] Could not parse $($ConfigFile): $_"
    }
}

if (-not $ApiUrl) { $ApiUrl = "https://api.app.journaltogrow.com" }
$ApiUrl = $ApiUrl.TrimEnd('/')

if (-not $ApiKey) {
    if ($env:TASKFLOW_API_KEY) {
        $ApiKey = $env:TASKFLOW_API_KEY
    } else {
        Write-Error "[Runner] ApiKey is required. Provide -ApiKey, set TASKFLOW_API_KEY env, or configure taskflow-runner.json"
        exit 1
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " TaskFlow Generic Local Runner (Windows)" -ForegroundColor Cyan
Write-Host " Endpoint : $ApiUrl" -ForegroundColor Gray
Write-Host " Mode     : $(if ($Once) { 'Single Job (-Once)' } else { 'Continuous Polling' })" -ForegroundColor Gray
Write-Host " Interval : ${PollIntervalSec}s poll / ${HeartbeatIntervalSec}s heartbeat" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

function Invoke-TaskFlow([string]$Method, [string]$Path, $Body = $null) {
    $uri = "$ApiUrl$Path"
    $headers = @{
        "x-api-key" = $ApiKey
        "Content-Type" = "application/json"
    }
    $params = @{
        Uri = $uri
        Method = $Method
        Headers = $headers
        TimeoutSec = 30
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    try {
        return Invoke-RestMethod @params
    } catch {
        $msg = $_.Exception.Message
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            if ($stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                $msg += " | " + $reader.ReadToEnd()
            }
        }
        Write-Warning "[Runner] API $Method $Path failed: $msg"
        return $null
    }
}

function Claim-NextJob {
    $res = Invoke-TaskFlow -Method "POST" -Path "/capabilities/runner/claim"
    if ($res -and $res.job) {
        return $res.job
    }
    return $null
}

function Send-JobHeartbeat([int]$JobId) {
    Invoke-TaskFlow -Method "POST" -Path "/capabilities/runner/$JobId/heartbeat" @{ leaseSeconds = 300 } | Out-Null
}

function Report-JobStatus([int]$JobId, [hashtable]$StatusData) {
    return Invoke-TaskFlow -Method "POST" -Path "/capabilities/runner/$JobId/status" $StatusData
}

function Build-CommandLine($CommandBase, $ArgsMapping, $InputPayload, $RequestId) {
    $tokens = @($CommandBase)
    if ($ArgsMapping) {
        $map = if ($ArgsMapping -is [System.Management.Automation.PSCustomObject]) {
            $ArgsMapping.psobject.properties
        } else {
            $ArgsMapping.GetEnumerator()
        }

        foreach ($prop in $map) {
            $key = $prop.Name
            $flag = $prop.Value

            if ($key -eq "requestId") {
                $tokens += "$flag $RequestId"
            } elseif ($null -ne $InputPayload.$key) {
                $val = $InputPayload.$key
                if ($val -is [bool]) {
                    if ($val) { $tokens += $flag }
                } elseif ($val -is [string] -and $val.Contains(" ")) {
                    $tokens += "$flag `"$val`""
                } else {
                    $tokens += "$flag $val"
                }
            }
        }
    }
    return ($tokens -join " ")
}

function Process-Job($job) {
    $jobId = [int]$job.id
    $reqId = [string]$job.requestId
    $slug = [string]$job.capabilitySlug
    $execConfig = $job.executionConfig
    $inputPayload = $job.inputPayload

    Write-Host "[Runner] Claimed Job #$jobId ('$slug') - RequestId: $reqId" -ForegroundColor Green
    Write-Host "[Runner] Lease expires at: $($job.leaseExpiresAt)" -ForegroundColor DarkGray

    $launchCmdBase = $execConfig.launchCommand
    if (-not $launchCmdBase) {
        Write-Error "[Runner] Job #$jobId missing 'launchCommand' in executionConfig."
        Report-JobStatus -JobId $jobId -StatusData @{
            status = "failed"
            error = "Missing launchCommand in executionConfig"
            exitCode = 1
        } | Out-Null
        return
    }

    $argsMapping = $execConfig.argsMapping
    $cmdToRun = Build-CommandLine -CommandBase $launchCmdBase -ArgsMapping $argsMapping -InputPayload $inputPayload -RequestId $reqId

    $workingDir = if ($execConfig.workingDirectory -and (Test-Path $execConfig.workingDirectory)) {
        $execConfig.workingDirectory
    } else {
        $null
    }

    if ($workingDir) {
        Push-Location $workingDir
        Write-Host "[Runner] Working directory: $(Get-Location)" -ForegroundColor DarkGray
    }

    try {
        Write-Host "[Runner] Executing: $cmdToRun" -ForegroundColor Yellow
        $startTime = Get-Date

        # Execute launch command
        $launchOutput = Invoke-Expression $cmdToRun 2>&1
        $exitCode = $LASTEXITCODE

        Write-Host "[Runner] Launch output (exit code $exitCode):" -ForegroundColor DarkGray
        Write-Host ($launchOutput -join "`n") -ForegroundColor DarkGray

        $launchJson = try {
            $launchOutput | ConvertFrom-Json -ErrorAction SilentlyContinue
        } catch { $null }

        if ($exitCode -ne 0 -and (-not $launchJson -or $launchJson.status -notin "started", "already_running", "handed_to_worker")) {
            $errMsg = if ($launchJson.message) { $launchJson.message } else { ($launchOutput -join " ") }
            Write-Host "[Runner] Launch failed for Job #$($jobId): $errMsg" -ForegroundColor Red
            Report-JobStatus -JobId $jobId -StatusData @{
                status = "failed"
                exitCode = $exitCode
                error = $errMsg
                message = $errMsg
            } | Out-Null
            return
        }

        # If this capability has a separate statusCommand to poll (asynchronous workflow)
        $statusCmdBase = $execConfig.statusCommand
        if ($statusCmdBase) {
            $statusInterval = if ($execConfig.statusIntervalSec) { [int]$execConfig.statusIntervalSec } else { 15 }
            $timeoutSec = if ($execConfig.timeoutSec) { [int]$execConfig.timeoutSec } else { 1800 }
            $lastBeat = Get-Date

            Write-Host "[Runner] Polling status via $statusCmdBase every ${statusInterval}s (timeout: ${timeoutSec}s)..." -ForegroundColor Cyan

            while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($timeoutSec)) {
                Start-Sleep -Seconds $statusInterval

                # Heartbeat check
                if ((Get-Date) - $lastBeat -ge [TimeSpan]::FromSeconds($HeartbeatIntervalSec)) {
                    Write-Host "[Runner] Renewing lease for Job #$jobId..." -ForegroundColor DarkGray
                    Send-JobHeartbeat -JobId $jobId
                    $lastBeat = Get-Date
                }

                # Check status
                $checkCmd = "$statusCmdBase -RequestId $reqId"
                $statusRaw = Invoke-Expression $checkCmd 2>&1
                $statusJson = try { $statusRaw | ConvertFrom-Json -ErrorAction SilentlyContinue } catch { $null }

                if ($statusJson) {
                    $rawStatus = if ($statusJson.status) { $statusJson.status } else { "running" }
                    $normStatus = switch ($rawStatus) {
                        "ready_for_approval" { "ready_for_approval" }
                        "done"               { "ready_for_approval" }
                        "completed"          { "completed" }
                        "success"            { "completed" }
                        "failed"             { "failed" }
                        "partial"            { "partial" }
                        "running"            { "running" }
                        "pending"            { "running" }
                        default              { $rawStatus }
                    }

                    $revUrl = if ($statusJson.dashboardUrl) { $statusJson.dashboardUrl } elseif ($statusJson.reviewUrl) { $statusJson.reviewUrl } else { $null }
                    $msg = if ($statusJson.message) { $statusJson.message } else { $null }
                    $code = if ($null -ne $statusJson.exitCode) { [int]$statusJson.exitCode } else { 0 }

                    Write-Host "[Runner] Job #$jobId status: $normStatus $(if ($msg) { "- $msg" })" -ForegroundColor Cyan

                    Report-JobStatus -JobId $jobId -StatusData @{
                        status = $normStatus
                        exitCode = $code
                        message = $msg
                        reviewUrl = $revUrl
                        outputPayload = $statusJson
                    } | Out-Null

                    if ($normStatus -in "ready_for_approval", "completed", "failed", "partial") {
                        Write-Host "[Runner] Job #$jobId finished with status '$normStatus'." -ForegroundColor Green
                        return
                    }
                } else {
                    Write-Warning "[Runner] Could not parse status output: $statusRaw"
                }
            }

            # Timeout reached
            Write-Warning "[Runner] Job #$jobId timed out after ${timeoutSec}s."
            Report-JobStatus -JobId $jobId -StatusData @{
                status = "failed"
                error = "Execution timed out after ${timeoutSec} seconds"
            } | Out-Null
        } else {
            # One-shot command: launch output is final result
            $finalStatus = if ($exitCode -eq 0) { "completed" } else { "failed" }
            Report-JobStatus -JobId $jobId -StatusData @{
                status = $finalStatus
                exitCode = $exitCode
                message = ($launchOutput -join "`n")
                outputPayload = if ($launchJson) { $launchJson } else { @{ raw = ($launchOutput -join "`n") } }
            } | Out-Null
            Write-Host "[Runner] One-shot job #$jobId finished with status '$finalStatus'." -ForegroundColor Green
        }
    } finally {
        if ($workingDir) {
            Pop-Location
        }
    }
}

# Main polling loop
do {
    try {
        $job = Claim-NextJob
        if ($job) {
            Process-Job -job $job
            if ($Once) { break }
        } else {
            if ($Once) {
                Write-Host "[Runner] No jobs queued (-Once). Exiting." -ForegroundColor Gray
                break
            }
            Start-Sleep -Seconds $PollIntervalSec
        }
    } catch {
        Write-Warning "[Runner] Error in main loop: $_"
        if ($Once) { break }
        Start-Sleep -Seconds $PollIntervalSec
    }
} while (-not $Once)
