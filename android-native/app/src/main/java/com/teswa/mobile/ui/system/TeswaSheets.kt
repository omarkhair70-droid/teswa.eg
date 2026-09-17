package com.teswa.mobile.ui.system

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight

@Composable
fun TeswaActionSheet(
    title: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    content: @Composable () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(
                    start = TeswaLayout.ScreenHorizontal,
                    end = TeswaLayout.ScreenHorizontal,
                    bottom = TeswaSpacing.xl,
                ),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            supporting?.let {
                Text(
                    text = it,
                    modifier = Modifier.padding(top = TeswaSpacing.xs, bottom = TeswaSpacing.md),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (supporting == null) {
                androidx.compose.foundation.layout.Spacer(Modifier.padding(top = TeswaSpacing.xs))
            }
            content()
        }
    }
}
