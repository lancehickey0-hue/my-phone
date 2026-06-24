package com.myphone.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

object VoskModelManager {

    private const val TAG = "VoskModelManager"
    private const val MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
    private const val MODEL_DIR_NAME = "vosk-model"
    private val mainHandler = Handler(Looper.getMainLooper())

    fun isModelReady(context: Context): Boolean {
        val modelDir = File(context.filesDir, MODEL_DIR_NAME)
        return modelDir.exists() && modelDir.list()?.isNotEmpty() == true
    }

    fun downloadModel(
        context: Context,
        onProgress: (Int) -> Unit,
        onComplete: () -> Unit,
        onError: (String) -> Unit
    ) {
        Thread {
            try {
                Log.d(TAG, "Starting Vosk model download")
                val url = URL(MODEL_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                conn.connect()
                val totalBytes = conn.contentLength
                var downloadedBytes = 0
                val zipFile = File(context.cacheDir, "vosk-model.zip")
                val output = FileOutputStream(zipFile)
                val input = conn.inputStream
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var lastReportedProgress = -1
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    downloadedBytes += bytesRead
                    if (totalBytes > 0) {
                        val progress = (downloadedBytes * 100 / totalBytes)
                        if (progress != lastReportedProgress) {
                            lastReportedProgress = progress
                            mainHandler.post { onProgress(progress) }
                        }
                    }
                }
                output.close()
                input.close()
                Log.d(TAG, "Download complete, extracting...")
                extractZip(zipFile, context.filesDir)
                zipFile.delete()
                Log.d(TAG, "Vosk model ready")
                mainHandler.post { onComplete() }
            } catch (e: Exception) {
                Log.e(TAG, "Download failed: " + e.message)
                mainHandler.post { onError(e.message ?: "Download failed") }
            }
        }.start()
    }

    private fun extractZip(zipFile: File, destDir: File) {
        val modelDir = File(destDir, MODEL_DIR_NAME)
        modelDir.mkdirs()
        ZipInputStream(zipFile.inputStream()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                val parts = entry.name.split("/", limit = 2)
                val relativePath = if (parts.size > 1) parts[1] else ""
                if (relativePath.isNotEmpty()) {
                    val outFile = File(modelDir, relativePath)
                    if (entry.isDirectory) {
                        outFile.mkdirs()
                    } else {
                        outFile.parentFile?.mkdirs()
                        FileOutputStream(outFile).use { out -> zip.copyTo(out) }
                    }
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
    }
}
