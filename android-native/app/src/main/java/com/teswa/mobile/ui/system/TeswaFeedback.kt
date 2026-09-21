package com.teswa.mobile.ui.system

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight

@Composable
fun TeswaInlineLoading(
    message: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = TeswaSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(TeswaSize.icon))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun TeswaInlineMessage(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    emphasis: TeswaEmphasis = TeswaEmphasis.Quiet,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val container = when (emphasis) {
        TeswaEmphasis.Quiet -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        TeswaEmphasis.Normal -> MaterialTheme.colorScheme.secondaryContainer
        TeswaEmphasis.Strong -> MaterialTheme.colorScheme.primaryContainer
        TeswaEmphasis.Commitment -> MaterialTheme.colorScheme.primaryContainer
    }
    val content = when (emphasis) {
        TeswaEmphasis.Quiet -> MaterialTheme.colorScheme.onSurfaceVariant
        TeswaEmphasis.Normal -> MaterialTheme.colorScheme.onSecondaryContainer
        TeswaEmphasis.Strong,
        TeswaEmphasis.Commitment -> MaterialTheme.colorScheme.onPrimaryContainer
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = container,
        contentColor = content,
        shape = MaterialTheme.shapes.large,
    ) {
        Row(
            modifier = Modifier.padding(TeswaSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.Top,
        ) {
            icon?.let {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(TeswaSize.icon),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(body, style = MaterialTheme.typography.bodyMedium)
                if (actionLabel != null && onAction != null) {
                    TextButton(onClick = onAction) { Text(actionLabel) }
                }
            }
        }
    }
}

@Composable
fun TeswaConflictMessage(
    body: String,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TeswaInlineMessage(
        title = "الحالة اتغيرت",
        body = body,
        icon = TeswaIcons.Refresh,
        emphasis = TeswaEmphasis.Strong,
        actionLabel = "حدّث الحالة",
        onAction = onRefresh,
        modifier = modifier,
    )
}
