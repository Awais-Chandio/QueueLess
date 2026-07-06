/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Register background message handler
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  if (__DEV__) {
    console.log('[Background FCM] Message handled in the background!', remoteMessage);
  }
});

AppRegistry.registerComponent(appName, () => App);
