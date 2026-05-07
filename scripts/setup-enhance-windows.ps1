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
    $triple = ($output | Select-String 'host:\s*(.+)').Matches.Groups[1].Value.Trim()
    return $triple
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
    $tauriDir = Join-Path $PSScriptRoot ".." "src-tauri"
    $binDir = Join-Path $tauriDir "binaries"
    $modelsDir = Join-Path $tauriDir "resources" "models"
    
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
    
    # Get latest upscayl-ncnn version
    $version = Get-LatestRelease -Repo "upscayl/upscayl-ncnn"
    Write-Host "Latest upscayl-ncnn version: $version" -ForegroundColor Green
    
    # Download upscayl-bin
    $zipName = "upscayl-bin-$version-windows.zip"
    $zipUrl = "https://github.com/upscayl/upscayl-ncnn/releases/download/$version/$zipName"
    $tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
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
    Write-Host "✓ Binary installed: $destBinary" -ForegroundColor Green
    
    # Download AI models
    Write-Host "`nDownloading AI models..." -ForegroundColor Cyan
    $modelsBase = "https://raw.githubusercontent.com/upscayl/custom-models/main/models"
    $models = @(
        "RealESRGAN_General_x4_v3",
        "realesr-animevideov3-x4",
        "4xLSDIRCompactC3",
        "4xNomos8kSC",
        "4x_NMKD-Siax_200k"
    )
    
    foreach ($model in $models) {
        Write-Host "  Downloading $model..." -ForegroundColor Gray
        
        $paramUrl = "$modelsBase/$model.param"
        $binUrl = "$modelsBase/$model.bin"
        $paramDest = Join-Path $modelsDir "$model.param"
        $binDest = Join-Path $modelsDir "$model.bin"
        
        try {
            Invoke-WebRequest -Uri $paramUrl -OutFile $paramDest -UseBasicParsing
            Invoke-WebRequest -Uri $binUrl -OutFile $binDest -UseBasicParsing
            Write-Host "  ✓ $model" -ForegroundColor Green
        } catch {
            Write-Error "Failed to download $model: $_"
        }
    }
    
    # Cleanup
    Remove-Item -Path $tempDir -Recurse -Force
    
    Write-Host "`n✓ Setup complete! Enhancement files installed successfully." -ForegroundColor Green
}

# Run
try {
    Setup-Enhancement
} catch {
    Write-Host "`n✗ Setup failed: $_" -ForegroundColor Red
    exit 1
}
