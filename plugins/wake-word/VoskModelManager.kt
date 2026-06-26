package com.myphone.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream

object VoskModelManager {

    private const val TAG = "VoskModelManager"
    private const val MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
    private const val MODEL_DIR_NAME = "vosk-model"
    // Written only after a fully successful extraction; absence means the model is incomplete.
    private const val SENTINEL = ".complete"
    private val mainHandler = Handler(Looper.getMainLooper())

    fun isModelReady(context: Context): Boolean {
        val modelDir = File(context.filesDir, MODEL_DIR_NAME)
        return File(modelDir, SENTINEL).exists()
    }

    fun downloadModel(
        context: Context,
        onProgress: (Int) -> Unit,
        onComplete: () -> Unit,
        onError: (String) -> Unit
    ) {
        val settled = AtomicBoolean(false)
        fun resolve() { if (settled.compareAndSet(false, true)) mainHandler.post { onComplete() } }
        fun reject(msg: String) { if (settled.compareAndSet(false, true)) mainHandler.post { onError(msg) } }

        Thread {
            val zipFile = File(context.cacheDir, "vosk-model.zip")
            try {
                Log.d(TAG, "Starting Vosk model download")
                val url = URL(MODEL_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 120000
                conn.connect()
                val totalBytes = conn.contentLength
                var downloadedBytes = 0
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var lastReportedProgress = -1
                FileOutputStream(zipFile).use { output ->
                    conn.inputStream.use { input ->
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
                    }
                }
                Log.d(TAG, "Download complete, extracting...")
                extractZip(zipFile, context.filesDir)
                Log.d(TAG, "Vosk model ready")
                resolve()
            } catch (e: Throwable) {
                Log.e(TAG, "Download failed: " + e.message)
                File(context.filesDir, MODEL_DIR_NAME).deleteRecursively()
                reject(e.message ?: "Download failed")
            } finally {
                zipFile.delete()
            }
        }.start()
    }

    private fun extractZip(zipFile: File, destDir: File) {
        val modelDir = File(destDir, MODEL_DIR_NAME)
        // Wipe any previous partial extraction before writing new files.
        modelDir.deleteRecursively()
        modelDir.mkdirs()
        ZipInputStream(zipFile.inputStream()).use { zip ->
            var stripPrefix: String? = null
            var entry = zip.nextEntry
            while (entry != null) {
                if (stripPrefix == null) {
                    val slash = entry.name.indexOf('/')
                    stripPrefix = if (slash > 0) entry.name.substring(0, slash + 1) else ""
                }
                val relativePath = entry.name.removePrefix(stripPrefix!!)
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
        // Sentinel written only after every entry is extracted successfully.
        File(modelDir, SENTINEL).createNewFile()
    }
}
