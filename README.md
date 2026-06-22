# Climbing Tracker

A progressive web app built with Svelte and Vite to track your bouldering and climbing workouts.

## Features
- Track training load across different climbing styles and exercises
- Comprehensive dashboard and analytics
- Supports periodization and workout templates
- Exports and imports training data to JSON
- Offline support (using localForage)
- Mobile-ready, can be compiled as an Android app using Capacitor

## Setup for Web

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

## Android Development (Capacitor)

This project uses Capacitor to compile the web app into a native Android app.

1. **Setup Android environment:**
   Ensure you have Android Studio installed.
   ```bash
   ./setup-android.sh
   ```

2. **Build and open in Android Studio:**
   ```bash
   ./run_android.sh
   ```

## Deploying to GitHub Pages

This project is configured to be automatically deployed to GitHub Pages using GitHub Actions. Any push to the `main` or `master` branch will trigger a deployment.
