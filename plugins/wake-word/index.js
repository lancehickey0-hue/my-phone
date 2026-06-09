const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withWakeWordService(config) {
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.service) app.service = [];

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

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.projectRoot;
      const srcDir = path.join(root, 'android/app/src/main/java/com/myphone/app');
      fs.mkdirSync(srcDir, { recursive: true });

      const wakeDir = path.join(root, 'plugins/wake-word');

      for (const f of ['WakeWordService.kt', 'WakeWordModule.kt', 'WakeWordPackage.kt']) {
        fs.copyFileSync(path.join(wakeDir, f), path.join(srcDir, f));
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withWakeWordService;
