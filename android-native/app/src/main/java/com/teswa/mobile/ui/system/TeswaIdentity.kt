package com.teswa.mobile.ui.system

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.teswa.mobile.ui.NetworkImage

@Composable
fun TeswaPersonIdentity(
    name: String,
    modifier: Modifier = Modifier,
    avatarUrl: String? = null,
    supporting: String? = null,
    evidence: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val interactive = if (onClick != null) modifier.clickable(onClick = onClick) else modifier
    Row(
        modifier = interactive,
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NetworkImage(
            url = avatarUrl,
            contentDescription = name,
            modifier = Modifier
                .size(TeswaSize.avatar)
                .clip(CircleShape),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            supporting?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            evidence?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
