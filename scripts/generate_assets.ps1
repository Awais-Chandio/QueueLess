# generate_assets.ps1
# Generates all launcher and splash icons for Android and iOS using .NET System.Drawing

[Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null

function Draw-Logo {
    param(
        [int]$Size,
        [string]$OutputPath,
        [string]$BackgroundColor, # "Transparent" or Hex (e.g. #FFFFFF)
        [string]$QColor,
        [string]$CrossColor,
        [bool]$IsRound = $false
    )

    # Ensure parent directory exists
    $dir = Split-Path -Path $OutputPath
    if (!(Test-Path -Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # 1. Clear background
    if ($BackgroundColor -and $BackgroundColor -ne "Transparent") {
        $color = [System.Drawing.ColorTranslator]::FromHtml($BackgroundColor)
        if ($IsRound) {
            $g.Clear([System.Drawing.Color]::Transparent)
            $brush = New-Object System.Drawing.SolidBrush($color)
            $g.FillEllipse($brush, 0, 0, $Size, $Size)
            $brush.Dispose()
        } else {
            $g.Clear($color)
        }
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    # 2. Dimensions & scales matching React Native SVG
    $scale = $Size / 100.0

    $xc = 50.0 * $scale
    $yc = 46.0 * $scale
    $r = 24.0 * $scale
    $wq = 8.0 * $scale
    $wc = 7.0 * $scale

    # 3. Draw Q Circle
    $qPenColor = [System.Drawing.ColorTranslator]::FromHtml($QColor)
    $qPen = New-Object System.Drawing.Pen($qPenColor, $wq)
    $qPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $qPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawEllipse($qPen, [float]($xc - $r), [float]($yc - $r), [float]($r * 2.0), [float]($r * 2.0))

    # 4. Draw Q Tail
    $xTailStart = 67.0 * $scale
    $yTailStart = 63.0 * $scale
    $xTailEnd = 83.0 * $scale
    $yTailEnd = 79.0 * $scale
    $g.DrawLine($qPen, [float]$xTailStart, [float]$yTailStart, [float]$xTailEnd, [float]$yTailEnd)

    # 5. Draw Medical Cross
    $crossPenColor = [System.Drawing.ColorTranslator]::FromHtml($CrossColor)
    $crossPen = New-Object System.Drawing.Pen($crossPenColor, $wc)
    $crossPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $crossPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    # Vertical line: from (50, 34) to (50, 58)
    $g.DrawLine($crossPen, [float]$xc, [float](34.0 * $scale), [float]$xc, [float](58.0 * $scale))
    # Horizontal line: from (38, 46) to (62, 46)
    $g.DrawLine($crossPen, [float](38.0 * $scale), [float]$yc, [float](62.0 * $scale), [float]$yc)

    # 6. Save and clean up
    $qPen.Dispose()
    $crossPen.Dispose()
    $g.Dispose()
    
    # Save as PNG
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated $OutputPath ($($Size)x$($Size))"
}

# Android resource folders path
$androidRes = "d:\QueueLess\android\app\src\main\res"

# Generate Android launcher icons (White background, blue Q, teal cross)
Write-Host "Generating Android Launcher Icons..."
Draw-Logo -Size 48   -OutputPath "$androidRes\mipmap-mdpi\ic_launcher.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 72   -OutputPath "$androidRes\mipmap-hdpi\ic_launcher.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 96   -OutputPath "$androidRes\mipmap-xhdpi\ic_launcher.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 144  -OutputPath "$androidRes\mipmap-xxhdpi\ic_launcher.png"        -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 192  -OutputPath "$androidRes\mipmap-xxxhdpi\ic_launcher.png"       -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"

# Generate Android launcher round icons (White background, blue Q, teal cross, circular background shape)
Write-Host "Generating Android Round Launcher Icons..."
Draw-Logo -Size 48   -OutputPath "$androidRes\mipmap-mdpi\ic_launcher_round.png"   -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6" -IsRound $true
Draw-Logo -Size 72   -OutputPath "$androidRes\mipmap-hdpi\ic_launcher_round.png"   -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6" -IsRound $true
Draw-Logo -Size 96   -OutputPath "$androidRes\mipmap-xhdpi\ic_launcher_round.png"   -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6" -IsRound $true
Draw-Logo -Size 144  -OutputPath "$androidRes\mipmap-xxhdpi\ic_launcher_round.png"  -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6" -IsRound $true
Draw-Logo -Size 192  -OutputPath "$androidRes\mipmap-xxxhdpi\ic_launcher_round.png" -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6" -IsRound $true

# Generate Android adaptive icon foreground (Transparent background, blue Q, teal cross)
Write-Host "Generating Android Adaptive Icon Foregrounds..."

function Draw-Logo-With-Padding {
    param(
        [int]$Size,
        [string]$OutputPath,
        [string]$BackgroundColor,
        [string]$QColor,
        [string]$CrossColor,
        [float]$PaddingPercent = 0.15,
        [bool]$IsRound = $false
    )

    $dir = Split-Path -Path $OutputPath
    if (!(Test-Path -Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($BackgroundColor -and $BackgroundColor -ne "Transparent") {
        $color = [System.Drawing.ColorTranslator]::FromHtml($BackgroundColor)
        if ($IsRound) {
            $g.Clear([System.Drawing.Color]::Transparent)
            $brush = New-Object System.Drawing.SolidBrush($color)
            $g.FillEllipse($brush, 0, 0, $Size, $Size)
            $brush.Dispose()
        } else {
            $g.Clear($color)
        }
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    $contentSize = $Size * (1.0 - (2.0 * $PaddingPercent))
    $offset = $Size * $PaddingPercent
    $scale = $contentSize / 100.0

    $xc = ($offset) + (50.0 * $scale)
    $yc = ($offset) + (46.0 * $scale)
    $r = 24.0 * $scale
    $wq = 8.0 * $scale
    $wc = 7.0 * $scale

    # Draw Q Circle
    $qPenColor = [System.Drawing.ColorTranslator]::FromHtml($QColor)
    $qPen = New-Object System.Drawing.Pen($qPenColor, $wq)
    $qPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $qPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawEllipse($qPen, [float]($xc - $r), [float]($yc - $r), [float]($r * 2.0), [float]($r * 2.0))

    # Draw Q Tail
    $xTailStart = ($offset) + (67.0 * $scale)
    $yTailStart = ($offset) + (63.0 * $scale)
    $xTailEnd = ($offset) + (83.0 * $scale)
    $yTailEnd = ($offset) + (79.0 * $scale)
    $g.DrawLine($qPen, [float]$xTailStart, [float]$yTailStart, [float]$xTailEnd, [float]$yTailEnd)

    # Draw Medical Cross
    $crossPenColor = [System.Drawing.ColorTranslator]::FromHtml($CrossColor)
    $crossPen = New-Object System.Drawing.Pen($crossPenColor, $wc)
    $crossPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $crossPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($crossPen, [float]$xc, [float]($offset + (34.0 * $scale)), [float]$xc, [float]($offset + (58.0 * $scale)))
    $g.DrawLine($crossPen, [float]($offset + (38.0 * $scale)), [float]$yc, [float]($offset + (62.0 * $scale)), [float]$yc)

    $qPen.Dispose()
    $crossPen.Dispose()
    $g.Dispose()
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated $OutputPath ($($Size)x$($Size)) with padding"
}

# Android Adaptive icon foreground dimensions: 108dp x 108dp. Safe zone is center 72dp (~16.6% padding)
Draw-Logo-With-Padding -Size 108  -OutputPath "$androidRes\mipmap-mdpi\ic_launcher_foreground.png"    -BackgroundColor "Transparent" -QColor "#2563EB" -CrossColor "#14B8A6" -PaddingPercent 0.22
Draw-Logo-With-Padding -Size 162  -OutputPath "$androidRes\mipmap-hdpi\ic_launcher_foreground.png"    -BackgroundColor "Transparent" -QColor "#2563EB" -CrossColor "#14B8A6" -PaddingPercent 0.22
Draw-Logo-With-Padding -Size 216  -OutputPath "$androidRes\mipmap-xhdpi\ic_launcher_foreground.png"   -BackgroundColor "Transparent" -QColor "#2563EB" -CrossColor "#14B8A6" -PaddingPercent 0.22
Draw-Logo-With-Padding -Size 324  -OutputPath "$androidRes\mipmap-xxhdpi\ic_launcher_foreground.png"  -BackgroundColor "Transparent" -QColor "#2563EB" -CrossColor "#14B8A6" -PaddingPercent 0.22
Draw-Logo-With-Padding -Size 432  -OutputPath "$androidRes\mipmap-xxxhdpi\ic_launcher_foreground.png" -BackgroundColor "Transparent" -QColor "#2563EB" -CrossColor "#14B8A6" -PaddingPercent 0.22

# Generate Android Native Splash Logo (Transparent background, Solid White logo)
Write-Host "Generating Android Native Splash Logo..."
Draw-Logo-With-Padding -Size 288  -OutputPath "$androidRes\drawable-nodpi\splash_logo.png"            -BackgroundColor "Transparent" -QColor "#FFFFFF" -CrossColor "#FFFFFF" -PaddingPercent 0.10

# Generate iOS App Icons (White background, blue Q, teal cross)
Write-Host "Generating iOS App Icons..."
$iosAppIconDir = "d:\QueueLess\ios\QueueLess\Images.xcassets\AppIcon.appiconset"
Draw-Logo -Size 40   -OutputPath "$iosAppIconDir\Icon-20@2x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 60   -OutputPath "$iosAppIconDir\Icon-20@3x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 58   -OutputPath "$iosAppIconDir\Icon-29@2x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 87   -OutputPath "$iosAppIconDir\Icon-29@3x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 80   -OutputPath "$iosAppIconDir\Icon-40@2x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 120  -OutputPath "$iosAppIconDir\Icon-40@3x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 120  -OutputPath "$iosAppIconDir\Icon-60@2x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 180  -OutputPath "$iosAppIconDir\Icon-60@3x.png"         -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"
Draw-Logo -Size 1024 -OutputPath "$iosAppIconDir\QueueLess-AppIcon-1024.png" -BackgroundColor "#FFFFFF" -QColor "#2563EB" -CrossColor "#14B8A6"

# Generate iOS Launch Screen Logos (Transparent background, Solid White logo)
Write-Host "Generating iOS Launch Screen Logos..."
$iosLaunchLogoDir = "d:\QueueLess\ios\QueueLess\Images.xcassets\LaunchLogo.imageset"
Draw-Logo -Size 160  -OutputPath "$iosLaunchLogoDir\LaunchLogo.png"      -BackgroundColor "Transparent" -QColor "#FFFFFF" -CrossColor "#FFFFFF"
Draw-Logo -Size 320  -OutputPath "$iosLaunchLogoDir\LaunchLogo@2x.png"   -BackgroundColor "Transparent" -QColor "#FFFFFF" -CrossColor "#FFFFFF"
Draw-Logo -Size 480  -OutputPath "$iosLaunchLogoDir\LaunchLogo@3x.png"   -BackgroundColor "Transparent" -QColor "#FFFFFF" -CrossColor "#FFFFFF"

Write-Host "All assets generated successfully!"
