package com.teswa.mobile.ui.system

import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType

/**
 * Semantic haptic events. Screen code should request meaning, not a raw effect.
 */
enum class TeswaHapticEvent {
    Selection,
    ToggleOn,
    ToggleOff,
    Commit,
    Success,
    Reject,
}

fun HapticFeedback.performTeswa(event: TeswaHapticEvent) {
    val type = when (event) {
        TeswaHapticEvent.Selection -> HapticFeedbackType.SegmentTick
        TeswaHapticEvent.ToggleOn -> HapticFeedbackType.ToggleOn
        TeswaHapticEvent.ToggleOff -> HapticFeedbackType.ToggleOff
        TeswaHapticEvent.Commit -> HapticFeedbackType.Confirm
        TeswaHapticEvent.Success -> HapticFeedbackType.Confirm
        TeswaHapticEvent.Reject -> HapticFeedbackType.Reject
    }
    performHapticFeedback(type)
}
