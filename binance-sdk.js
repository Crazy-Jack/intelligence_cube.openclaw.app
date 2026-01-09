// binance-sdk.js - Bundled Binance Web3 Wallet SDK for browser use
// This file will be bundled by Vite with proper crypto polyfills

import { getProvider } from '@binance/w3w-ethereum-provider';
import * as w3wUtils from '@binance/w3w-utils';

// Export to window for use in non-module scripts
window.BINANCE_W3W_GET_PROVIDER = getProvider;

// Export all utility functions (including utf8ToHex, getDeeplink, etc.)
window.BINANCE_W3W_UTILS = w3wUtils;

// Also export for ES module usage
export { getProvider };
export * from '@binance/w3w-utils';

console.log('[Binance SDK] ✓ Loaded from npm bundle (with all utils)');

