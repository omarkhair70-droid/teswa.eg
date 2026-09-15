package com.teswa.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val TeswaLightColors = lightColorScheme(
    primary = Color(0xFF93482F),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFFDBCF),
    onPrimaryContainer = Color(0xFF3A0B00),
    secondary = Color(0xFF46665B),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFC9EBDD),
    onSecondaryContainer = Color(0xFF062019),
    tertiary = Color(0xFF805610),
    onTertiary = Color(0xFFFFFFFF),
    background = Color(0xFFFBF8F3),
    onBackground = Color(0xFF211A17),
    surface = Color(0xFFFFFDFC),
    onSurface = Color(0xFF211A17),
    surfaceVariant = Color(0xFFF2E8E2),
    onSurfaceVariant = Color(0xFF53433C),
    outline = Color(0xFF88736A),
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

private val TeswaTypography = Typography(
    displaySmall = Typography().displaySmall.copy(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 38.sp,
        lineHeight = 46.sp,
    ),
    headlineLarge = Typography().headlineLarge.copy(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 30.sp,
        lineHeight = 38.sp,
    ),
    headlineMedium = Typography().headlineMedium.copy(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 25.sp,
        lineHeight = 33.sp,
    ),
    headlineSmall = Typography().headlineSmall.copy(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 30.sp,
    ),
    titleLarge = Typography().titleLarge.copy(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 29.sp,
    ),
    titleMedium = Typography().titleMedium.copy(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 24.sp,
    ),
    bodyLarge = Typography().bodyLarge.copy(fontFamily = FontFamily.SansSerif, lineHeight = 26.sp),
    bodyMedium = Typography().bodyMedium.copy(fontFamily = FontFamily.SansSerif, lineHeight = 22.sp),
    bodySmall = Typography().bodySmall.copy(fontFamily = FontFamily.SansSerif, lineHeight = 18.sp),
    labelLarge = Typography().labelLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold),
    labelMedium = Typography().labelMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium),
)

private val TeswaShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
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
