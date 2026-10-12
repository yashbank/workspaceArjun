package com.example.mis_kiosk.ui.scan

import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.mis_kiosk.ui.theme.KioskColors
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

private const val TAG = "QrScannerView"

/**
 * A live camera preview that decodes QR codes in the background and reports each raw value
 * via [onCodeScanned]. The caller decides what a valid code looks like (badge codes here) —
 * this view just reports whatever the frame contains, as often as it decodes one.
 *
 * Uses the back camera when there is one and falls back to the front camera (#56). When neither
 * can be bound a visible message is shown; when both exist a small button flips between them.
 */
@Composable
fun QrScannerView(
    onCodeScanned: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val onCodeScannedState = rememberUpdatedState(onCodeScanned)
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build(),
        )
    }

    DisposableEffect(Unit) {
        onDispose { scanner.close() }
    }

    var preferFront by remember { mutableStateOf(false) }
    var canFlip by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(modifier = modifier) {
        // Re-keyed on the lens choice so a flip rebuilds the preview and rebinds cleanly.
        key(preferFront) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val previewView = PreviewView(ctx).apply {
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    cameraProviderFuture.addListener(
                        {
                            val cameraProvider = try {
                                cameraProviderFuture.get()
                            } catch (e: Exception) {
                                Log.e(TAG, "Camera provider unavailable", e)
                                error = "The camera could not be started. Use manual entry instead."
                                return@addListener
                            }
                            val hasBack = safeHasCamera(cameraProvider, CameraSelector.DEFAULT_BACK_CAMERA)
                            val hasFront = safeHasCamera(cameraProvider, CameraSelector.DEFAULT_FRONT_CAMERA)
                            canFlip = hasBack && hasFront
                            val selector = when {
                                preferFront && hasFront -> CameraSelector.DEFAULT_FRONT_CAMERA
                                hasBack -> CameraSelector.DEFAULT_BACK_CAMERA
                                hasFront -> CameraSelector.DEFAULT_FRONT_CAMERA
                                else -> {
                                    error = "No camera found on this tablet. Use manual entry instead."
                                    return@addListener
                                }
                            }
                            val preview = Preview.Builder().build().also {
                                it.surfaceProvider = previewView.surfaceProvider
                            }
                            val analysis = ImageAnalysis.Builder()
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build()
                            analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy ->
                                val mediaImage = imageProxy.image
                                if (mediaImage == null) {
                                    imageProxy.close()
                                    return@setAnalyzer
                                }
                                val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                scanner.process(image)
                                    .addOnSuccessListener { barcodes ->
                                        barcodes.firstOrNull()?.rawValue?.let { onCodeScannedState.value(it) }
                                    }
                                    .addOnFailureListener { e -> Log.w(TAG, "Barcode decode failed", e) }
                                    .addOnCompleteListener { imageProxy.close() }
                            }
                            try {
                                cameraProvider.unbindAll()
                                cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
                                error = null
                            } catch (e: Exception) {
                                Log.e(TAG, "Could not bind camera", e)
                                error = "The camera could not be started. Use manual entry instead."
                            }
                        },
                        ContextCompat.getMainExecutor(ctx),
                    )
                    previewView
                },
            )
        }

        error?.let { message ->
            Surface(
                color = KioskColors.ErrorContainer,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            ) {
                Text(
                    message,
                    style = MaterialTheme.typography.titleMedium,
                    color = KioskColors.TextPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                )
            }
        }

        if (canFlip) {
            OutlinedButton(
                onClick = { preferFront = !preferFront },
                modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
            ) {
                Text("Flip camera")
            }
        }
    }
}

private fun safeHasCamera(provider: ProcessCameraProvider, selector: CameraSelector): Boolean =
    try {
        provider.hasCamera(selector)
    } catch (e: Exception) {
        Log.w(TAG, "hasCamera check failed", e)
        false
    }
