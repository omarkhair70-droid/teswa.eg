package com.teswa.mobile.shell

import android.content.Intent
import java.net.URI

sealed interface NativeRoute {
    data class Item(val id: String) : NativeRoute
    data class Deal(val id: String) : NativeRoute
    data class Offer(val id: String) : NativeRoute
    data class Profile(val id: String) : NativeRoute
    data class Direct(val id: String) : NativeRoute
    data class Contextual(val id: String) : NativeRoute
    data object Notifications : NativeRoute
}

object NativeRouteParser {
    fun fromIntent(intent: Intent?): String? = intent?.getStringExtra(EXTRA_ROUTE)?.let(::canonical)
        ?: intent?.dataString?.let(::canonical)

    fun parse(raw: String?): NativeRoute? {
        val canonical = canonical(raw) ?: return null
        if (canonical == "/notifications") return NativeRoute.Notifications
        val parts = canonical.trim('/').split('/')
        if (parts.size != 2 || !UUID.matches(parts[1])) return null
        return when (parts[0]) {
            "item" -> NativeRoute.Item(parts[1])
            "deal" -> NativeRoute.Deal(parts[1])
            "offer" -> NativeRoute.Offer(parts[1])
            "profile" -> NativeRoute.Profile(parts[1])
            "direct" -> NativeRoute.Direct(parts[1])
            "contextual" -> NativeRoute.Contextual(parts[1])
            else -> null
        }
    }

    fun canonical(raw: String?): String? {
        val clean = raw?.trim()?.takeIf(String::isNotEmpty) ?: return null
        if (clean.startsWith('/')) return clean.substringBefore('?').substringBefore('#')
        val uri = runCatching { URI(clean) }.getOrNull() ?: return null
        return when (uri.scheme?.lowercase()) {
            "https", "http" -> if (uri.host.equals("teswa.eg", ignoreCase = true) || uri.host.equals("www.teswa.eg", ignoreCase = true)) uri.path else null
            "teswa" -> buildString {
                append('/')
                uri.host?.takeIf(String::isNotBlank)?.let(::append)
                uri.path?.let(::append)
            }
            else -> null
        }?.trim()?.takeIf { it.startsWith('/') }
    }

    const val EXTRA_ROUTE = "teswa.route"
    private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
}
