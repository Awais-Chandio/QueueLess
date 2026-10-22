/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
// Installs Inter as the default family for every <Text>/<TextInput>.
// Must stay above './App' so it runs before any screen module is evaluated.
import './src/theme/installGlobalFont';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
// Before './App' so errors during module evaluation are reported too.
import './src/lib/sentryInit';
import { Sentry } from './src/lib/sentry';
import App from './App';
import { name as appName } from './app.json';
import { logger } from './src/utils/logger';
import { isFirebaseReady } from './src/lib/firebase';

// Register background message handler (only when Firebase is configured; see src/lib/firebase.ts).
if (isFirebaseReady()) {
  setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
    if (__DEV__) {
      logger.log('[Background FCM] Message handled in the background!', remoteMessage);
    }
  });
}

AppRegistry.registerComponent(appName, () => Sentry.wrap(App));
