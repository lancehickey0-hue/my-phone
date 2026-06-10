package com.myphone.app

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class WakeWordPackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == WakeWordModule.NAME) WakeWordModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                WakeWordModule.NAME to ReactModuleInfo(
                    WakeWordModule.NAME,
                    WakeWordModule.NAME,
                    false,
                    false,
                    false,
                    false
                )
            )
        }
    }
}
