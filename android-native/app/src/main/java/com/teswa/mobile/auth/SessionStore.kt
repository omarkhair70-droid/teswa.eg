package com.teswa.mobile.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun write(session: AuthSession) {
        val payload = JSONObject()
            .put("access_token", session.accessToken)
            .put("refresh_token", session.refreshToken)
            .put("expires_at", session.expiresAtEpochSeconds)
            .put(
                "user",
                JSONObject()
                    .put("id", session.user.id)
                    .put("email", session.user.email)
                    .put("phone", session.user.phone)
                    .put("display_name", session.user.displayName)
                    .put("avatar_url", session.user.avatarUrl),
            )
            .toString()
            .toByteArray(Charsets.UTF_8)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(payload)

        preferences.edit {
            putString(KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            putString(KEY_PAYLOAD, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
        }
    }

    fun read(): AuthSession? {
        val iv = preferences.getString(KEY_IV, null) ?: return null
        val encrypted = preferences.getString(KEY_PAYLOAD, null) ?: return null

        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
            )
            val plaintext = cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP))
            parseSession(JSONObject(String(plaintext, Charsets.UTF_8)))
        }.getOrElse {
            clear()
            null
        }
    }

    fun clear() {
        preferences.edit { clear() }
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun parseSession(json: JSONObject): AuthSession {
        val user = json.getJSONObject("user")
        return AuthSession(
            accessToken = json.getString("access_token"),
            refreshToken = userNullable(json, "refresh_token"),
            expiresAtEpochSeconds = if (json.isNull("expires_at")) null else json.getLong("expires_at"),
            user = AuthUser(
                id = user.getString("id"),
                email = userNullable(user, "email"),
                phone = userNullable(user, "phone"),
                displayName = userNullable(user, "display_name"),
                avatarUrl = userNullable(user, "avatar_url"),
            ),
        )
    }

    private fun userNullable(json: JSONObject, key: String): String? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optString(key).takeIf { it.isNotBlank() }
    }

    private companion object {
        const val PREFS_NAME = "teswa_native_auth"
        const val KEY_IV = "session_iv"
        const val KEY_PAYLOAD = "session_payload"
        const val KEY_ALIAS = "teswa.native.auth.session.v1"
        const val KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
