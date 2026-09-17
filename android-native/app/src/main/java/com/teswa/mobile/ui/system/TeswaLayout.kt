package com.teswa.mobile.ui.system

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.unit.dp

/**
 * Layout authority for phone-first Teswa surfaces.
 */
object TeswaLayout {
    val ScreenHorizontal = 18.dp
    val ScreenVertical = 18.dp
    val SectionGap = 24.dp
    val ContentGap = 12.dp
    val TightGap = 8.dp
    val HeroGap = 32.dp

    val RootContentPadding = PaddingValues(
        horizontal = ScreenHorizontal,
        vertical = ScreenVertical,
    )

    val FocusedContentPadding = PaddingValues(
        horizontal = ScreenHorizontal,
        vertical = 16.dp,
    )

    val BottomCommitHorizontal = 18.dp
    val BottomCommitVertical = 12.dp

    // Fixed-height utility media inside durable workspaces. Public object presentation
    // uses TeswaMedia aspect ratios instead.
    val MediaPreviewHeight = 190.dp

    // Identity geometry is shared across Me/edit/public identity surfaces.
    val ProfileCoverHeight = 112.dp
    val ProfileCoverRadius = 32.dp
    val ProfileAvatarLarge = 84.dp

    const val MaxTitleLines = 2
    const val MaxSupportingLines = 3
    const val MaxCompactMetaLines = 1
}

enum class TeswaContentDensity {
    Spacious,
    Standard,
    Compact,
}
