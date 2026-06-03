package com.myphone.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class MyPhoneDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Log.d("DeviceAdmin", "Device admin enabled")
    }
    override fun onDisabled(context: Context, intent: Intent) {
        Log.d("DeviceAdmin", "Device admin disabled")
    }
}
