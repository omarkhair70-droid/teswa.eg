Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-EnvironmentVariable {
    param([Parameter(Mandatory = $true)][string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required environment variable: $Name"
    }
    return $value.Trim()
}

function Resolve-JdkTool {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
        $candidate = Join-Path $env:JAVA_HOME "bin\$Name.exe"
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    throw "Could not find $Name. Set JAVA_HOME to a JDK 17 installation or add the JDK bin directory to PATH."
}

function Normalize-Fingerprint {
    param([Parameter(Mandatory = $true)][string]$Value)
    return (($Value -replace '[^0-9A-Fa-f]', '').ToUpperInvariant())
}

$androidRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$storeFile = Require-EnvironmentVariable 'TESWA_RELEASE_STORE_FILE'
$storePassword = Require-EnvironmentVariable 'TESWA_RELEASE_STORE_PASSWORD'
$keyAlias = Require-EnvironmentVariable 'TESWA_RELEASE_KEY_ALIAS'
$keyPassword = Require-EnvironmentVariable 'TESWA_RELEASE_KEY_PASSWORD'
$releaseApiBaseUrl = Require-EnvironmentVariable 'TESWA_RELEASE_API_BASE_URL'

# Official Google Play Console -> App Signature -> Upload key certificate SHA-256.
# Public certificate fingerprint, not a signing secret. Update only after an intentional Play upload-key reset.
$expectedUploadFingerprintDisplay = '9E:CE:E2:66:79:C8:7D:4F:6F:51:39:F1:96:7F:ED:20:01:06:C6:C0:FE:42:49:A8:31:8E:F8:84:90:FC:B7:F1'
$expectedUploadFingerprint = Normalize-Fingerprint $expectedUploadFingerprintDisplay

if (-not (Test-Path -LiteralPath $storeFile -PathType Leaf)) {
    throw "Keystore file not found: $storeFile"
}

$parsedReleaseUri = $null
if (-not [Uri]::TryCreate($releaseApiBaseUrl, [UriKind]::Absolute, [ref]$parsedReleaseUri)) {
    throw 'TESWA_RELEASE_API_BASE_URL must be an absolute URL.'
}
if ($parsedReleaseUri.Scheme -ne 'https' -or [string]::IsNullOrWhiteSpace($parsedReleaseUri.Host)) {
    throw 'TESWA_RELEASE_API_BASE_URL must use HTTPS and contain a host.'
}
if (-not [string]::IsNullOrWhiteSpace($parsedReleaseUri.Query) -or -not [string]::IsNullOrWhiteSpace($parsedReleaseUri.Fragment)) {
    throw 'TESWA_RELEASE_API_BASE_URL must not contain a query string or fragment.'
}

$keytool = Resolve-JdkTool 'keytool'
$jarsigner = Resolve-JdkTool 'jarsigner'

Write-Host 'Teswa native release gate'
Write-Host 'Package: com.teswa.mobile'
Write-Host 'Version: 1.0.11 (26)'
Write-Host "Release API: $releaseApiBaseUrl"
Write-Host "Keystore: $storeFile"
Write-Host "Alias: $keyAlias"
Write-Host "Expected Play upload-key SHA-256: $expectedUploadFingerprintDisplay"

$keytoolOutput = & $keytool -list -v -keystore $storeFile -alias $keyAlias '-storepass:env' 'TESWA_RELEASE_STORE_PASSWORD' 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "keytool could not inspect the configured keystore/alias. Verify the local file, alias, and store password."
}

$keytoolText = $keytoolOutput -join "`n"
$fingerprintMatch = [regex]::Match($keytoolText, 'SHA256:\s*([0-9A-Fa-f:]+)')
if (-not $fingerprintMatch.Success) {
    throw 'Could not read a SHA-256 certificate fingerprint from keytool output.'
}

$actualUploadFingerprint = Normalize-Fingerprint $fingerprintMatch.Groups[1].Value
if ($actualUploadFingerprint -ne $expectedUploadFingerprint) {
    throw "Upload-key fingerprint mismatch. The configured keystore is not the Google Play upload key registered for Teswa. Expected $expectedUploadFingerprintDisplay but found $($fingerprintMatch.Groups[1].Value)."
}

Write-Host "Upload-key SHA-256 matched Google Play: $($fingerprintMatch.Groups[1].Value)"

$gradleCommand = Get-Command 'gradle.bat' -ErrorAction SilentlyContinue
if ($null -eq $gradleCommand) {
    $gradleCommand = Get-Command 'gradle' -ErrorAction SilentlyContinue
}
if ($null -eq $gradleCommand) {
    throw 'Gradle was not found on PATH. Install/use Gradle 9.6.0 for this native project before running the release gate.'
}

Push-Location $androidRoot
try {
    & $gradleCommand.Source ':app:bundleRelease' '--stacktrace'
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle bundleRelease failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$aabPath = Join-Path $androidRoot 'app\build\outputs\bundle\release\app-release.aab'
if (-not (Test-Path -LiteralPath $aabPath -PathType Leaf)) {
    throw "Expected release AAB was not produced: $aabPath"
}

& $jarsigner -verify $aabPath
if ($LASTEXITCODE -ne 0) {
    throw 'jarsigner verification failed for the generated AAB.'
}

$aabHash = (Get-FileHash -LiteralPath $aabPath -Algorithm SHA256).Hash
Write-Host ''
Write-Host 'SIGNED AAB GATE COMPLETE'
Write-Host "AAB: $aabPath"
Write-Host "AAB SHA-256: $aabHash"
Write-Host 'Next authoritative gate: upload this AAB to Google Play Internal testing and update the existing Teswa install without uninstalling or clearing app data.'
