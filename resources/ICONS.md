# App Icons

This folder should contain the application icons for different platforms.

## Required Files

- `icon.ico` - Windows icon (256x256 minimum, can include multiple sizes)
- `icon.icns` - macOS icon (512x512 recommended)
- `icon.png` - Linux icon (512x512 PNG)

## Generating Icons from SVG

The `icon.svg` file is the source design. You can convert it to platform-specific formats using these methods:

### Option 1: Online Converters
- [CloudConvert](https://cloudconvert.com/svg-to-ico) - SVG to ICO
- [iConvert Icons](https://iconverticons.com/online/) - All formats
- [PNG to ICO](https://www.icoconverter.com/) - PNG to ICO (convert SVG to PNG first)

### Option 2: Command Line (requires ImageMagick)

```bash
# Install ImageMagick first
# Windows: choco install imagemagick
# macOS: brew install imagemagick
# Linux: apt install imagemagick

# Generate PNG (512x512)
convert -background none -resize 512x512 icon.svg icon.png

# Generate ICO (Windows - multiple sizes)
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Generate ICNS (macOS - requires iconutil on macOS)
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

### Option 3: electron-icon-maker (npm package)

```bash
npm install -g electron-icon-maker
electron-icon-maker --input=icon.png --output=./
```

## Placeholder Icons

Until proper icons are generated, the build may fail. Create placeholder icons:

```bash
# Create a simple 512x512 placeholder PNG
# Then convert to other formats as shown above
```

## Icon Design Guidelines

- **Windows**: ICO format, minimum 256x256, ideally include 16, 32, 48, 64, 128, 256 sizes
- **macOS**: ICNS format, must include 512x512 and 1024x1024 for Retina
- **Linux**: PNG format, 512x512 recommended

The icon should be visible and recognizable at small sizes (16x16) as well as large sizes.
