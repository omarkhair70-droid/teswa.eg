package com.teswa.mobile.app

import android.content.Context
import com.teswa.mobile.account.AccountGateRepository
import com.teswa.mobile.account.OracleAccountGateClient
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.OracleAuthClient
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
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
}
