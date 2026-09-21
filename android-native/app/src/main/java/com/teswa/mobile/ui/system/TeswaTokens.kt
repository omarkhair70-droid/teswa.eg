package com.teswa.mobile.ui.system

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Production UI tokens for the native Teswa experience.
 *
 * These are semantic product tokens, not screen-specific decoration.
 */
object TeswaSpacing {
    val xxs = 4.dp
    val xs = 8.dp
    val sm = 12.dp
    val md = 16.dp
    val page = 18.dp
    val lg = 20.dp
    val xl = 24.dp
    val xxl = 32.dp
    val xxxl = 40.dp
}

object TeswaRadius {
    val xs = 8.dp
    val sm = 12.dp
    val md = 18.dp
    val lg = 24.dp
    val hero = 32.dp
}

object TeswaSize {
    val minTouch = 48.dp
    val actionHeight = 54.dp
    val compactActionHeight = 48.dp
    val iconCompact = 20.dp
    val icon = 24.dp
    val iconHero = 28.dp
    val thumbCompact = 56.dp
    val thumb = 72.dp
    val avatarCompact = 36.dp
    val avatar = 48.dp
    val avatarLarge = 72.dp
    val objectHeroMinHeight = 260.dp
}

object TeswaMedia {
    /** Default discovery/object media ratio: 4:3. */
    const val Object = 4f / 3f

    /** Immersive story/media ratio: 9:16. */
    const val Story = 9f / 16f

    /** Compact portrait object preview: 3:4. */
    const val PortraitObject = 3f / 4f

    /** Square identity/avatar and compact object crop. */
    const val Square = 1f
}

object TeswaPalette {
    val Paper = Color(0xFFFBF8F3)
    val Surface = Color(0xFFFFFDFC)
    val Ink = Color(0xFF211A17)
    val Clay = Color(0xFF93482F)
    val ClayContainer = Color(0xFFFFDBCF)
    val Sage = Color(0xFF46665B)
    val SageContainer = Color(0xFFC9EBDD)
    val Amber = Color(0xFF805610)
    val MutedField = Color(0xFFF2E8E2)
    val Outline = Color(0xFF88736A)
}

enum class TeswaEmphasis {
    Quiet,
    Normal,
    Strong,
    Commitment,
}
