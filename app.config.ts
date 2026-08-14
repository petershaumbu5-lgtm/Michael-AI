// app.config.ts
import type { ExpoConfig } from "expo/config";

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,

  // ============================================================
  // IDENTITÉ DE L'APPLICATION
  // ============================================================

  name: "Michael AI",
  slug: "michael-ai",

  orientation: "portrait",

  // Nous garderons l'icône actuelle temporairement.
  // Nous la remplacerons ensuite par l'icône de Michael.
  icon: "./assets/images/icon.png",

  // Schéma utilisé pour les liens internes de l'application.
  scheme: "michael-ai",

  userInterfaceStyle: "automatic",

  // ============================================================
  // iOS
  // ============================================================

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.michaelai.app",
  },

  // ============================================================
  // ANDROID
  // ============================================================

  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#000000",
    },

    // Identifiant unique de Michael AI
    package: "com.michaelai.app",

    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
    ],
  },

  // ============================================================
  // WEB
  // ============================================================

  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },

  // ============================================================
  // PLUGINS
  // ============================================================

  plugins: [
    "expo-asset",
    "expo-router",
    "expo-sqlite",

    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
    ],

    "expo-audio",
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
    "expo-localization",

    [
      "expo-build-properties",
      {
        android: {
          // ProGuard désactivé pour le moment.
          // Nous ne touchons pas à cette partie.
        },
      },
    ],

    // ==========================================================
    // MOTEUR LOCAL LLAMA.CPP
    // ==========================================================

    [
      "llama.rn",
      {
        enableEntitlements: true,
        entitlementsProfile: "production",

        // Michael utilise C++20
        forceCxx20: true,

        // Conservé pour le moteur llama.cpp.
        enableOpenCLAndHexagon: true,
      },
    ],

    // ==========================================================
    // RECONNAISSANCE VOCALE
    // ==========================================================

    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "Allow $(PRODUCT_NAME) to use the microphone.",

        speechRecognitionPermission:
          "Allow $(PRODUCT_NAME) to use speech recognition.",

        androidSpeechServicePackages: [
          "com.google.android.googlequicksearchbox",
          "com.google.android.tts",
        ],
      },
    ],

    // ==========================================================
    // CONFIGURATION ANDROID DE MICHAEL AI
    // ==========================================================

    "./plugins/maid-android",
  ],

  // ============================================================
  // EXPERIMENTS EXPO
  // ============================================================

  experiments: {
    typedRoutes: true,
  },
});