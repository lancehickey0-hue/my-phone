const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withWakeWordService(config) {

  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.service) app.service = [];
    if (!app.receiver) app.receiver = [];

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

    const receiverExists = app.receiver.some(
      r => r.$?.['android:name'] === '.MyPhoneDeviceAdminReceiver'
    );
    if (!receiverExists) {
      app.receiver.push({
        $: {
          'android:name': '.MyPhoneDeviceAdminReceiver',
          'android:exported': 'true',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
        },
        'meta-data': [{
          $: {
            'android:name': 'android.app.device_admin',
            'android:resource': '@xml/device_admin_policies',
          },
        }],
        'intent-filter': [{
          action: [{
            $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' },
          }],
        }],
      });
    }

    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('androidx.biometric')) {
      config.modResults.contents = config.modResults.contents.replace(
        'implementation("com.facebook.react:react-android")',
        'implementation("com.facebook.react:react-android")\n    implementation("androidx.biometric:biometric:1.1.0")'
      );
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.projectRoot;
      const srcDir = path.join(root, 'android/app/src/main/java/com/myphone/app');
      fs.mkdirSync(srcDir, { recursive: true });

      const xmlDir = path.join(root, 'android/app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });

      const wakeDir = path.join(root, 'plugins/wake-word');
      const deviceDir = path.join(root, 'plugins/device-control');

      for (const f of ['WakeWordService.kt', 'WakeWordModule.kt', 'WakeWordPackage.kt']) {
        fs.copyFileSync(path.join(wakeDir, f), path.join(srcDir, f));
      }

      for (const f of ['DeviceControlModule.kt', 'DeviceControlPackage.kt', 'MyPhoneDeviceAdminReceiver.kt']) {
        fs.copyFileSync(path.join(deviceDir, f), path.join(srcDir, f));
      }

      fs.copyFileSync(
        path.join(deviceDir, 'device_admin_policies.xml'),
        path.join(xmlDir, 'device_admin_policies.xml')
      );

      return config;
    },
  ]);

  return config;
}

module.exports = withWakeWordService;
