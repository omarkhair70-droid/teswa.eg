package com.teswa.mobile.ui.system

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween

/**
 * One motion vocabulary for Teswa.
 * Motion explains continuity/state; it is not decorative chrome.
 */
object TeswaMotion {
    const val Micro = 120
    const val Standard = 220
    const val Emphasized = 320
    const val Commitment = 420

    fun <T> standard(): FiniteAnimationSpec<T> = tween(
        durationMillis = Standard,
        easing = FastOutSlowInEasing,
    )

    fun <T> emphasized(): FiniteAnimationSpec<T> = tween(
        durationMillis = Emphasized,
        easing = FastOutSlowInEasing,
    )

    fun <T> commitment(): FiniteAnimationSpec<T> = spring(
        dampingRatio = Spring.DampingRatioLowBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )
}
