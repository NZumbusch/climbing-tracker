#!/bin/bash

# Install dependencies
npm install

# Build the Svelte app
npm run build

# Initialize Capacitor (if not already done, though cap init was run)
# npx cap init boulder-tracker com.example.bouldertracker --web-dir dist

# Add the Android platform
npx cap add android

# Sync the web assets to the Android project
npx cap sync android

# Set Android Studio path for Capacitor
export CAPACITOR_ANDROID_STUDIO_PATH="/opt/android-studio/bin/studio.sh"

# Open Android Studio
npx cap open android
