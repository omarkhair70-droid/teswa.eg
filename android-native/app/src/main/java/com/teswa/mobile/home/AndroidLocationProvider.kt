package com.teswa.mobile.home

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Looper
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

data class DeviceLocation(val latitude: Double, val longitude: Double)

sealed interface CurrentLocationResult {
    data class Success(val location: DeviceLocation) : CurrentLocationResult
    data class Failure(val reason: Reason) : CurrentLocationResult
    enum class Reason { PERMISSION_DENIED, SERVICES_DISABLED, UNAVAILABLE }
}

fun interface CurrentLocationProvider {
    suspend fun current(): CurrentLocationResult
}

class AndroidLocationProvider(context: Context) : CurrentLocationProvider {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    override suspend fun current(): CurrentLocationResult {
        val fine = ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return CurrentLocationResult.Failure(CurrentLocationResult.Reason.PERMISSION_DENIED)
        val provider = when {
            fine && runCatching { manager.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false) -> LocationManager.GPS_PROVIDER
            runCatching { manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false) -> LocationManager.NETWORK_PROVIDER
            else -> return CurrentLocationResult.Failure(CurrentLocationResult.Reason.SERVICES_DISABLED)
        }
        return runCatching { withTimeoutOrNull(12_000) { request(provider) } ?: CurrentLocationResult.Failure(CurrentLocationResult.Reason.UNAVAILABLE) }
            .getOrElse { CurrentLocationResult.Failure(CurrentLocationResult.Reason.UNAVAILABLE) }
    }

    @Suppress("MissingPermission", "DEPRECATION")
    private suspend fun request(provider: String): CurrentLocationResult = suspendCancellableCoroutine { continuation ->
        fun resolve(location: Location?) {
            if (!continuation.isActive) return
            val value = location?.takeIf { it.latitude.isFinite() && it.longitude.isFinite() }
            continuation.resume(
                if (value == null) CurrentLocationResult.Failure(CurrentLocationResult.Reason.UNAVAILABLE)
                else CurrentLocationResult.Success(DeviceLocation(value.latitude, value.longitude)),
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val cancellation = CancellationSignal()
            manager.getCurrentLocation(provider, cancellation, appContext.mainExecutor, ::resolve)
            continuation.invokeOnCancellation { cancellation.cancel() }
        } else {
            @Suppress("OVERRIDE_DEPRECATION")
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) = resolve(location)
                override fun onProviderDisabled(provider: String) = resolve(null)
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
                override fun onProviderEnabled(provider: String) = Unit
            }
            manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
            continuation.invokeOnCancellation { manager.removeUpdates(listener) }
        }
    }
}
