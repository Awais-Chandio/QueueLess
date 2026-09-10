# QueueLess

QueueLess is a React Native mobile application designed for **appointment booking and queue management**. It provides a streamlined experience for users to discover service centers, book appointments, manage their profiles, and keep track of their queue status.

The application uses **React Navigation** for authentication and application flows, **Zustand** for local state management, and **Supabase** for backend authentication and profile services.

## Tech Stack

* **React Native** — Cross-platform mobile application development
* **React Navigation** — Navigation and authentication flows
* **Zustand** — Lightweight local state management
* **Supabase** — Authentication and backend profile services
* **TypeScript** — Type-safe application development

## Project Structure

The project follows a modular structure to keep navigation, screens, services, state, and styling organized.

```text
QueueLess/
├── App.tsx
├── src/
│   ├── navigation/
│   ├── screens/
│   ├── services/
│   ├── store/
│   └── theme/
├── android/
└── ios/
```

### Key Directories and Files

* **`App.tsx`**
  Restores the user's authentication session, initializes navigation, and renders the global toast UI.

* **`src/navigation/`**
  Contains the application's navigation configuration, including:

  * Authentication stack
  * Authenticated application stack
  * Bottom tab navigation

* **`src/screens/`**
  Contains the application's screens, including:

  * Authentication
  * Splash
  * Home
  * Centers
  * Appointments
  * Profile
  * Settings

* **`src/services/`**
  Contains service-layer helpers for Supabase, authentication, and user profile operations.

* **`src/store/`**
  Contains Zustand stores responsible for authentication state, profile data, and toast messages.

* **`src/theme/`**
  Centralizes reusable design tokens, including colors, typography, spacing, and border-radius values.

* **`android/`**
  Contains the native Android project configuration.

* **`ios/`**
  Contains the native iOS project configuration.

## Getting Started

QueueLess is built with [React Native](https://reactnative.dev/) and bootstrapped using the [`@react-native-community/cli`](https://github.com/react-native-community/cli).

Before setting up the project, make sure your development environment meets the requirements described in the official [React Native environment setup guide](https://reactnative.dev/docs/set-up-your-environment).

### Prerequisites

Make sure you have the following installed and configured:

* Node.js
* npm or Yarn
* React Native development environment
* Android Studio and an Android emulator/device for Android development
* Xcode and CocoaPods for iOS development on macOS

## Running the Application

### 1. Start Metro

Metro is the JavaScript bundler used by React Native.

From the project root, start the Metro development server:

```sh
# npm
npm start

# Yarn
yarn start
```

Keep Metro running while developing the application.

### 2. Run on Android

Open a new terminal from the project root and run:

```sh
# npm
npm run android

# Yarn
yarn android
```

The application will be built and launched on the connected Android device or emulator.

### 3. Run on iOS

For iOS development, install the project's dependencies before running the application.

Install the Ruby dependencies:

```sh
bundle install
```

Then install the CocoaPods dependencies:

```sh
bundle exec pod install
```

You should run `bundle exec pod install` again whenever native dependencies are added or updated.

For additional information, refer to the official [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

Once the dependencies are installed, launch the iOS application:

```sh
# npm
npm run ios

# Yarn
yarn ios
```

The application should launch in the iOS Simulator or on a connected iOS device.

You can also build and run the native projects directly using **Android Studio** or **Xcode**.

## Development

Once the application is running, you can begin modifying the source code.

For example, changes made to `App.tsx` will automatically be reflected in the running application through **Fast Refresh**.

Learn more about Fast Refresh in the [React Native documentation](https://reactnative.dev/docs/fast-refresh).

### Reloading the Application

If you need to perform a full reload, such as when resetting application state:

**Android**

* Press `R` twice.
* Or open the Dev Menu with `Ctrl + M` on Windows/Linux or `Cmd + M` on macOS and select **Reload**.

**iOS**

* Press `R` in the iOS Simulator.

## Troubleshooting

If you encounter issues while setting up or running QueueLess, review the official [React Native Troubleshooting guide](https://reactnative.dev/docs/troubleshooting).

Common setup issues may be related to:

* Incorrect Node.js or React Native environment configuration
* Android SDK configuration
* Xcode configuration
* CocoaPods dependencies
* Emulator or simulator setup
* Native dependency changes

## Learn More

For additional information about React Native and the tools used by this project, see the following resources:

* [React Native](https://reactnative.dev/) — Official React Native website and documentation.
* [React Native Environment Setup](https://reactnative.dev/docs/environment-setup) — Configure your development environment.
* [React Native Getting Started](https://reactnative.dev/docs/getting-started) — Learn the fundamentals of React Native.
* [Fast Refresh](https://reactnative.dev/docs/fast-refresh) — Learn how React Native updates changes during development.
* [React Native Blog](https://reactnative.dev/blog) — Official React Native announcements and updates.
* [`facebook/react-native`](https://github.com/facebook/react-native) — React Native's open-source GitHub repository.
* [`react-native-community/cli`](https://github.com/react-native-community/cli) — React Native Community CLI repository.

## License

Add the project's license information here if applicable.
