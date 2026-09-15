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

    val addItemRepository = OracleAddItemRepository(
        authenticator = authRepository,
        contentSource = AndroidAddItemContentSource(appContext.contentResolver),
        transport = oracleTransport,
    )

    val messagingRepository = OracleMessagingRepository(authRepository, oracleTransport)
    val offersRepository = OracleOffersRepository(authRepository, oracleTransport)
    val profileRepository = OracleProfileRepository(authRepository, oracleTransport)
}
