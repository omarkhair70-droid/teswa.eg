package com.teswa.mobile.ui.system

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class TeswaMark {
    Possible,
    Mine,
    BetweenUs,
    Me,
    PutIntoPlay,
}

/**
 * Authored product marks for concepts that belong uniquely to Teswa.
 * Utility actions intentionally remain Material/system icons.
 */
@Composable
fun TeswaMarkIcon(
    mark: TeswaMark,
    color: Color,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    strokeWidth: Dp = 1.8.dp,
) {
    Canvas(modifier = modifier.size(size)) {
        val stroke = strokeWidth.toPx()
        val w = this.size.width
        val h = this.size.height
        val r = minOf(w, h)
        val line = Stroke(width = stroke, cap = StrokeCap.Round)

        when (mark) {
            TeswaMark.Possible -> {
                // An object crossing an opening: private -> visible possibility.
                val frame = Path().apply {
                    moveTo(w * .18f, h * .22f)
                    lineTo(w * .18f, h * .78f)
                    lineTo(w * .62f, h * .78f)
                    moveTo(w * .18f, h * .22f)
                    lineTo(w * .62f, h * .22f)
                }
                drawPath(frame, color = color, style = line)
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .48f, h * .38f),
                    size = Size(w * .34f, h * .34f),
                    cornerRadius = CornerRadius(r * .08f),
                    style = line,
                )
                drawLine(
                    color = color,
                    start = Offset(w * .62f, h * .55f),
                    end = Offset(w * .88f, h * .55f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }

            TeswaMark.Mine -> {
                // Wardrobe reduced to frame, door seam and one shelf cue.
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .18f, h * .12f),
                    size = Size(w * .64f, h * .76f),
                    cornerRadius = CornerRadius(r * .08f),
                    style = line,
                )
                drawLine(color, Offset(w * .5f, h * .14f), Offset(w * .5f, h * .86f), stroke, StrokeCap.Round)
                drawLine(color, Offset(w * .22f, h * .62f), Offset(w * .46f, h * .62f), stroke, StrokeCap.Round)
                drawCircle(color, radius = r * .025f, center = Offset(w * .44f, h * .5f))
                drawCircle(color, radius = r * .025f, center = Offset(w * .56f, h * .5f))
            }

            TeswaMark.BetweenUs -> {
                // Two independent possessions with one relation that only exists between them.
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .08f, h * .3f),
                    size = Size(w * .28f, h * .4f),
                    cornerRadius = CornerRadius(r * .08f),
                    style = line,
                )
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .64f, h * .3f),
                    size = Size(w * .28f, h * .4f),
                    cornerRadius = CornerRadius(r * .08f),
                    style = line,
                )
                val bridge = Path().apply {
                    moveTo(w * .36f, h * .5f)
                    cubicTo(w * .44f, h * .38f, w * .56f, h * .62f, w * .64f, h * .5f)
                }
                drawPath(bridge, color = color, style = line)
                drawCircle(color = color, radius = r * .035f, center = Offset(w * .5f, h * .5f))
            }

            TeswaMark.Me -> {
                // Identity as an archived trace rather than a generic person glyph.
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .16f, h * .12f),
                    size = Size(w * .68f, h * .76f),
                    cornerRadius = CornerRadius(r * .1f),
                    style = line,
                )
                drawCircle(
                    color = color,
                    radius = r * .12f,
                    center = Offset(w * .5f, h * .4f),
                    style = line,
                )
                val shoulders = Path().apply {
                    moveTo(w * .34f, h * .68f)
                    cubicTo(w * .39f, h * .58f, w * .61f, h * .58f, w * .66f, h * .68f)
                }
                drawPath(shoulders, color = color, style = line)
                drawLine(color, Offset(w * .68f, h * .2f), Offset(w * .78f, h * .2f), stroke, StrokeCap.Round)
                drawLine(color, Offset(w * .74f, h * .16f), Offset(w * .74f, h * .25f), stroke, StrokeCap.Round)
            }

            TeswaMark.PutIntoPlay -> {
                // A possession leaving a private boundary and entering the field.
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .08f, h * .2f),
                    size = Size(w * .46f, h * .6f),
                    cornerRadius = CornerRadius(r * .08f),
                    style = line,
                )
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * .44f, h * .34f),
                    size = Size(w * .34f, h * .34f),
                    cornerRadius = CornerRadius(r * .08f),
                    style = line,
                )
                drawLine(color, Offset(w * .68f, h * .51f), Offset(w * .9f, h * .51f), stroke, StrokeCap.Round)
                val arrow = Path().apply {
                    moveTo(w * .84f, h * .44f)
                    lineTo(w * .91f, h * .51f)
                    lineTo(w * .84f, h * .58f)
                }
                drawPath(arrow, color = color, style = line)
            }
        }
    }
}

@Composable
fun TeswaRootMark(
    destination: TeswaRootDestination,
    color: Color,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
) {
    val mark = when (destination) {
        TeswaRootDestination.POSSIBLE -> TeswaMark.Possible
        TeswaRootDestination.MINE -> TeswaMark.Mine
        TeswaRootDestination.BETWEEN_US -> TeswaMark.BetweenUs
        TeswaRootDestination.ME -> TeswaMark.Me
    }
    TeswaMarkIcon(mark = mark, color = color, modifier = modifier, size = size)
}
