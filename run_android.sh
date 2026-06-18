#!/bin/bash

# Build the Svelte app
npm run build

# Sync the web assets to the Android project
npx cap sync android

# Set Android Studio path for Capacitor
export CAPACITOR_ANDROID_STUDIO_PATH="/opt/android-studio/bin/studio.sh"

# Open Android Studio
npx cap open android
