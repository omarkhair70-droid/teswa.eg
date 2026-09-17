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
    val iconCompact = 20.dp
    val icon = 24.dp
    val iconHero = 28.dp
    val thumbCompact = 56.dp
    val thumb = 72.dp
    val avatar = 48.dp
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
