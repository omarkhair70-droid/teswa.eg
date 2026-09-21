package com.teswa.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.teswa.mobile.ui.system.TeswaPalette
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaTypography

private val TeswaLightColors = lightColorScheme(
    primary = TeswaPalette.Clay,
    onPrimary = Color.White,
    primaryContainer = TeswaPalette.ClayContainer,
    onPrimaryContainer = Color(0xFF3A0B00),
    secondary = TeswaPalette.Sage,
    onSecondary = Color.White,
    secondaryContainer = TeswaPalette.SageContainer,
    onSecondaryContainer = Color(0xFF062019),
    tertiary = TeswaPalette.Amber,
    onTertiary = Color.White,
    background = TeswaPalette.Paper,
    onBackground = TeswaPalette.Ink,
    surface = TeswaPalette.Surface,
    onSurface = TeswaPalette.Ink,
    surfaceVariant = TeswaPalette.MutedField,
    onSurfaceVariant = Color(0xFF53433C),
    outline = TeswaPalette.Outline,
    error = Color(0xFFBA1A1A),
)

private val TeswaDarkColors = darkColorScheme(
    primary = Color(0xFFFFB59A),
    onPrimary = Color(0xFF571E0C),
    primaryContainer = Color(0xFF74321D),
    onPrimaryContainer = Color(0xFFFFDBCF),
    secondary = Color(0xFFADCEC0),
    onSecondary = Color(0xFF18372E),
    secondaryContainer = Color(0xFF2F4E44),
    onSecondaryContainer = Color(0xFFC9EBDD),
    tertiary = Color(0xFFF3BD6B),
    onTertiary = Color(0xFF452B00),
    background = Color(0xFF1A1210),
    onBackground = Color(0xFFF1DFD8),
    surface = Color(0xFF211916),
    onSurface = Color(0xFFF1DFD8),
    surfaceVariant = Color(0xFF53433C),
    onSurfaceVariant = Color(0xFFD8C2B8),
    outline = Color(0xFFA08D84),
    error = Color(0xFFFFB4AB),
)

private val TeswaShapes = Shapes(
    extraSmall = RoundedCornerShape(TeswaRadius.xs),
    small = RoundedCornerShape(TeswaRadius.sm),
    medium = RoundedCornerShape(TeswaRadius.md),
    large = RoundedCornerShape(TeswaRadius.lg),
    extraLarge = RoundedCornerShape(TeswaRadius.hero),
)

@Composable
fun TeswaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) TeswaDarkColors else TeswaLightColors,
        typography = TeswaTypography,
        shapes = TeswaShapes,
        content = content,
    )
}
