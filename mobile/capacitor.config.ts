import type { CapacitorConfig } from "@capacitor/cli";

// AttendX is a server-rendered Next.js app, so unlike fAImily its screens
// can't ship inside the APK. The app opens the live site instead: every web
// deploy updates the app with no new APK. Override the address for a test
// build with ATTENDX_URL=https://... npm run apk:debug
const url = process.env.ATTENDX_URL ?? "https://attendx.saastatech.com";

const config: CapacitorConfig = {
  appId: "com.saasta.attendx",
  appName: "AttendX",
  // Only the offline page lives in the APK; it shows when the site can't load.
  webDir: "www",
  server: {
    url,
    errorPath: "offline.html",
    // Links to other sites open in the phone's browser, not inside the app.
    allowNavigation: [new URL(url).hostname],
  },
  android: {
    // Android 7+ with a modern WebView.
    minWebViewVersion: 80,
    // The site is HTTPS only; never load plain HTTP inside the app.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0B1628",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      backgroundColor: "#0B1628",
      style: "DARK",
      overlaysWebView: false,
    },
  },
};

export default config;
