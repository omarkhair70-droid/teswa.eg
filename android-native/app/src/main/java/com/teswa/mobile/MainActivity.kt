package com.teswa.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthUiState
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val authRepository = AuthRepository(applicationContext)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    TeswaAuthScreen(
                        repository = authRepository,
                        activity = this@MainActivity,
                    )
                }
            }
        }
    }
}

@Composable
private fun TeswaAuthScreen(
    repository: AuthRepository,
    activity: ComponentActivity,
) {
    var state by remember { mutableStateOf<AuthUiState>(AuthUiState.Restoring) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        state = when (val restored = repository.restore()) {
            is AuthResult.Success -> restored.value?.let(AuthUiState::SignedIn) ?: AuthUiState.SignedOut
            is AuthResult.Failure -> AuthUiState.Error(restored.message)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 36.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "تِسوى",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(12.dp))

        when (val current = state) {
            AuthUiState.Restoring -> {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text("جاري استعادة جلستك…")
            }

            AuthUiState.SignedOut -> {
                Text(
                    text = "سجّل دخولك بحساب Google",
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = {
                        state = AuthUiState.Working("جاري تسجيل الدخول…")
                        scope.launch {
                            state = when (val result = repository.signInWithGoogle(activity)) {
                                is AuthResult.Success -> AuthUiState.SignedIn(result.value)
                                is AuthResult.Failure -> {
                                    if (result.reason == AuthResult.Reason.CANCELLED) AuthUiState.SignedOut
                                    else AuthUiState.Error(result.message)
                                }
                            }
                        }
                    },
                ) {
                    Text("المتابعة باستخدام Google")
                }
            }

            is AuthUiState.Working -> {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text(current.message)
            }

            is AuthUiState.SignedIn -> {
                Text(
                    text = "تم تسجيل الدخول",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = current.session.user.displayName
                        ?: current.session.user.email
                        ?: current.session.user.id,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(20.dp))
                OutlinedButton(
                    onClick = {
                        state = AuthUiState.Working("جاري تسجيل الخروج…")
                        scope.launch {
                            repository.signOut()
                            state = AuthUiState.SignedOut
                        }
                    },
                ) {
                    Text("تسجيل الخروج")
                }
            }

            is AuthUiState.Error -> {
                Text(
                    text = current.message,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = { state = AuthUiState.SignedOut }) {
                    Text("حاول مرة تانية")
                }
            }
        }
    }
}
