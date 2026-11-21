# AttendX for Android

A Capacitor app (`com.saasta.attendx`) that opens the live AttendX site. AttendX
is a server-rendered Next.js app, so its screens can't ship inside the APK the
way fAImily's do: every web deploy updates the app, and a new APK is needed
only when this folder changes (icon, permissions, address, plugins).

- Address: `https://attendx.saastatech.com` (`capacitor.config.ts`)
- Check-in works as on the web: the page asks for location and opens the front
  camera; Android asks the employee for each permission the first time.
  No background location.
- With no internet the app shows `www/offline.html`; after the first visit the
  site's own offline page (service worker) takes over.

## Build

Needs Java 21 (`brew install openjdk@21`) and the Android SDK.

    cd mobile
    npm ci
    export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
    echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

Signed release APK (the one people download from saastatech.com):

    npm run apk:release     # android/app/build/outputs/apk/release/app-release.apk

Test build against another address:

    ATTENDX_URL=https://attendx.187-127-159-192.sslip.io npm run apk:debug

`npm run sync` writes the address into the APK, so run a plain
`npm run apk:release` (no `ATTENDX_URL`) before publishing.

## Signing key

Release builds are signed with the AttendX key, kept **outside the repo** in
`~/.attendx/` (`attendx-release.keystore` + `keystore.properties`). Copy
`~/.attendx/keystore.properties` to `mobile/android/keystore.properties`
(git-ignored) before `apk:release`.

**Back both files up somewhere safe (password manager or company drive).**
Every future update must be signed with the same key; if it's lost, people
have to uninstall the app and install it again.

Certificate SHA-256:
`51:21:49:84:BD:42:4F:E7:A9:6D:B2:DE:A9:88:D2:30:8F:D5:3E:06:8C:05:B7:15:ED:8B:DE:39:2A:4D:08:57`

## Releasing an update

1. Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`.
2. `npm run apk:release`.
3. Replace `public/downloads/AttendX.apk` on the Saasta website and update the
   version and size shown on the Products page.

## Later

- Google Play: `./gradlew bundleRelease` gives the `.aab`; Play listing needs a
  privacy policy and the Data safety form (location, camera, personal info).
- Push notifications (leave approvals) with `@capacitor/push-notifications`.
- Icons: `python3 tools/make-icons.py` rebuilds them from the web app's icon.
