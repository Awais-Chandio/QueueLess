// Side-effect import: index.js loads this before './App', so Sentry is
// initialised before any app module is evaluated.
import { initSentry } from './sentry';

initSentry();
