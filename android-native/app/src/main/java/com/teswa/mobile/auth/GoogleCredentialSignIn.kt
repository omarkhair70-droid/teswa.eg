package com.teswa.mobile.auth

import android.content.Context
import android.util.Base64
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.teswa.mobile.BuildConfig
import java.security.SecureRandom

class GoogleCredentialSignIn(context: Context) {
    private val credentialManager = CredentialManager.create(context.applicationContext)

    suspend fun getIdToken(context: Context): AuthResult<String> {
        val authorized = requestGoogleCredential(context, filterAuthorized = true)
        if (authorized !is GoogleCredentialResult.NoCredential) return authorized.toAuthResult()

        return requestGoogleCredential(context, filterAuthorized = false).toAuthResult()
    }

    private suspend fun requestGoogleCredential(
        context: Context,
        filterAuthorized: Boolean,
    ): GoogleCredentialResult {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(filterAuthorized)
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setAutoSelectEnabled(false)
            .setNonce(generateNonce())
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        return try {
            val result = credentialManager.getCredential(
                request = request,
                context = context,
            )
            val credential = result.credential
            if (credential !is CustomCredential ||
                credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                GoogleCredentialResult.Failure("Google أعاد نوع اعتماد غير متوقع.")
            } else {
                val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
                GoogleCredentialResult.Token(googleCredential.idToken)
            }
        } catch (_: NoCredentialException) {
            GoogleCredentialResult.NoCredential
        } catch (_: GetCredentialCancellationException) {
            GoogleCredentialResult.Cancelled
        } catch (_: GoogleIdTokenParsingException) {
            GoogleCredentialResult.Failure("تعذر قراءة بيانات تسجيل الدخول من Google.")
        } catch (error: GetCredentialException) {
            GoogleCredentialResult.Failure(
                error.message?.takeIf { it.isNotBlank() }
                    ?: "تعذر بدء تسجيل الدخول باستخدام Google.",
            )
        }
    }

    private fun generateNonce(byteLength: Int = 32): String {
        val bytes = ByteArray(byteLength)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
    }

    private sealed interface GoogleCredentialResult {
        data class Token(val idToken: String) : GoogleCredentialResult
        data object NoCredential : GoogleCredentialResult
        data object Cancelled : GoogleCredentialResult
        data class Failure(val message: String) : GoogleCredentialResult

        fun toAuthResult(): AuthResult<String> = when (this) {
            is Token -> AuthResult.Success(idToken)
            NoCredential -> AuthResult.Failure(
                AuthResult.Reason.PROVIDER,
                "لا يوجد حساب Google متاح على الجهاز.",
            )
            Cancelled -> AuthResult.Failure(
                AuthResult.Reason.CANCELLED,
                "تم إلغاء تسجيل الدخول.",
            )
            is Failure -> AuthResult.Failure(
                AuthResult.Reason.PROVIDER,
                message,
            )
        }
    }
}
