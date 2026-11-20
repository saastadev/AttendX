# AttendX Android app plan

**Recommendation: a Capacitor app that loads the live AttendX site, with native
plugins for GPS, camera and push.** It uses the same toolchain Saasta already
ships fAImily with (Capacitor 8, compileSdk 36, minSdk 24, Play Console account
in place).

## Why this approach

- AttendX is a server-rendered Next.js app with API routes and server-side
  auth checks (`proxy.ts`). Unlike fAImily's Vite app, it can't be packed into
  the APK as static files. The app loads the live site instead
  (`server.url` = the AttendX domain), so every web deploy updates the app
  without a Play release.
- Native plugins give what a plain web view can't do reliably: accurate GPS
  with mock-location detection for check-in, the camera for selfies, and push
  notifications for approvals.
- A Trusted Web Activity (TWA) would be simpler, but it depends on Chrome on
  the device and gives no native GPS, camera or push control. Play also tends
  to reject thin web wrappers; native features avoid that.

## What goes in the app

| Need | Plugin | Notes |
|---|---|---|
| Check-in location | `@capacitor/geolocation` | High accuracy; reject mock locations (`isMock` on Android) |
| Check-in selfie | `@capacitor/camera` | Front camera, compressed under the 5 MB server cap |
| Leave / approval alerts | `@capacitor/push-notifications` (Firebase) | Needs a server sender (FCM) |
| Back button, links | `@capacitor/app` | Deep links into leave, approvals, notifications |
| Look and feel | `@capacitor/splash-screen`, `@capacitor/status-bar` | Brand colours |
| Offline clock-in | Existing IndexedDB queue + service worker | Already in the web app |

Only foreground location is requested (during check-in). No background
location: it needs a special Play review and AttendX doesn't need it.

## Steps

1. **Server first.** AttendX must be live on Hostinger with HTTPS (see
   `deploy/hostinger/README.md`); the app points at that domain.
2. **Scaffold** `attendx-v2/android` with Capacitor. App ID suggestion:
   `com.saasta.attendx`.
3. **Native bridges.** Small client wrapper: use the native plugin when running
   inside the app, the browser API otherwise. Pages don't change.
4. **Push.** Firebase project, store device tokens in the existing
   `push_tokens` table, send from server events (leave approved, approval
   waiting).
5. **Signing.** New upload keystore kept outside the repo; Play App Signing on.
6. **Play listing.** Privacy policy, Data safety form (location, camera,
   personal info), screenshots. Internal testing track first, then production.

## Decisions needed

- App ID and display name (suggested `com.saasta.attendx`, "AttendX").
- Use Saasta's existing Play Console account (the one fAImily uses)?
- Push notifications in the first release, or a later update?
