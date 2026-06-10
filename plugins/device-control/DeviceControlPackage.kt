package com.myphone.app

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class DeviceControlPackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DeviceControlModule.NAME) DeviceControlModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                DeviceControlModule.NAME to ReactModuleInfo(
                    DeviceControlModule.NAME,
                    DeviceControlModule.NAME,
                    false,
                    false,
                    false,
                    false
                )
            )
        }
    }
}
