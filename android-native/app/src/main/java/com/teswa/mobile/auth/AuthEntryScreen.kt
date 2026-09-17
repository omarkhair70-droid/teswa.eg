package com.teswa.mobile.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTraceNote

/** Production A01/A02 session + sign-in surface. */
@Composable
fun AuthEntryScreen(
    state: AuthUiState,
    onGoogleSignIn: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                horizontal = TeswaLayout.ScreenHorizontal,
                vertical = TeswaSpacing.xxl,
            ),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .34f),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(TeswaRadius.hero),
        ) {
            Box(
                modifier = Modifier
                    .size(112.dp)
                    .padding(TeswaSpacing.xl),
                contentAlignment = Alignment.Center,
            ) {
                TeswaMarkIcon(
                    mark = TeswaMark.PutIntoPlay,
                    color = MaterialTheme.colorScheme.primary,
                    size = 66.dp,
                    strokeWidth = 2.2.dp,
                )
            }
        }
        Spacer(Modifier.height(TeswaSpacing.lg))
        TeswaArchiveLabel("OBJECTS / NEXT")
        Spacer(Modifier.height(TeswaSpacing.sm))
        Text(
            text = "تِسوى",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(TeswaSpacing.sm))
        Text(
            text = "الحاجة جاية من حياة، ورايحة لاحتمال جديد.",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(TeswaSpacing.xs))
        TeswaTraceNote(
            text = "اللي عندك ممكن يبقى فرصة واضحة بينك وبين حد تاني.",
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(TeswaSpacing.xxl))

        when (state) {
            AuthUiState.Restoring -> TeswaInlineLoading(
                message = "بنرجّع مساحتك…",
                modifier = Modifier.padding(horizontal = TeswaSpacing.md),
            )

            AuthUiState.SignedOut -> {
                Text(
                    text = "ادخل بحساب Google عشان تكمل على دولابك وتبديلاتك.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(TeswaSpacing.lg))
                TeswaPrimaryAction(
                    text = "المتابعة بحساب Google",
                    onClick = onGoogleSignIn,
                )
            }

            is AuthUiState.Working -> TeswaInlineLoading(
                message = state.message,
                modifier = Modifier.padding(horizontal = TeswaSpacing.md),
            )

            is AuthUiState.Error -> TeswaInlineMessage(
                title = "الدخول مكملش",
                body = state.message,
                emphasis = TeswaEmphasis.Strong,
                actionLabel = "حاول تاني",
                onAction = onRetry,
            )

            is AuthUiState.SignedIn -> Unit
        }
    }
}
