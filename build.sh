#!/bin/bash
set -e

APP_NAME="System Designer"
EXECUTABLE="SystemDesigner"
BUILD_DIR="build"
APP_BUNDLE="${BUILD_DIR}/${APP_NAME}.app"
MIN_MACOS="15.0"

# UNIVERSAL=1 builds for both Apple silicon and Intel.
if [ "${UNIVERSAL:-0}" = "1" ]; then
    ARCHS="arm64 x86_64"
else
    ARCHS="$(uname -m)"
fi

rm -rf "${BUILD_DIR}"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

echo "Compiling (${ARCHS})..."
BINARIES=()
for ARCH in ${ARCHS}; do
    OUT="${BUILD_DIR}/${EXECUTABLE}-${ARCH}"
    xcrun swiftc \
        -parse-as-library \
        -swift-version 5 \
        -O \
        -target "${ARCH}-apple-macos${MIN_MACOS}" \
        -o "${OUT}" \
        src/*.swift \
        -framework AppKit \
        -framework Foundation \
        -framework WebKit \
        -framework Security \
        -framework UniformTypeIdentifiers
    BINARIES+=("${OUT}")
done
lipo -create "${BINARIES[@]}" -output "${APP_BUNDLE}/Contents/MacOS/${EXECUTABLE}"
rm -f "${BINARIES[@]}"

cp Info.plist "${APP_BUNDLE}/Contents/Info.plist"
cp -R web "${APP_BUNDLE}/Contents/Resources/web"
if [ -f Resources/Icon/AppIcon.icns ]; then
    cp Resources/Icon/AppIcon.icns "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"
fi

echo "Signing app..."
codesign --force --deep --sign - "${APP_BUNDLE}"

echo "Done: ${APP_BUNDLE}"
