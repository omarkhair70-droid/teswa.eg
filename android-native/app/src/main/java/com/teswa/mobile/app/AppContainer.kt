package com.teswa.mobile.app

import android.content.Context
import com.teswa.mobile.account.AccountGateRepository
import com.teswa.mobile.account.OracleAccountGateClient
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.OracleAuthClient
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.feature.additem.AndroidAddItemContentSource
import com.teswa.mobile.feature.additem.OracleAddItemRepository
import com.teswa.mobile.home.OracleHomeClient
import com.teswa.mobile.feature.messages.OracleMessagingRepository
import com.teswa.mobile.feature.offers.OracleOffersRepository
import com.teswa.mobile.feature.profile.OracleProfileRepository
import com.teswa.mobile.feature.profile.OraclePublicProfileRepository
import com.teswa.mobile.feature.settings.OracleSettingsRepository
import com.teswa.mobile.feature.notifications.OracleNotificationsRepository
import com.teswa.mobile.feature.notifications.OracleNotificationDispatcher
import com.teswa.mobile.feature.direct.OracleDirectRepository
import com.teswa.mobile.feature.contextual.OracleContextualRepository
import com.teswa.mobile.feature.stories.OracleStoryRepository
import com.teswa.mobile.feature.stories.AndroidStoryContentSource
import com.teswa.mobile.feature.voice.OracleVoiceMediaRepository
import com.teswa.mobile.home.AndroidLocationProvider

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val oracleTransport = HttpUrlConnectionOracleTransport()

    val authRepository = AuthRepository(
        context = appContext,
        oracle = OracleAuthClient(oracleTransport),
    )

    val accountGateRepository = AccountGateRepository(
        context = appContext,
        client = OracleAccountGateClient(authRepository, oracleTransport),
    )

    val homeClient = OracleHomeClient(authRepository, oracleTransport)
    val locationProvider = AndroidLocationProvider(appContext)

    val addItemRepository = OracleAddItemRepository(
        authenticator = authRepository,
        contentSource = AndroidAddItemContentSource(appContext.contentResolver),
        transport = oracleTransport,
    )

    private val notificationDispatcher = OracleNotificationDispatcher(authRepository, oracleTransport)
    val voiceMediaRepository = OracleVoiceMediaRepository(authRepository, oracleTransport)
    val messagingRepository = OracleMessagingRepository(authRepository, oracleTransport, notificationDispatcher, voiceMediaRepository)
    val offersRepository = OracleOffersRepository(authRepository, oracleTransport, notificationDispatcher)
    val directRepository = OracleDirectRepository(authRepository, oracleTransport, voiceMediaRepository)
    val contextualRepository = OracleContextualRepository(authRepository, oracleTransport, voiceMediaRepository)
    val storyRepository = OracleStoryRepository(
        authenticator = authRepository,
        transport = oracleTransport,
        contentSource = AndroidStoryContentSource(appContext.contentResolver),
        voiceMediaRepository = voiceMediaRepository,
    )
    val profileRepository = OracleProfileRepository(authRepository, oracleTransport)
    val publicProfileRepository = OraclePublicProfileRepository(authRepository, oracleTransport)
    val settingsRepository = OracleSettingsRepository(authRepository, oracleTransport)
    val notificationsRepository = OracleNotificationsRepository(authRepository, oracleTransport)
}
