/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';

// Release builds still execute console.log, and many call sites print whole
// query results and realtime payloads, which serialises them on the JS thread.
// Warnings and errors are kept.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
// Installs Inter as the default family for every <Text>/<TextInput>.
// Must stay above './App' so it runs before any screen module is evaluated.
import './src/theme/installGlobalFont';
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
