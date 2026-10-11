# Hood to-do

Saved 2026-10-12.

## APK and passkeys

What changed:
- App ID: `xyz.opencash.hl`. It sits alongside the Monad app on the same phone, and the old emulator build didn't need uninstalling.
- Passkey domain: `hl.opencash.in`, for the web app, the Android app and the iOS setting.
- `assetlinks.json`: it lists `xyz.opencash.hl` with only the release key fingerprint. It's served from the HL site itself, so the bare `opencash.in` domain stays free and nothing touches `monad.opencash.in`.
- Saved for Monad: its to-do now says to switch to `xyz.opencash.monad` and `monad.opencash.in`. It still uses the shared app ID and a placeholder passkey domain.

A catch worth knowing: the first rebuild silently reused the old app code. Gradle didn't notice the change, because it lives in the shared package outside the mobile folder, so that APK would have shipped the old passkey domain. Always build with:

```bash
cd mobile/android
EXPO_PUBLIC_BACKEND_URL=https://hl-api.opencash.in EXPO_PUBLIC_HL_NETWORK=mainnet \
  ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease
```

APK status:
- Signing: signed with the release key (confirmed with Android's `apksigner`) and the app ID is correct.
- Settings: it points at `hl-api.opencash.in` on mainnet.
- Launch: on the emulator it opens cleanly to the sign-in screen, with no errors in the log.
- Location: `mobile/android/app/build/outputs/apk/release/app-release.apk`.

Before passkey sign-in works in the APK:
1. [ ] Attach `hl.opencash.in` to `opencash-hl` in the Cloudflare dashboard.
2. [x] Deploy the web app, so `hl.opencash.in/.well-known/assetlinks.json` is live. Deployed 2026-10-12 with the kill switch; the file serves at `opencash-hl.pages.dev/.well-known/assetlinks.json` and goes live on `hl.opencash.in` once step 1 is done.
3. [ ] Back up `~/.opencash/opencash-release.keystore` and the `OPENCASH_UPLOAD_*` lines in `~/.gradle/gradle.properties`. Without them, you can't ship updates to installed copies of the app.

After those, test real passkey sign-up on the emulator. That needs a Google account signed in on the emulator.

## Current state

- Kill switch is ON (2026-10-12): API routes 404 except `/health`, bot runner paused, web routes except the landing page show the 404 page. Turn off with `SERVER=ubuntu@54.253.119.105 deploy/kill.sh off`.
