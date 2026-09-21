param(
    [string]$Serial,
    [switch]$AllowOtherVersionCode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-Adb {
    $command = Get-Command 'adb' -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidate = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw 'ADB was not found. Add Android platform-tools to PATH or install the Android SDK platform-tools package.'
}

$adb = Resolve-Adb
$deviceLines = & $adb devices
if ($LASTEXITCODE -ne 0) {
    throw 'adb devices failed.'
}

$authorizedDevices = @(
    $deviceLines | ForEach-Object {
        if ($_ -match '^(\S+)\s+device$') {
            $Matches[1]
        }
    }
)

if ([string]::IsNullOrWhiteSpace($Serial)) {
    if ($authorizedDevices.Count -ne 1) {
        throw "Expected exactly one authorized Android device, found $($authorizedDevices.Count). Pass -Serial when more than one device is connected."
    }
    $Serial = $authorizedDevices[0]
} elseif ($authorizedDevices -notcontains $Serial) {
    throw "Device '$Serial' is not present as an authorized adb device."
}

$serialArgs = @('-s', $Serial)
function Invoke-Adb {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $output = & $adb @serialArgs @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "ADB command failed: adb $($Arguments -join ' ')`n$($output -join "`n")"
    }
    return $output
}

$androidRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$buildGradlePath = Join-Path $androidRoot 'app\build.gradle.kts'
$buildGradleText = Get-Content -LiteralPath $buildGradlePath -Raw
$versionCodeMatch = [regex]::Match($buildGradleText, 'versionCode\s*=\s*(\d+)')
$versionNameMatch = [regex]::Match($buildGradleText, 'versionName\s*=\s*"([^"]+)"')
if (-not $versionCodeMatch.Success -or -not $versionNameMatch.Success) {
    throw "Could not read Teswa versionCode/versionName from $buildGradlePath"
}
$candidateVersionCode = [int]$versionCodeMatch.Groups[1].Value
$candidateVersionName = $versionNameMatch.Groups[1].Value

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidenceDir = Join-Path $androidRoot "build\device-smoke\$timestamp"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$packageName = 'com.teswa.mobile'
$activityName = 'com.teswa.mobile/.MainActivity'

$model = ((Invoke-Adb -Arguments @('shell', 'getprop', 'ro.product.model')) -join '').Trim()
$apiLevel = ((Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.version.sdk')) -join '').Trim()
$packageDump = Invoke-Adb -Arguments @('shell', 'dumpsys', 'package', $packageName)
$packageText = $packageDump -join "`n"

if ($packageText -notmatch 'versionCode=(\d+)') {
    throw "Package $packageName is not installed or its version could not be read. Install/update Teswa through Google Play Internal testing before using this acceptance helper."
}
$versionCode = [int]$Matches[1]
$versionName = if ($packageText -match 'versionName=([^\r\n]+)') { $Matches[1].Trim() } else { '<unknown>' }

$versionAccepted = ($versionCode -eq $candidateVersionCode)
if (-not $versionAccepted -and -not $AllowOtherVersionCode) {
    Write-Warning "Installed Teswa versionCode is $versionCode, not release candidate versionCode $candidateVersionCode. Evidence will still be collected, but this run is not release acceptance."
}

Invoke-Adb -Arguments @('logcat', '-c') | Out-Null
Invoke-Adb -Arguments @('shell', 'am', 'force-stop', $packageName) | Out-Null
$launchOutput = Invoke-Adb -Arguments @('shell', 'am', 'start', '-W', '-n', $activityName)
Start-Sleep -Seconds 2

# This is a real parser-supported route with no invented entity identifier.
$deepLinkOutput = Invoke-Adb -Arguments @(
    'shell', 'am', 'start', '-W',
    '-a', 'android.intent.action.VIEW',
    '-d', 'teswa://notifications',
    '-p', $packageName
)
Start-Sleep -Seconds 2

$topActivity = Invoke-Adb -Arguments @('shell', 'dumpsys', 'activity', 'activities')
$logcat = Invoke-Adb -Arguments @('logcat', '-d', '-v', 'threadtime')

$launchOutput | Out-File -LiteralPath (Join-Path $evidenceDir 'cold-launch.txt') -Encoding utf8
$deepLinkOutput | Out-File -LiteralPath (Join-Path $evidenceDir 'deep-link-notifications.txt') -Encoding utf8
$topActivity | Out-File -LiteralPath (Join-Path $evidenceDir 'activity-state.txt') -Encoding utf8
$logcat | Out-File -LiteralPath (Join-Path $evidenceDir 'logcat.txt') -Encoding utf8
$packageDump | Out-File -LiteralPath (Join-Path $evidenceDir 'package-dump.txt') -Encoding utf8

$checklist = @'
BETWEEN US — REAL-DEVICE RELEASE ACCEPTANCE
[ ] Root: relationship hub renders active / waiting / needs-you / history correctly
[ ] Incoming offer shows the requested/offered object pair
[ ] Accept offer settles in place before navigation
[ ] Accepted offer enters the same Deal relationship
[ ] Deal header preserves both object images and relationship identity
[ ] Deal text coordination send/receive
[ ] Deal voice coordination record/send/playback
[ ] One-side completion leaves the other side pending
[ ] Two-side completion moves the Deal to quiet history
[ ] Completed Deal exposes review as the forward action
[ ] Direct request boundary works
[ ] Accepted Direct opens the rich Direct thread
[ ] Direct reply / reaction / typing / semantic delete
[ ] Direct image attachment send/receive + full-screen viewer
[ ] Direct video attachment send/receive + signed-url open
[ ] Direct file attachment send/receive + signed-url open
[ ] Direct attachment limits: max 5/message and max 50 MB/attachment
[ ] Dolab pull/save bridges inside Direct
[ ] Contextual story reply creates/opens the contextual relationship
[ ] Contextual pinned story origin remains visible above the thread
[ ] Contextual image origin opens full-screen
[ ] Contextual video origin opens through signed private URL
[ ] Contextual voice record/send/playback
[ ] Message-level reporting works in Deal / Direct / Contextual
[ ] Offline/network interruption spot check
[ ] Session-expiry / refresh spot check
[ ] Existing installation updated through Google Play Internal without uninstalling or clearing data
'@
$checklist | Out-File -LiteralPath (Join-Path $evidenceDir 'manual-checklist.txt') -Encoding utf8

$summary = @(
    'Teswa native Android physical-device preflight',
    "UTC: $timestamp",
    "Serial: $Serial",
    "Model: $model",
    "Android API: $apiLevel",
    "Package: $packageName",
    "Installed versionName: $versionName",
    "Installed versionCode: $versionCode",
    "Expected release versionName: $candidateVersionName",
    "Expected release versionCode: $candidateVersionCode",
    "Version code accepted: $versionAccepted",
    'Cold launch: executed',
    'Deep link teswa://notifications: executed',
    "Evidence: $evidenceDir",
    '',
    'This helper does not mark the manual flows or production push/Oracle behavior as accepted.'
)
$summary | Out-File -LiteralPath (Join-Path $evidenceDir 'summary.txt') -Encoding utf8

Write-Host ($summary -join "`n")
Write-Host ''
Write-Host $checklist

if (-not $versionAccepted -and -not $AllowOtherVersionCode) {
    exit 2
}
