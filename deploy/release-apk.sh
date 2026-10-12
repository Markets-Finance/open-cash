#!/usr/bin/env bash
set -euo pipefail
version="${1:?usage: deploy/release-apk.sh <version e.g. 1.0.2> [notes]}"
notes="${2:-OpenCash $version}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3"; exit 1; }
repo="${RELEASE_REPO:-Markets-Finance/open-cash}"
root="$(cd "$(dirname "$0")/.." && pwd)"
IFS=. read -r major minor patch <<<"$version"
code=$((major * 10000 + minor * 100 + patch))

node -e '
const fs = require("fs");
const file = process.argv[1];
const app = JSON.parse(fs.readFileSync(file, "utf8"));
app.expo.version = process.argv[2];
app.expo.android.versionCode = Number(process.argv[3]);
fs.writeFileSync(file, JSON.stringify(app, null, 2) + "\n");
' "$root/mobile/app.json" "$version" "$code"
sed -i '' -E "s/versionCode [0-9]+/versionCode $code/; s/versionName \"[^\"]+\"/versionName \"$version\"/" "$root/mobile/android/app/build.gradle"

cd "$root/mobile/android"
EXPO_PUBLIC_BACKEND_URL=https://hl-api.opencash.in EXPO_PUBLIC_HL_NETWORK=mainnet \
  ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a -q
apk="$root/mobile/android/app/build/outputs/apk/release/OpenCash.apk"
cp "$root/mobile/android/app/build/outputs/apk/release/app-release.apk" "$apk"

gh release create "v$version" "$apk" --repo "$repo" --title "OpenCash $version" --notes "$notes"
aws s3 cp "$apk" s3://opencash-hl-downloads/opencash.apk --region ap-southeast-2 \
  --content-type application/vnd.android.package-archive --content-disposition 'attachment; filename="OpenCash.apk"'
echo "released v$version (versionCode $code)"
