import groovy.json.JsonSlurper

plugins {
    id("com.android.application") version "8.13.0"
    id("org.jetbrains.kotlin.android") version "2.2.21"
}

val projectRoot = rootProject.projectDir.resolve("../..")
val gameVersion = (JsonSlurper().parse(projectRoot.resolve("package.json")) as Map<*, *>)["version"] as String
val parts = gameVersion.split('.').map(String::toInt)
require(parts.size == 3 && parts[0] in 0..2099 && parts.drop(1).all { it in 0..999 }) { "Invalid Android version: $gameVersion" }

android {
    namespace = "com.ws4217.unfinishedorbit"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ws4217.unfinishedorbit"
        minSdk = 24
        targetSdk = 36
        versionName = gameVersion
        versionCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]
    }

    sourceSets["main"].assets.srcDir(projectRoot.resolve("dist"))
    sourceSets["main"].res.srcDir(layout.buildDirectory.dir("generated/orbitIcons"))
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

kotlin { jvmToolchain(21) }

tasks.named("preBuild") {
    doFirst {
        check(projectRoot.resolve("dist/index.html").isFile) { "Run npm run build at the repository root first" }
        check(layout.buildDirectory.file("generated/orbitIcons/mipmap-xxxhdpi/ic_launcher.png").get().asFile.isFile) {
            "Generate the Android launcher icon first; see LOCAL-README.md"
        }
    }
}
