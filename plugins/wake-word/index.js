const {
  withAndroidManifest,
  withDangerousMod,
  withAppBuildGradle,
  withProjectBuildGradle,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withWakeWordService(config) {

  // ── 1. AndroidManifest ─────────────────────────────────────────────────────
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    const rootManifest = manifest.manifest;

    if (!app.service) app.service = [];
    if (!app.receiver) app.receiver = [];
    if (!rootManifest['uses-permission']) rootManifest['uses-permission'] = [];

    const hasBootPerm = rootManifest['uses-permission'].some(
      p => p.$?.['android:name'] === 'android.permission.RECEIVE_BOOT_COMPLETED'
    );
    if (!hasBootPerm) {
      rootManifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.RECEIVE_BOOT_COMPLETED' }
      });
    }

    const serviceExists = app.service.some(
      s => s.$?.['android:name'] === '.WakeWordService'
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': '.WakeWordService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      });
    }

    const bootExists = app.receiver.some(
      r => r.$?.['android:name'] === '.BootReceiver'
    );
    if (!bootExists) {
      app.receiver.push({
        $: {
          'android:name': '.BootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
          ],
        }],
      });
    }

    // Device Admin receiver — required for DevicePolicyManager.lockNow() to
    // work at all. Without this exact registration (permission + meta-data
    // + DEVICE_ADMIN_ENABLED intent-filter), Android silently refuses to let
    // the app become a device admin.
    const adminExists = app.receiver.some(
      r => r.$?.['android:name'] === '.LockDeviceAdminReceiver'
    );
    if (!adminExists) {
      app.receiver.push({
        $: {
          'android:name': '.LockDeviceAdminReceiver',
          'android:label': 'My-Phone Device Lock',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [{
          $: {
            'android:name': 'android.app.device_admin',
            'android:resource': '@xml/device_admin_policies',
          },
        }],
        'intent-filter': [{
          action: [
            { $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' } },
          ],
        }],
      });
    }

    return config;
  });

  // ── 2. Register WakeWordPackage in MainApplication ─────────────────────────
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    // Add import if missing
    if (!contents.includes('import com.myphone.app.WakeWordPackage')) {
      contents = contents.replace(
        'import expo.modules.ReactNativeHostWrapper',
        'import expo.modules.ReactNativeHostWrapper\nimport com.myphone.app.WakeWordPackage'
      );
    }

    // Add package registration if missing
    if (!contents.includes('packages.add(WakeWordPackage())')) {
      contents = contents.replace(
        'val packages = PackageList(this).packages',
        'val packages = PackageList(this).packages\n            packages.add(WakeWordPackage())'
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  // ── 3. Add Alphacephei Maven repo ──────────────────────────────────────────
  config = withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('alphacephei')) {
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects\s*\{[\s\S]*?repositories\s*\{/,
        (match) => match + '\n        maven { url "https://alphacephei.com/maven/" }'
      );
    }
    return config;
  });

  // ── 4. Add Vosk dependency ─────────────────────────────────────────────────
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('vosk-android')) {
      config.modResults.contents = config.modResults.contents.replace(
        'implementation("com.facebook.react:react-android")',
        'implementation("com.facebook.react:react-android")\n    implementation("com.alphacephei:vosk-android:0.3.47")'
      );
    }
    return config;
  });

  // ── 5. Copy Kotlin files ───────────────────────────────────────────────────
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.projectRoot;
      const srcDir = path.join(root, 'android/app/src/main/java/com/myphone/app');
      fs.mkdirSync(srcDir, { recursive: true });

      const wakeDir = path.join(root, 'plugins/wake-word');

      for (const f of [
        'WakeWordService.kt',
        'WakeWordModule.kt',
        'WakeWordPackage.kt',
        'BootReceiver.kt',
        'VoskModelManager.kt',
        'VoskHandler.kt',
        'LockDeviceAdminReceiver.kt',
      ]) {
        fs.copyFileSync(path.join(wakeDir, f), path.join(srcDir, f));
      }

      // Device admin policy resource (res/xml/device_admin_policies.xml)
      const xmlDestDir = path.join(root, 'android/app/src/main/res/xml');
      fs.mkdirSync(xmlDestDir, { recursive: true });
      fs.copyFileSync(
        path.join(wakeDir, 'res-xml/device_admin_policies.xml'),
        path.join(xmlDestDir, 'device_admin_policies.xml')
      );

      // Native alarm siren audio (res/raw/alarm.mp3) -- played directly from
      // WakeWordService via MediaPlayer so the alarm sounds immediately,
      // independent of the JS bridge being alive. Android's raw resource
      // system requires its own copy here; it can't reference the JS-side
      // assets/audio/alarm.mp3 used by expo-av.
      const rawDestDir = path.join(root, 'android/app/src/main/res/raw');
      fs.mkdirSync(rawDestDir, { recursive: true });
      fs.copyFileSync(
        path.join(wakeDir, 'res-raw/alarm.mp3'),
        path.join(rawDestDir, 'alarm.mp3')
      );

      return config;
    },
  ]);

  return config;
}

module.exports = withWakeWordService;
