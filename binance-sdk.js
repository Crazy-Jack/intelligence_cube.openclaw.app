// binance-sdk.js - Bundled Binance Web3 Wallet SDK for browser use
// This file will be bundled by Vite with proper crypto polyfills

import { getProvider } from '@binance/w3w-ethereum-provider';
import { utf8ToHex } from '@binance/w3w-utils';

// Export to window for use in non-module scripts
window.BINANCE_W3W_GET_PROVIDER = getProvider;

// Export utility functions
window.BINANCE_W3W_UTILS = window.BINANCE_W3W_UTILS || {};
window.BINANCE_W3W_UTILS.utf8ToHex = utf8ToHex;

// Also export for ES module usage
export { getProvider, utf8ToHex };

console.log('[Binance SDK] ✓ Loaded from npm bundle (with utils)');

