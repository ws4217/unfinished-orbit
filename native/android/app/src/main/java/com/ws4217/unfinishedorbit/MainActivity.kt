package com.ws4217.unfinishedorbit

import android.app.Activity
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var view: WebView

    // Match the existing Capacitor APK origin so an in-place upgrade keeps localStorage.
    private fun isGame(uri: Uri) = uri.scheme == "https" && uri.encodedAuthority == "localhost"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        view = WebView(this)
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = !isGame(request.url)

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val path = request.url.path?.removePrefix("/").orEmpty().ifEmpty { "index.html" }
                if (!isGame(request.url) || path.split('/').any { it == "." || it == ".." }) return missing()
                val mime = when (path.substringAfterLast('.')) {
                    "html" -> "text/html"
                    "js" -> "text/javascript"
                    "css" -> "text/css"
                    "json" -> "application/json"
                    "png" -> "image/png"
                    "svg" -> "image/svg+xml"
                    "woff2" -> "font/woff2"
                    "ogg", "opus" -> "audio/ogg"
                    "txt", "md", "LICENSE" -> "text/plain"
                    else -> return missing()
                }
                return try { WebResourceResponse(mime, "UTF-8", assets.open(path)) }
                catch (_: IOException) { missing() }
            }
        }
        setContentView(view)
        hideBars()
        view.loadUrl("https://localhost/")
    }

    private fun missing() = WebResourceResponse(
        "text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(byteArrayOf())
    )

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideBars()
    }

    @Suppress("DEPRECATION")
    private fun hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.apply {
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                hide(WindowInsets.Type.systemBars())
            }
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (view.canGoBack()) view.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        view.destroy()
        super.onDestroy()
    }
}
