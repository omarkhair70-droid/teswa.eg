package com.teswa.mobile.feature.safety

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import kotlinx.coroutines.launch

private sealed interface ReportingUiState {
    data object Loading : ReportingUiState
    data class Ready(val context: PreparedReportContext) : ReportingUiState
    data class Error(val message: String) : ReportingUiState
    data object Submitted : ReportingUiState
}

private class ReportingStateHolder(
    initialSession: AuthSession,
    private val target: ReportTarget,
    private val repository: ReportingRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<ReportingUiState>(ReportingUiState.Loading)
        private set
    var reason by mutableStateOf<ReportReason?>(null)
        private set
    var details by mutableStateOf("")
        private set
    var working by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    fun selectReason(value: ReportReason) {
        if (!working) {
            reason = value
            message = null
        }
    }

    fun updateDetails(value: String) {
        if (!working) details = value.take(1_000)
    }

    suspend fun prepare() {
        state = ReportingUiState.Loading
        message = null
        when (val result = repository.prepare(session, target)) {
            is ReportingResult.Success -> {
                session = result.session
                state = ReportingUiState.Ready(result.value)
            }
            is ReportingResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                state = ReportingUiState.Error(result.message)
            }
        }
    }

    suspend fun submit() {
        val selected = reason
        if (selected == null) {
            message = "اختار سبب البلاغ الأول."
            return
        }
        if (working) return
        working = true
        message = null
        when (val result = repository.submit(session, target, selected, details)) {
            is ReportingResult.Success -> {
                session = result.session
                state = ReportingUiState.Submitted
            }
            is ReportingResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                message = result.message
            }
        }
        working = false
    }
}

@Composable
fun ReportingDialog(
    target: ReportTarget,
    initialSession: AuthSession,
    repository: ReportingRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onDismiss: () -> Unit,
) {
    val holder = remember(target.key, initialSession.user.id, repository) {
        ReportingStateHolder(initialSession, target, repository)
    }
    val scope = rememberCoroutineScope()

    LaunchedEffect(target.key, initialSession.accessToken) {
        holder.updateSession(initialSession)
        if (holder.state is ReportingUiState.Loading) holder.prepare()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    TeswaActionSheet(
        title = if (holder.state is ReportingUiState.Submitted) "تم إرسال البلاغ" else "إرسال بلاغ",
        supporting = if (holder.state is ReportingUiState.Ready) "اختار السبب الأقرب للسياق. البلاغ بيروح للمراجعة ومش بيظهر للطرف التاني." else null,
        onDismiss = { if (!holder.working) onDismiss() },
    ) {
        when (val state = holder.state) {
            ReportingUiState.Loading -> TeswaInlineLoading("بنتأكد من سياق البلاغ…")
            is ReportingUiState.Error -> TeswaInlineMessage(
                title = "مش قادرين نجهز البلاغ",
                body = state.message,
                icon = TeswaIcons.Refresh,
                emphasis = TeswaEmphasis.Strong,
                actionLabel = "حاول تاني",
                onAction = { scope.launch { holder.prepare() } },
            )
            ReportingUiState.Submitted -> Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md)) {
                TeswaInlineMessage(
                    title = "البلاغ وصل للمراجعة",
                    body = "مش محتاج تعمل خطوة إضافية دلوقتي.",
                    icon = TeswaIcons.Safety,
                    emphasis = TeswaEmphasis.Normal,
                )
                TeswaPrimaryAction(text = "تم", onClick = onDismiss)
            }
            is ReportingUiState.Ready -> Column(
                Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaInlineMessage(
                    title = state.context.subject,
                    body = state.context.preview?.takeIf(String::isNotBlank) ?: "البلاغ مرتبط بالسياق اللي فتحته منه.",
                    icon = TeswaIcons.Report,
                )
                Text("إيه السبب؟", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                reasonsFor(target).forEach { option ->
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = !holder.working) { holder.selectReason(option) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = holder.reason == option,
                            onClick = { holder.selectReason(option) },
                            enabled = !holder.working,
                        )
                        Text(option.labelAr, Modifier.weight(1f))
                    }
                }
                TeswaTextField(
                    value = holder.details,
                    onValueChange = holder::updateDetails,
                    label = "تفاصيل إضافية — اختياري",
                    supportingText = "${holder.details.length} / 1000",
                    singleLine = false,
                    minLines = 3,
                    maxLines = 6,
                    enabled = !holder.working,
                )
                holder.message?.let { message ->
                    TeswaInlineMessage(
                        title = "البلاغ ما اتبعتش",
                        body = message,
                        emphasis = TeswaEmphasis.Strong,
                    )
                }
                TeswaPrimaryAction(
                    text = "إرسال البلاغ",
                    icon = TeswaIcons.Report,
                    enabled = holder.reason != null,
                    loading = holder.working,
                    onClick = { scope.launch { holder.submit() } },
                )
                TextButton(onClick = onDismiss, enabled = !holder.working, modifier = Modifier.fillMaxWidth()) {
                    Text("إلغاء")
                }
            }
        }
    }
}
