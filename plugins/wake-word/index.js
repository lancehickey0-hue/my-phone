const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
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

  // Copy Kotlin files to android source
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const srcDir = path.join(
        config.modRequest.projectRoot,
        'android/app/src/main/java/com/myphone/app'
      );
      
      fs.mkdirSync(srcDir, { recursive: true });
      
      const pluginDir = path.join(config.modRequest.projectRoot, 'plugins/wake-word');
      
      fs.copyFileSync(
        path.join(pluginDir, 'WakeWordService.kt'),
        path.join(srcDir, 'WakeWordService.kt')
      );
      
      fs.copyFileSync(
        path.join(pluginDir, 'WakeWordModule.kt'),
        path.join(srcDir, 'WakeWordModule.kt')
      );

      fs.copyFileSync(
        path.join(pluginDir, 'WakeWordPackage.kt'),
        path.join(srcDir, 'WakeWordPackage.kt')
      );

      return config;
    },
  ]);

  // Register the package in MainApplication
  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;
    
    if (!contents.includes('WakeWordPackage')) {
      config.modResults.contents = contents.replace(
        'packages.add(new ReactNativeHostWrapper(this, new DefaultReactNativeHost(this)',
        'packages.add(new WakeWordPackage());\n        packages.add(new ReactNativeHostWrapper(this, new DefaultReactNativeHost(this)'
      );
    }
    
    return config;
  });

  return config;
}

module.exports = withWakeWordService;
