package com.teswa.mobile.feature.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.teswa.mobile.MainActivity
import com.teswa.mobile.R
import com.teswa.mobile.shell.NativeRouteParser

class TeswaMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) {
        NativePushTokenStore(this).save(installationId)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        createChannel()
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val route = PushRouteResolver.resolve(message.data) ?: "/notifications"
        val intent = Intent(this, MainActivity::class.java)
            .putExtra(NativeRouteParser.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val requestCode = (message.messageId ?: route).hashCode()
        val pending = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = message.notification?.title ?: message.data["title"] ?: "تِسوى"
        val body = message.notification?.body ?: message.data["body"] ?: "عندك نشاط جديد على تِسوى."
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_teswa_notification)
            .setContentTitle(title.take(160))
            .setContentText(body.take(1_000))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.take(1_000)))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        NotificationManagerCompat.from(this).notify(requestCode, notification)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "نشاط تِسوى", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "العروض والصفقات والرسائل والنشاط المهم"
            },
        )
    }

    private companion object { const val CHANNEL_ID = "teswa-activity" }
}

object PushRouteResolver {
    fun resolve(data: Map<String, String>): String? {
        val explicit = NativeRouteParser.canonical(data["route"])
        if (NativeRouteParser.parse(explicit) != null) return explicit
        val direct = data["conversationId"].validId()?.let { "/direct/$it" }
        if (direct != null) return direct
        val contextual = data["contextualConversationId"].validId()?.let { "/contextual/$it" }
        if (contextual != null) return contextual
        val deal = data["dealId"].validId()?.let { "/deal/$it" }
        if (deal != null) return deal
        val offer = data["offerId"].validId()?.let { "/offer/$it" }
        if (offer != null) return offer
        val item = data["itemId"].validId()?.let { "/item/$it" }
        if (item != null) return item
        return data["actorUserId"].validId()?.let { "/profile/$it" }
    }

    private fun String?.validId() = this?.trim()?.takeIf { UUID.matches(it) }
    private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
}
