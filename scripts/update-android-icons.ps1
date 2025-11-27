param(
    [string]$Source = "public/nelitlogo.png"
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path "$root/.."
$sourcePath = Join-Path $projectRoot $Source
if (!(Test-Path $sourcePath)) {
    Write-Error "Source image not found at $sourcePath"
    exit 1
}

$mipmapSpecs = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}

foreach ($entry in $mipmapSpecs.GetEnumerator()) {
    $folder = Join-Path $projectRoot "android/app/src/main/res/$($entry.Key)"
    if (!(Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
    $size = $entry.Value
    $dest = Join-Path $folder "ic_launcher.png"
    $destFg = Join-Path $folder "ic_launcher_foreground.png"
    $destRound = Join-Path $folder "ic_launcher_round.png"
    # If ImageMagick convert exists, use it to resize; otherwise copy source as fallback
    $convert = Get-Command convert -ErrorAction SilentlyContinue
    if ($convert) {
        & $convert $sourcePath -resize ${size}x${size} $dest
        & $convert $sourcePath -resize ${size}x${size} $destFg
        & $convert $sourcePath -resize ${size}x${size} $destRound
        Write-Output "Wrote $dest, $destFg, $destRound ($size x $size)"
    } else {
        Copy-Item $sourcePath $dest -Force
        Copy-Item $sourcePath $destFg -Force
        Copy-Item $sourcePath $destRound -Force
        Write-Output "Copied $sourcePath to $dest, $destFg, $destRound (ImageMagick not found, no resize)"
    }
}

# Ensure mipmap-anydpi-v26 uses have foreground xml referencing @mipmap/ic_launcher_foreground
$anydpi = Join-Path $projectRoot "android/app/src/main/res/mipmap-anydpi-v26"
if (!(Test-Path $anydpi)) { New-Item -ItemType Directory -Path $anydpi | Out-Null }


Write-Output "Icon update complete. Rebuild the Android project to see changes."
