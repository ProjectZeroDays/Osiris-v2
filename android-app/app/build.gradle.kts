plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.osiris.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.osiris.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // The instrumented tests run on a device, and the runner has to
        // be the one that finds JUnit4 tests. Without this, the default
        // is the legacy runner, which starts, finds nothing, and reports
        // a successful run with zero tests — which is the same as no
        // test at all.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
        freeCompilerArgs += listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.material.ExperimentalMaterialApi"
        )
    }
    buildFeatures {
        compose = true
    }
    testOptions {
        // A JVM unit test has no Android framework behind it: `android.jar`
        // is a set of stubs whose methods throw "Stub!". The session calls
        // `android.util.Log`, and reaches the keystore before falling back
        // to plain preferences. Returning defaults lets that code run to
        // its fallbacks — which is the behaviour under test — instead of
        // dying on the first logging call.
        unitTests.isReturnDefaultValues = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    // The version comes from the BOM above. `ui-text` carries TextAlign and
    // `foundation` carries Modifier.clickable; neither is pulled in by `ui`.
    implementation("androidx.compose.ui:ui-text")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.foundation:foundation-layout")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")
    // The session token is kept in encrypted preferences, whose key lives
    // in the Android keystore rather than in the app's own files.
    implementation("androidx.security:security-crypto:1.0.0")
    testImplementation("junit:junit:4.13.2")
    // The Android SDK's own `org.json` classes are stubs on the JVM test
    // classpath: every method throws "Stub!". The app parses the platform's
    // registry with them, so a unit test needs the real implementation to
    // parse with. Test-only — the app ships Android's own.
    testImplementation("org.json:json:20240303")
    // The session keeps its token in preferences behind a `Context`. The
    // wire tests below drive `PlatformSession` on the JVM, so they need a
    // `Context` that answers for a device. mockk stands one up.
    testImplementation("io.mockk:mockk:1.13.9")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.02.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
