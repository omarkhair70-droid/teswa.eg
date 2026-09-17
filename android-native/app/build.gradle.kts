import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

fun buildConfigString(value: String): String =
    "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val rehearsalApiBaseUrl = "https://130-110-122-142.sslip.io"
val releaseApiBaseUrl = providers.environmentVariable("TESWA_RELEASE_API_BASE_URL")
    .orNull
    ?.trim()
    ?.trimEnd('/')
    ?.takeIf(String::isNotEmpty)
val releaseApiReady = releaseApiBaseUrl?.let { value ->
    runCatching {
        val uri = URI(value)
        uri.scheme.equals("https", ignoreCase = true) &&
            !uri.host.isNullOrBlank() &&
            uri.query == null &&
            uri.fragment == null
    }.getOrDefault(false)
} ?: false

val releaseStoreFile = providers.environmentVariable("TESWA_RELEASE_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("TESWA_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("TESWA_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("TESWA_RELEASE_KEY_PASSWORD").orNull
val releaseSigningReady = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "com.teswa.mobile"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.teswa.mobile"
        minSdk = 24
        targetSdk = 36
        versionCode = 27
        versionName = "1.0.11"

        // Rehearsal remains the compile/test fallback only. A distributable release artifact
        // requires an explicit TESWA_RELEASE_API_BASE_URL and overrides this value below.
        buildConfigField("String", "TESWA_API_BASE_URL", buildConfigString(rehearsalApiBaseUrl))
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"918426406146-dog29tsebc44ed5nsh71qirkt53l70in.apps.googleusercontent.com\"")
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("release") {
                storeFile = file(checkNotNull(releaseStoreFile))
                storePassword = checkNotNull(releaseStorePassword)
                keyAlias = checkNotNull(releaseKeyAlias)
                keyPassword = checkNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        getByName("release") {
            buildConfigField(
                "String",
                "TESWA_API_BASE_URL",
                buildConfigString(releaseApiBaseUrl ?: rehearsalApiBaseUrl),
            )
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

tasks.matching { it.name == "bundleRelease" || it.name == "assembleRelease" }.configureEach {
    doFirst {
        check(releaseSigningReady) {
            "Release signing requires TESWA_RELEASE_STORE_FILE, TESWA_RELEASE_STORE_PASSWORD, TESWA_RELEASE_KEY_ALIAS, and TESWA_RELEASE_KEY_PASSWORD."
        }
        check(releaseApiReady) {
            "Release artifact creation requires an explicit HTTPS TESWA_RELEASE_API_BASE_URL. The repository fallback is rehearsal-only and must not be shipped implicitly."
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.08.00")
    implementation(composeBom)

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")

    implementation("androidx.credentials:credentials:1.7.0-alpha03")
    implementation("androidx.credentials:credentials-play-services-auth:1.7.0-alpha03")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.google.firebase:firebase-installations")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
