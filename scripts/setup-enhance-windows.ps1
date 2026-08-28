#Requires -Version 5.1

<#
.SYNOPSIS
    Download upscayl-bin and AI models for Windows
.DESCRIPTION
    Fetches the latest upscayl-ncnn release and AI models from GitHub
    for texture upscaling enhancement functionality.
#>

$ErrorActionPreference = 'Stop'

# Detect Rust target triple
function Get-RustTriple {
    $output = & rustc -vV 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to detect Rust toolchain. Is Rust installed?"
    }
    $match = $output | Select-String 'host:\s*(.+)'
    if (-not $match -or $match.Matches.Count -eq 0) {
        Write-Error "Could not parse Rust target triple from rustc output:`n$output"
    }
    return $match.Matches.Groups[1].Value.Trim()
}

# Get latest release tag from GitHub
function Get-LatestRelease {
    param([string]$Repo)
    
    Write-Host "Fetching latest release for $Repo..." -ForegroundColor Cyan
    
    try {
        $response = Invoke-WebRequest -Uri "https://api.github.com/repos/$Repo/releases/latest" `
                                       -UseBasicParsing -ErrorAction Stop
        $release = $response.Content | ConvertFrom-Json
        return $release.tag_name
    } catch {
        Write-Error "Failed to fetch latest release: $_"
    }
}

# Main setup
function Setup-Enhancement {
    $triple = Get-RustTriple
    Write-Host "Detected Rust triple: $triple" -ForegroundColor Green
    
    # Directories
    $tauriDir = Join-Path (Join-Path $PSScriptRoot "..") "src-tauri"
    $binDir = Join-Path $tauriDir "binaries"
    $modelsDir = Join-Path (Join-Path $tauriDir "resources") "models"
    
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
    
    # Get latest upscayl-ncnn version
    $version = Get-LatestRelease -Repo "upscayl/upscayl-ncnn"
    Write-Host "Latest upscayl-ncnn version: $version" -ForegroundColor Green
    
    # Download upscayl-bin
    $zipName = "upscayl-bin-$version-windows.zip"
    $zipUrl = "https://github.com/upscayl/upscayl-ncnn/releases/download/$version/$zipName"
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    $zipPath = Join-Path $tempDir $zipName
    
    Write-Host "Downloading $zipName..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Error "Failed to download upscayl-bin: $_"
    }
    
    # Extract binary
    Write-Host "Extracting binary..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
    
    $exePath = Get-ChildItem -Path $tempDir -Filter "upscayl-bin.exe" -Recurse | Select-Object -First 1
    if (-not $exePath) {
        Write-Error "upscayl-bin.exe not found in archive"
    }
    
    $destBinary = Join-Path $binDir "upscayl-bin-$triple.exe"
    Copy-Item -Path $exePath.FullName -Destination $destBinary -Force
    Write-Host "[OK] Binary installed: $destBinary" -ForegroundColor Green
    
    # Extract/download AI models — prefer files bundled in the zip, fall back to custom-models
    Write-Host "`nExtracting/downloading AI models..." -ForegroundColor Cyan
    $modelsBase = "https://raw.githubusercontent.com/upscayl/custom-models/main/models"
    $models = @(
        "RealESRGAN_General_x4_v3",
        "realesr-animevideov3-x4",
        "4xLSDIRCompactC3",
        "4xNomos8kSC",
        "4x_NMKD-Siax_200k"
    )

    foreach ($model in $models) {
        $paramDest = Join-Path $modelsDir "$model.param"
        $binDest   = Join-Path $modelsDir "$model.bin"

        $paramInZip = Get-ChildItem -Path $tempDir -Filter "$model.param" -Recurse | Select-Object -First 1
        $binInZip   = Get-ChildItem -Path $tempDir -Filter "$model.bin"   -Recurse | Select-Object -First 1

        if ($paramInZip -and $binInZip) {
            Write-Host "  Extracting $model from zip" -ForegroundColor Gray
            Copy-Item $paramInZip.FullName $paramDest -Force
            Copy-Item $binInZip.FullName   $binDest   -Force
        } else {
            Write-Host "  Downloading $model from upscayl/custom-models" -ForegroundColor Gray
            try {
                Invoke-WebRequest -Uri "$modelsBase/$model.param" -OutFile $paramDest -UseBasicParsing
                Invoke-WebRequest -Uri "$modelsBase/$model.bin"   -OutFile $binDest   -UseBasicParsing
            } catch {
                Write-Error "Failed to download ${model}: $_"
            }
        }
        Write-Host "  [OK] $model" -ForegroundColor Green
    }
    
    # Cleanup
    Remove-Item -Path $tempDir -Recurse -Force
    
    Write-Host "`n[OK] Setup complete! Enhancement files installed successfully." -ForegroundColor Green
}

# Run
try {
    Setup-Enhancement
} catch {
    Write-Host "`n[FAIL] Setup failed: $_" -ForegroundColor Red
    exit 1
}
