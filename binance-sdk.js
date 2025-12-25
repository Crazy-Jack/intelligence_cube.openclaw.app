// binance-sdk.js - Bundled Binance Web3 Wallet SDK for browser use
// This file will be bundled by Vite with proper crypto polyfills

import { getProvider } from '@binance/w3w-ethereum-provider';

// Export to window for use in non-module scripts
window.BINANCE_W3W_GET_PROVIDER = getProvider;

// Also export for ES module usage
export { getProvider };

console.log('[Binance SDK] ✓ Loaded from npm bundle');

