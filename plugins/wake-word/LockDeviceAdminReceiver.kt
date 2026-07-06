package com.myphone.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

// Required companion class for DevicePolicyManager-based locking.
// Android will not let an app become a device admin, and therefore will not
// honor DevicePolicyManager.lockNow(), unless a BroadcastReceiver extending
// DeviceAdminReceiver is registered in the manifest and referenced from the
// admin request intent (see WakeWordModule.requestDeviceAdmin()).
class LockDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d("LockDeviceAdminReceiver", "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d("LockDeviceAdminReceiver", "Device admin disabled")
    }
}
