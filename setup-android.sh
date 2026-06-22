#!/bin/bash

# Install dependencies
npm install

# Build the Svelte app
npm run build

# Add the Android platform (if not already added)
npx cap add android

# Sync the web assets to the Android project
npx cap sync android

# Uncomment and set this if capacitor cannot automatically find your Android Studio installation
# export CAPACITOR_ANDROID_STUDIO_PATH="/opt/android-studio/bin/studio.sh"

# Open Android Studio
npx cap open android
