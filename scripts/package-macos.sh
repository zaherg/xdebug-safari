#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export TMPDIR="$ROOT/.cache/tmp"
mkdir -p "$TMPDIR" "$ROOT/build"

PROJECT="$ROOT/macos/Xdebug Helper for Safari/Xdebug Helper for Safari.xcodeproj"
APP="$ROOT/build/macos/Build/Products/Release/Xdebug Helper for Safari.app"
EXTENSION="$APP/Contents/PlugIns/Xdebug Helper for Safari Extension.appex"
VERSION="$(node -p "require(process.argv[1]).version" "$ROOT/src/manifest.json")"

# Read signing configuration from the environment; never commit account details.
TEAM_ID="${TEAM_ID:-${APPLE_TEAM_ID:-}}"
: "${TEAM_ID:?Set TEAM_ID or APPLE_TEAM_ID to your Apple Developer team ID}"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-Developer ID Application}"

xcrun --find xcodebuild >/dev/null
xcodebuild -checkFirstLaunchStatus
node --test "$ROOT"/tests/*.test.cjs

xcodebuild \
    -project "$PROJECT" \
    -scheme 'Xdebug Helper for Safari' \
    -configuration Release \
    -destination "platform=macOS,arch=$(uname -m)" \
    -derivedDataPath "$ROOT/build/macos" \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_IDENTITY="$SIGNING_IDENTITY" \
    CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO \
    'CODE_SIGN_ENTITLEMENTS=$(SRCROOT)/$(TARGET_NAME)/Local.entitlements' \
    OTHER_CODE_SIGN_FLAGS='--timestamp' \
    MARKETING_VERSION="$VERSION" \
    CURRENT_PROJECT_VERSION=1 \
    MACOSX_DEPLOYMENT_TARGET=13.0 \
    ONLY_ACTIVE_ARCH=YES \
    build

codesign --verify --strict --verbose=2 "$EXTENSION"
codesign --verify --deep --strict --verbose=2 "$APP"
node "$ROOT/scripts/verify-macos.cjs" "$APP"

# A local archive only: no notarization, upload, or App Store submission.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ROOT/build/Xdebug Helper for Safari.zip"
printf '\nApp: %s\nZIP: %s\n' "$APP" "$ROOT/build/Xdebug Helper for Safari.zip"
