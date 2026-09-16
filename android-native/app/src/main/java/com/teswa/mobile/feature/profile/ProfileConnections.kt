package com.teswa.mobile.feature.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession
import org.json.JSONObject

enum class ProfileConnectionsMode(val apiValue: String, val title: String) {
    FOLLOWERS("followers", "المتابعون"),
    FOLLOWING("following", "يتابع"),
}

data class ProfileConnection(
    val profileId: String,
    val displayName: String?,
    val username: String?,
    val avatarUrl: String?,
    val city: String?,
    val area: String?,
)

internal fun parseProfileConnections(body: JSONObject): List<ProfileConnection>? {
    val raw = body.optJSONArray("items") ?: return null
    val seen = mutableSetOf<String>()
    return buildList {
        for (index in 0 until raw.length()) {
            val row = raw.optJSONObject(index) ?: return null
            val id = row.optString("profileId").trim()
            if (!PROFILE_CONNECTION_UUID.matches(id)) return null
            if (!seen.add(id)) continue
            add(
                ProfileConnection(
                    profileId = id,
                    displayName = nullableConnectionString(row, "displayName"),
                    username = nullableConnectionString(row, "username"),
                    avatarUrl = nullableConnectionString(row, "avatarUrl"),
                    city = nullableConnectionString(row, "city"),
                    area = nullableConnectionString(row, "area"),
                ),
            )
        }
    }
}

private val PROFILE_CONNECTION_UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
private fun nullableConnectionString(body: JSONObject, key: String): String? =
    if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)

sealed interface ProfileConnectionsUiState {
    data object Loading : ProfileConnectionsUiState
    data class Ready(val items: List<ProfileConnection>) : ProfileConnectionsUiState
    data class Error(val message: String) : ProfileConnectionsUiState
}

class ProfileConnectionsStateHolder(
    initialSession: AuthSession,
    private val profileId: String,
    private val mode: ProfileConnectionsMode,
    private val repository: PublicProfileRepository,
) {
    var session by mutableStateOf(initialSession); private set
    var state by mutableStateOf<ProfileConnectionsUiState>(ProfileConnectionsUiState.Loading); private set
    var sessionExpired by mutableStateOf(false); private set

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    suspend fun load() {
        state = ProfileConnectionsUiState.Loading
        when (val result = repository.loadConnections(session, profileId, mode)) {
            is ProfileResult.Success -> {
                session = result.session
                sessionExpired = false
                state = ProfileConnectionsUiState.Ready(result.value)
            }
            is ProfileResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                state = ProfileConnectionsUiState.Error(result.message)
            }
        }
    }
}
