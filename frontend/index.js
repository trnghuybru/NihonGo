/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { initializeFlashcardNotifications } from './src/services/flashcardNotifications';

initializeFlashcardNotifications();

AppRegistry.registerComponent(appName, () => App);
