# I3 App - Android APK Build Guide

## Required installations

1. **Node.js** (LTS, recommended: 18+) - [nodejs.org](https://nodejs.org)
2. **Java JDK 17** - [adoptium.net](https://adoptium.net)
3. **Android Studio** (includes Android SDK and build tools) - [developer.android.com/studio](https://developer.android.com/studio)
4. **Android SDK Platform-Tools** (for `adb`) - install via Android Studio SDK Manager

After installing Android Studio, open it once and let it complete the SDK setup. It will install the SDK to a path like:

- Windows: `C:\Users\<you>\AppData\Local\Android\Sdk`

## One-time setup

```bash
npm install
```

## Build APK

### 1) Sync web assets into Android project

Run this every time you change the web code before rebuilding the APK:

```bash
npm run cap:sync
```

This builds the mobile bundle into `dist-mobile` and syncs it into `android/`.

### 2) Debug APK

```bash
npm run android:build
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 3) Release APK

```bash
npm run android:release
```

Output: `android/app/build/outputs/apk/release/`

Note: release APKs require signing before distribution.

## Install APK on device

### Option A: ADB (recommended)

1. On your Android phone, go to **Settings > About phone** and tap **Build number** 7 times to enable Developer options.
2. Go to **Settings > Developer options** and enable **USB debugging**.
3. Connect phone via USB and run:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` replaces an existing installation.

### Option B: Manual install

1. Copy the APK file to your phone.
2. Open the file on the phone and tap Install.
3. If prompted, allow installs from unknown sources for that app.

## Troubleshooting

### Android SDK not found

Verify that `android/local.properties` contains the correct path to your SDK:

```
sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

If the file is missing, create it manually with the above content.

### Gradle build fails with JDK error

Ensure JDK 17 is installed. In Android Studio, go to **File > Settings > Build, Execution, Deployment > Build Tools > Gradle** and set the Gradle JDK to 17.

### `adb` not found

Add platform-tools to your PATH. Default location on Windows:

```
C:\Users\<you>\AppData\Local\Android\Sdk\platform-tools
```
