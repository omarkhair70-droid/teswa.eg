package com.teswa.mobile.feature.motion

import android.content.Context
import android.location.Geocoder
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.home.CurrentLocationResult
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidCityPulseLocationResolver(
    context: Context,
    private val locationProvider: CurrentLocationProvider,
) : MotionLocationResolver {
    private val appContext = context.applicationContext

    override suspend fun resolve(): MotionLocationResult {
        val position = when (val result = locationProvider.current()) {
            is CurrentLocationResult.Success -> result.location
            is CurrentLocationResult.Failure -> return MotionLocationResult.Failure(
                message = when (result.reason) {
                    CurrentLocationResult.Reason.PERMISSION_DENIED -> "نحتاج إذن الموقع عشان نعرض نبض مدينتك."
                    CurrentLocationResult.Reason.SERVICES_DISABLED -> "فعّل خدمة الموقع عشان نحدد نبض مدينتك."
                    CurrentLocationResult.Reason.UNAVAILABLE -> "تعذر تحديد موقعك دلوقتي. حاول مرة تانية."
                },
                permissionDenied = result.reason == CurrentLocationResult.Reason.PERMISSION_DENIED,
            )
        }

        val address = withContext(Dispatchers.IO) {
            runCatching {
                @Suppress("DEPRECATION")
                Geocoder(appContext, Locale.getDefault())
                    .getFromLocation(position.latitude, position.longitude, 1)
                    ?.firstOrNull()
            }.getOrNull()
        } ?: return MotionLocationResult.Failure("تعذر تحديد مدينتك دلوقتي. حاول مرة تانية.")

        val candidates = listOf(address.locality, address.subLocality, address.subAdminArea, address.adminArea)
        val terms = buildList {
            val seen = linkedSetOf<String>()
            candidates.forEach { raw ->
                val value = raw?.trim()?.takeIf(String::isNotEmpty) ?: return@forEach
                val key = value.lowercase()
                if (seen.add(key) && size < 6) add(value)
            }
        }
        val label = candidates.firstNotNullOfOrNull { it?.trim()?.takeIf(String::isNotEmpty) }
            ?: address.getAddressLine(0)?.trim()?.takeIf(String::isNotEmpty)

        return if (label == null || terms.isEmpty()) {
            MotionLocationResult.Failure("تعذر تحديد مدينتك دلوقتي. حاول مرة تانية.")
        } else {
            MotionLocationResult.Success(MotionCityLocation(label, terms))
        }
    }
}
