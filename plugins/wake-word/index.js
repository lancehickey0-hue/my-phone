const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withWakeWordService(config) {
  // Add service to AndroidManifest.xml
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

  // Copy Kotlin file to android source
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const srcDir = path.join(
        config.modRequest.projectRoot,
        'android/app/src/main/java/com/myphone/app'
      );
      
      fs.mkdirSync(srcDir, { recursive: true });
      
      fs.copyFileSync(
        path.join(config.modRequest.projectRoot, 'plugins/wake-word/WakeWordService.kt'),
        path.join(srcDir, 'WakeWordService.kt')
      );

      return config;
    },
  ]);

  return config;
}

module.exports = withWakeWordService;
