package com.teswa.mobile.app

import android.content.Context
import com.teswa.mobile.account.AccountGateRepository
import com.teswa.mobile.account.OracleAccountGateClient
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.OracleAuthClient
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.AndroidAddItemContentSource
import com.teswa.mobile.feature.additem.EditListingRepository
import com.teswa.mobile.feature.additem.OracleAddItemRepository
import com.teswa.mobile.feature.additem.OracleEditListingRepository
import com.teswa.mobile.feature.contextual.OracleContextualRepository
import com.teswa.mobile.feature.direct.OracleDirectRepository
import com.teswa.mobile.feature.discover.OracleDiscoverRepository
import com.teswa.mobile.feature.dolab.AndroidDolabAddItemHandoff
import com.teswa.mobile.feature.dolab.DolabAwareAddItemRepository
import com.teswa.mobile.feature.dolab.DolabPublishContextStore
import com.teswa.mobile.feature.dolab.OracleDolabPublishBridgeRepository
import com.teswa.mobile.feature.dolab.OracleDolabRepository
import com.teswa.mobile.feature.messages.OracleMessagingRepository
import com.teswa.mobile.feature.motion.AndroidCityPulseLocationResolver
import com.teswa.mobile.feature.motion.OracleMotionRepository
import com.teswa.mobile.feature.notifications.NativePushManager
import com.teswa.mobile.feature.notifications.OracleNotificationDispatcher
import com.teswa.mobile.feature.notifications.OracleNotificationsRepository
import com.teswa.mobile.feature.notifications.OraclePushRegistrationRepository
import com.teswa.mobile.feature.offers.OracleOffersRepository
import com.teswa.mobile.feature.people.OraclePeopleRepository
import com.teswa.mobile.feature.profile.AndroidProfileImageContentSource
import com.teswa.mobile.feature.profile.OracleProfileImageRepository
import com.teswa.mobile.feature.profile.OracleProfileRepository
import com.teswa.mobile.feature.profile.OraclePublicProfileRepository
import com.teswa.mobile.feature.reviews.OracleReviewRepository
import com.teswa.mobile.feature.safety.OracleReportingRepository
import com.teswa.mobile.feature.settings.OracleSettingsRepository
import com.teswa.mobile.feature.stories.AndroidStoryContentSource
import com.teswa.mobile.feature.stories.OracleStoryRepository
import com.teswa.mobile.feature.voice.OracleVoiceMediaRepository
import com.teswa.mobile.home.AndroidLocationProvider
import com.teswa.mobile.home.OracleHomeClient

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
    val discoverRepository = OracleDiscoverRepository(authRepository, oracleTransport)
    val peopleRepository = OraclePeopleRepository(authRepository, oracleTransport)
    val dolabRepository = OracleDolabRepository(authRepository, oracleTransport)
    val dolabPublishBridgeRepository = OracleDolabPublishBridgeRepository(authRepository, oracleTransport)
    private val dolabPublishContextStore = DolabPublishContextStore(appContext)
    val locationProvider = AndroidLocationProvider(appContext)
    val motionRepository = OracleMotionRepository(authRepository, oracleTransport)
    val motionLocationResolver = AndroidCityPulseLocationResolver(appContext, locationProvider)

    private val addItemContentSource = AndroidAddItemContentSource(appContext.contentResolver)
    private val oracleAddItemRepository = OracleAddItemRepository(
        authenticator = authRepository,
        contentSource = addItemContentSource,
        transport = oracleTransport,
    )
    val addItemRepository: AddItemRepository = DolabAwareAddItemRepository(
        delegate = oracleAddItemRepository,
        bridge = dolabPublishBridgeRepository,
        contextStore = dolabPublishContextStore,
    )
    val editListingRepository: EditListingRepository = OracleEditListingRepository(
        authenticator = authRepository,
        contentSource = addItemContentSource,
        transport = oracleTransport,
    )
    val dolabAddItemHandoff = AndroidDolabAddItemHandoff(
        context = appContext,
        dolabRepository = dolabRepository,
        publishBridge = dolabPublishBridgeRepository,
        addItemRepository = addItemRepository,
        publishContextStore = dolabPublishContextStore,
    )

    private val notificationDispatcher = OracleNotificationDispatcher(authRepository, oracleTransport)
    val voiceMediaRepository = OracleVoiceMediaRepository(authRepository, oracleTransport)
    val reviewRepository = OracleReviewRepository(authRepository, oracleTransport)
    val reportingRepository = OracleReportingRepository(authRepository, oracleTransport)
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
    val profileImageRepository = OracleProfileImageRepository(
        authenticator = authRepository,
        contentSource = AndroidProfileImageContentSource(appContext.contentResolver),
        transport = oracleTransport,
    )
    val publicProfileRepository = OraclePublicProfileRepository(authRepository, oracleTransport)
    val settingsRepository = OracleSettingsRepository(authRepository, oracleTransport)
    val notificationsRepository = OracleNotificationsRepository(authRepository, oracleTransport)
    val nativePushManager = NativePushManager(
        context = appContext,
        repository = OraclePushRegistrationRepository(authRepository, oracleTransport),
    )
}
