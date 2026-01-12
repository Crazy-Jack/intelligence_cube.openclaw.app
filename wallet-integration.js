// wallet-integration.js - 通用钱包集成脚本 (更新为I3 tokens术语，添加钱包选择功能)
// 在所有需要钱包功能的页面中使用

/**
 * Remove "Recommended" badge from Binance W3W SDK modal
 * The SDK doesn't provide official customization options, so we use DOM manipulation
 */
(function initBinanceBadgeRemover() {
  let observerActive = false;
  
  const removeBinanceBadge = () => {
    const wrapper = document.getElementById('binanceW3W-wrapper');
    if (!wrapper) return;
    
    // Target the "Recommended" badge by its class combination
    const selectors = [
      '.w3w-t-subtitle3.absolute.top-0.right-0',
      '.absolute.top-0.right-0.h-5',
      '[class*="w3w-t-subtitle3"][class*="absolute"]'
    ];
    
    selectors.forEach(selector => {
      try {
        const badges = wrapper.querySelectorAll(selector);
        badges.forEach(badge => {
          // Check if it contains "Recommended" text or has the green color
          if (badge.textContent?.includes('Recommended') || 
              badge.className?.includes('2EBD85') ||
              badge.className?.includes('subtitle3')) {
            badge.style.display = 'none';
            badge.style.visibility = 'hidden';
            badge.style.opacity = '0';
            badge.style.width = '0';
            badge.style.height = '0';
            badge.style.overflow = 'hidden';
          }
        });
      } catch (e) {
        // Silently ignore selector errors
      }
    });
  };
  
  // Use MutationObserver to watch for Binance modal injection
  const startObserver = () => {
    if (observerActive) return;
    observerActive = true;
    
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if binanceW3W-wrapper was added
          const hasWrapper = document.getElementById('binanceW3W-wrapper');
          if (hasWrapper) {
            // Run removal multiple times with delays to catch late-rendered elements
            removeBinanceBadge();
            setTimeout(removeBinanceBadge, 100);
            setTimeout(removeBinanceBadge, 300);
            setTimeout(removeBinanceBadge, 500);
          }
        }
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
  };
  
  // Start observer when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();

/**
 * 显示钱包选择模态框 - 新增功能
 */
function showWalletSelectionModal() {
  const modal = document.getElementById('walletModal');
  if (modal) {
    // 确保重置所有样式
    modal.style.transform = 'none';
    modal.style.transition = 'none';
    modal.style.display = 'flex';
   
    modal.classList.add('show');

    // === Filter wallet options by selected network ===
    try {
      const preferred = getPreferredNetwork?.();
      
      // If no preference is set, show all wallets
      if (!preferred) {
         modal.querySelectorAll('.wallet-option').forEach(el => {
            el.style.display = 'flex';
            el.classList.remove('disabled');
            el.style.pointerEvents = 'auto';
            el.style.opacity = '1';
         });
         return;
      }

      const isEvm = preferred.kind === 'evm';

      // 你的按钮是 class="wallet-option"，onclick 分别是 connectMetaMaskWallet / connectWalletConnect / connectCoinbaseWallet / connectSolanaPhantom
      const items = modal.querySelectorAll('.wallet-option');

      items.forEach(el => {
        const onClick = (el.getAttribute('onclick') || '').toLowerCase();
        const isEvmWallet = /connectmetamaskwallet|connectwalletconnect|connectcoinbasewallet|connectbinancewallet/.test(onClick);
        const isSolWallet = /connectsolanaphantom/.test(onClick);

        if ((isEvm && isEvmWallet) || (!isEvm && isSolWallet)) {
          el.style.display = 'flex';        // 保持原有布局
          el.classList.remove('disabled');
          el.style.pointerEvents = 'auto';
          el.style.opacity = '1';
        } else {
          el.style.display = 'none';        // 隐藏不匹配的钱包
          // 如果你想“置灰”而不是隐藏，可以用下面三行替代:
          // el.classList.add('disabled');
          // el.style.pointerEvents = 'none';
          // el.style.opacity = '0.5';
        }
      });
    } catch (e) {
      console.warn('filterWalletOptions failed:', e);
    }

  } else {
    console.error('Wallet modal not found in DOM');
  }
}

/**
 * 关闭钱包选择模态框
 */
function closeWalletModal() {
    const modal = document.getElementById('walletModal');
    if (modal) {
        // 立即移除show类，不使用动画
        modal.classList.remove('show');
        modal.style.display = 'none';
        // 确保重置所有可能的transform属性
        modal.style.transform = 'none';
        modal.style.transition = 'none';
    }
}

// === Binance W3W Utility Functions ===

/**
 * Request a personal signature from the connected Binance wallet
 * This can be used to verify the wallet connection
 * @param {string} message - The message to sign
 * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
 */
async function signMessageWithBinance(message = 'Sign this message to verify your wallet connection to Intelligence Cubed') {
  try {
    if (!window.walletManager || !window.walletManager.isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }

    const provider = window.walletManager.ethereum;
    if (!provider || typeof provider.request !== 'function') {
      return { success: false, error: 'No provider available' };
    }

    const account = window.walletManager.walletAddress;
    if (!account) {
      return { success: false, error: 'No account address' };
    }

    // Convert message to hex (using w3w-utils if available, otherwise manual conversion)
    let messageHex;
    if (window.BINANCE_W3W_UTILS && typeof window.BINANCE_W3W_UTILS.utf8ToHex === 'function') {
      messageHex = window.BINANCE_W3W_UTILS.utf8ToHex(message);
    } else {
      // Manual UTF-8 to hex conversion
      messageHex = '0x' + Array.from(new TextEncoder().encode(message))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    console.log('[Binance] Requesting signature for message:', message);

    const signature = await provider.request({
      method: 'personal_sign',
      params: [messageHex, account]
    });

    console.log('[Binance] Signature received:', signature?.slice(0, 20) + '...');
    return { success: true, signature };

  } catch (error) {
    console.error('[Binance] Signature error:', error);
    if (error?.code === 4001) {
      return { success: false, error: 'User rejected the signature request' };
    }
    return { success: false, error: error?.message || 'Signature failed' };
  }
}

// Export to window
window.signMessageWithBinance = signMessageWithBinance;

// === Binance W3W Provider event listeners ===
function setupBinanceW3WListeners(provider) {
  if (!provider || typeof provider.on !== 'function') return;

  console.log('[Binance] Setting up W3W provider event listeners');

  provider.on('accountsChanged', (accounts) => {
    console.log('[Binance] W3W accountsChanged:', accounts);
    if (!accounts || accounts.length === 0) {
      if (window.walletManager) {
        window.walletManager.disconnectWallet();
      }
      return;
    }

    const nextAddress = accounts[0];
    if (window.walletManager && nextAddress !== window.walletManager.walletAddress) {
      if (window.walletManager.walletAddress) {
        window.walletManager.saveWalletSpecificData();
      }
      window.walletManager.walletAddress = nextAddress;
      window.walletManager.loadWalletSpecificData();
      window.walletManager.saveToStorage();
      window.walletManager.updateUI();
      window.dispatchEvent(new CustomEvent('walletConnected', {
        detail: {
          address: nextAddress,
          credits: window.walletManager.credits || 0,
          isNewUser: !window.walletManager.getWalletData(nextAddress)
        }
      }));
    }
  });

  provider.on('chainChanged', (newChainId) => {
    console.log('[Binance] W3W chainChanged:', newChainId);
    try {
      const info = mapChainIdToDisplay(newChainId, 'binance');
      renderNetworkBadge(info);
    } catch (e) {
      console.warn('[Binance] Failed to update network badge:', e);
    }
  });

  provider.on('disconnect', () => {
    console.log('[Binance] W3W disconnected');
    if (window.walletManager) {
      window.walletManager.disconnectWallet();
    }
  });
}

// === Binance deeplink debug (minimal) ===
function i3_bncDebugEnabled() {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('bncdebug') === '1') return true;
    return localStorage.getItem('__i3_bncdebug') === '1';
  } catch (_) {
    return false;
  }
}

function i3_bncLog(stage, payload) {
  if (!i3_bncDebugEnabled()) return;
  try {
    console.log('[BNC]', stage, payload ?? '');
  } catch (_) {}
}

function i3_bncProbeEnv(stage) {
  if (!i3_bncDebugEnabled()) return;
  const utils = window.BINANCE_W3W_UTILS;
  let isInBinance = null;
  try {
    if (typeof utils?.isInBinance === 'function') isInBinance = !!utils.isInBinance();
  } catch (_) {}
  const eth = window.ethereum;
  i3_bncLog(stage, {
    href: window.location.href,
    ua_has_binance: /Binance/i.test(navigator.userAgent),
    utils_present: !!utils,
    utils_isInBinance: isInBinance,
    injected: {
      binancew3w: !!window.binancew3w?.ethereum,
      ethereum: !!eth,
      ethereum_isBinance: !!eth?.isBinance,
      ethereum_isMetaMask: !!eth?.isMetaMask,
      providers_len: Array.isArray(eth?.providers) ? eth.providers.length : null,
    },
    visibility: document.visibilityState,
  });
}

// === 工具函数 ===
// 等待 provider 返回非空账户（初次授权常见需要等几百毫秒）
async function waitForAccounts(provider, { totalMs = 15000, stepMs = 300, reqTimeoutMs = 1500 } = {}) {
  const deadline = Date.now() + totalMs;

  while (Date.now() < deadline) {
    try {
      // ✅ 每次 eth_accounts 请求加超时，防止在假 provider 环境永远卡住
      const accts = await Promise.race([
        provider.request({ method: 'eth_accounts' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('eth_accounts timeout')), reqTimeoutMs))
      ]);

      if (Array.isArray(accts) && accts[0]) return accts[0];
    } catch (e) {
      // 吃掉 timeout/临时错误，继续轮询
    }

    await new Promise(r => setTimeout(r, stepMs));
  }

  throw new Error('Timed out waiting for wallet accounts');
}

// ✅ 强信号函数：检测是否有真正可用的 Binance EVM provider
// 用于区分 "真正的 Web3 Wallet dApp browser" vs "普通 Explorer/SafariView（tonbridge）"
function hasStrongBinanceEvmProvider() {
  try {
    if (window.binanceChain && typeof window.binanceChain.request === 'function') return true;
    if (window.BinanceChain && typeof window.BinanceChain.request === 'function') return true;
    if (window.binancew3w?.ethereum && typeof window.binancew3w.ethereum.request === 'function') return true;
    if (window.ethereum?.isBinance) return true;
    if (Array.isArray(window.ethereum?.providers) && window.ethereum.providers.some(p => p?.isBinance)) return true;
  } catch (_) {}
  return false;
}

// 检测是否为移动设备
function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
         (window.innerWidth <= 768 && 'ontouchstart' in window);
}

// 检测是否为真机（而非 DevTools 模拟）
function isRealMobileDevice() {
  const ua = navigator.userAgent;
  const isMobileUA = /iPhone|iPad|iPod|Android/i.test(ua);
  const isTouchDevice = 'ontouchstart' in window;
  const isSmallScreen = window.innerWidth <= 768;
  
  // 真机特征：移动 UA + 触摸支持 + 小屏幕
  return isMobileUA && isTouchDevice && isSmallScreen;
}

// === Binance deeplink flags (do NOT affect other wallets) ===
// ✅ 停用旧的 i3ac 自动重连标记
function i3_withBinanceFlags(rawUrl, { autoConnect = false } = {}) {
  try {
    const u = new URL(rawUrl, window.location.origin);

    // 你如果还想保留 bnc=1 作为"来源标记"可以留着；
    // 但不要再设置 i3ac（自动重连触发器）
    if (!u.searchParams.has('bnc') && !u.searchParams.has('binance')) {
      u.searchParams.set('bnc', '1');
    }

    // 不再写入 i3ac（无论 autoConnect 传什么都忽略）
    u.searchParams.delete('i3ac');

    return u.toString();
  } catch (_) {
    const sep = rawUrl.includes('?') ? '&' : '?';
    // 不再拼接 i3ac
    return rawUrl + sep + 'bnc=1';
  }
}

function i3_consumeUrlParam(paramName) {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(paramName)) return;
    u.searchParams.delete(paramName);
    history.replaceState(null, '', u.toString());
  } catch (_) {}
}

function i3_setUrlParam(paramName, value) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set(paramName, String(value));
    history.replaceState(null, '', u.toString());
  } catch (_) {}
}

// 打开 Binance Web3 Wallet dApp browser 的 deeplink 辅助函数（debug: show both links）
function openBinanceDappBrowser(url, chainIdHex) {
  url = i3_withBinanceFlags(url, { autoConnect: false });
  const utils = window.BINANCE_W3W_UTILS;
  const getLink = utils?.getDeeplink || utils?.getDeepLink;
  if (typeof getLink !== "function") {
    i3_bncLog('deeplink.no_utils', { utils_present: !!utils, has_getLink: typeof getLink });
    return false;
  }
  let chainIdNum;
  try { chainIdNum = chainIdHex ? parseInt(chainIdHex, 16) : undefined; } catch (_) { chainIdNum = undefined; }
  const { http, bnc } = getLink(url, chainIdNum) || {};
  i3_bncProbeEnv('before_deeplink');
  i3_bncLog('deeplink.links', { bnc, http, chainIdNum, url });
  const targetBnc = bnc || '';
  const targetHttp = http || '';

  // --- debug 模式：弹出二选一按钮，确保 iOS 仍然是"用户手势同步触发" ---
  if (i3_bncDebugEnabled()) {
    const id = 'i3-bnc-linkpicker';
    if (!document.getElementById(id)) {
      const wrap = document.createElement('div');
      wrap.id = id;
      wrap.style.position = 'fixed';
      wrap.style.left = '12px';
      wrap.style.right = '12px';
      wrap.style.bottom = '80px';
      wrap.style.zIndex = '100000';
      wrap.style.background = 'rgba(0,0,0,0.85)';
      wrap.style.color = '#fff';
      wrap.style.fontFamily = 'monospace';
      wrap.style.fontSize = '12px';
      wrap.style.padding = '10px';
      wrap.style.borderRadius = '10px';
      wrap.innerHTML = `
        <div style="margin-bottom:8px;">[BNC] Pick a deeplink (iOS must be user-gesture)</div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <button id="i3-bnc-open-bnc" style="flex:1; padding:10px;">Open BNC</button>
          <button id="i3-bnc-open-http" style="flex:1; padding:10px;">Open HTTP</button>
          <button id="i3-bnc-close" style="padding:10px;">X</button>
        </div>
        <div style="word-break:break-all; opacity:0.9;">bnc: ${targetBnc || '(empty)'}</div>
        <div style="word-break:break-all; opacity:0.9; margin-top:6px;">http: ${targetHttp || '(empty)'}</div>
      `;
      document.body.appendChild(wrap);
      const close = () => { try { wrap.remove(); } catch (_) {} };
      wrap.querySelector('#i3-bnc-close')?.addEventListener('click', () => {
        i3_bncLog('picker.close', {});
        close();
      });
      wrap.querySelector('#i3-bnc-open-bnc')?.addEventListener('click', () => {
        if (!targetBnc) return i3_bncLog('picker.bnc_empty', {});
        i3_bncLog('navigate.bnc', { target: targetBnc });
        close();
        window.location.href = targetBnc;
      });
      wrap.querySelector('#i3-bnc-open-http')?.addEventListener('click', () => {
        if (!targetHttp) return i3_bncLog('picker.http_empty', {});
        i3_bncLog('navigate.http', { target: targetHttp });
        close();
        window.location.href = targetHttp;
      });
    }
    return true;
  }

  // --- 非 debug：保持你当前策略（移动端优先 bnc） ---
  const target = bnc || http;
  if (!target) return false;
  window.location.href = target;
  return true;
}

// 是否处在 Binance App 的 dApp browser / Binance 环境
// ✅ 只相信真实注入/UA，不再吃 i3ac/bnc/SessionStorage 标记
function isInBinanceEnv() {
  try {
    const ua = (navigator.userAgent || '').toLowerCase();

    // 真实注入（最可靠）
    const hasBinanceChain = typeof window.BinanceChain !== 'undefined';
    const hasBinanceEvm = !!(window.binance && window.binance.ethereum);

    // UA 仅作辅助（不要再用 URL/sessionStorage 作为"在 binance 环境"的依据）
    const uaLooksBinance =
      ua.includes('binance') ||
      ua.includes('binancewebview') ||
      ua.includes('bnc');

    return hasBinanceChain || hasBinanceEvm || (uaLooksBinance && (hasBinanceChain || hasBinanceEvm));
  } catch (e) {
    return false;
  }
}

// 等待 Binance provider 注入（in-app browser 注入有时是异步的）
async function waitForBinanceProvider({ totalMs = 3000, stepMs = 150 } = {}) {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    // 首先尝试 getBinanceProvider
    let p = getBinanceProvider();
    if (p && typeof p.request === 'function') {
      console.log('[waitForBinanceProvider] Found provider via getBinanceProvider');
      return p;
    }
    
    // ✅ 补丁3: 在 Binance 环境里，直接接受 window.ethereum（即使带 isMetaMask 等兼容标记）
    if (window.ethereum && typeof window.ethereum.request === 'function') {
      if (isInBinanceEnv()) {
        console.log('[waitForBinanceProvider] In Binance env, using window.ethereum directly');
        return window.ethereum;
      }
      
      // 原有保守逻辑：移动端且没有其他钱包标记时，可能就是币安
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isOtherWallet = window.ethereum.isMetaMask || 
                            window.ethereum.isCoinbaseWallet || 
                            window.ethereum.isTrust ||
                            window.ethereum.isPhantom;
      
      if (isMobile && !isOtherWallet) {
        console.log('[waitForBinanceProvider] Found window.ethereum on mobile (assuming Binance)');
        return window.ethereum;
      }
    }
    
    await new Promise(r => setTimeout(r, stepMs));
  }
  return null;
}

function getBinanceProvider() {
  // 1. Binance App 内置浏览器（推荐）
  if (window.binanceChain && typeof window.binanceChain.request === 'function') {
    console.log('[Binance] Found window.binanceChain (in-app browser)');
    return window.binanceChain;
  }

  // 2. 旧版 BinanceChain（legacy）
  if (window.BinanceChain && typeof window.BinanceChain.request === 'function') {
    console.log('[Binance] Found window.BinanceChain (legacy)');
    return window.BinanceChain;
  }

  // 3. Chrome Extension: window.binancew3w.ethereum
  if (window.binancew3w && window.binancew3w.ethereum) {
    console.log('[Binance] Found window.binancew3w.ethereum (extension)');
    return window.binancew3w.ethereum;
  }

  // 4. window.ethereum.isBinance 标记
  if (window.ethereum && window.ethereum.isBinance) {
    console.log('[Binance] Found window.ethereum.isBinance');
    return window.ethereum;
  }

  // 5. 🔑 多 provider 场景：从 window.ethereum.providers 数组中找 Binance
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    const binanceP = window.ethereum.providers.find(p => p && p.isBinance);
    if (binanceP) {
      console.log('[Binance] Found Binance in ethereum.providers[]');
      return binanceP;
    }
  }

  // 6. 🔑 Fallback：如果没有明确的 Binance 标记，检查通用 window.ethereum
  // 关键修复：在 Binance in-app 环境里，即使它带 isMetaMask 等兼容标记，也允许使用
  if (window.ethereum && typeof window.ethereum.request === 'function') {
    if (isInBinanceEnv()) {
      console.log('[Binance] In Binance environment; using window.ethereum as provider fallback');
      return window.ethereum;
    }
    // 非 Binance 环境：避免误把 MetaMask/Coinbase/Trust 等当成 Binance
    if (window.ethereum.isMetaMask ||
        window.ethereum.isCoinbaseWallet ||
        window.ethereum.isTrust ||
        window.ethereum.isTokenPocket) {
      console.warn('[Binance] window.ethereum is from another wallet (MetaMask/Coinbase/etc), NOT using it for Binance');
      return null;
    }
    console.log('[Binance] Fallback to generic window.ethereum provider (not marked as other wallets)');
    return window.ethereum;
  }

  console.warn('[Binance] No Binance provider found.', {
    binanceChain: !!window.binanceChain,
    BinanceChain: !!window.BinanceChain,
    binancew3w: !!window.binancew3w,
    ethereumIsBinance: !!window.ethereum?.isBinance,
    ethereumProviders: window.ethereum?.providers?.map(p => ({
      isBinance: !!p.isBinance,
      isMetaMask: !!p.isMetaMask,
      isCoinbaseWallet: !!p.isCoinbaseWallet
    })) || null
  });
  
  return null;
}

/**
 * 连接 MetaMask 钱包 - 从模态框调用
 */
// 1) MetaMask —— 桌面走 extension，手机走 deep link 到 MetaMask App
async function connectMetaMaskWallet() {
  let preferred = getPreferredNetwork();
  // Auto-select Ethereum if no preference is set
  if (!preferred) {
      setPreferredNetwork('ethereum');
      preferred = getPreferredNetwork();
  }
  
  if (!preferred || preferred.kind !== 'evm') {
    showNotification('Invalid network: Please choose an EVM network first.', 'error');
    try { openNetworkPickerModal?.(); } catch (_) {}
    return;
  }

  const isMobileEnv = isMobileDevice() || isRealMobileDevice();
  
  // === 手机端处理逻辑 ===
  if (isMobileEnv) {
    const provider = window.ethereum;
    const hasMetaMaskProvider = provider && provider.isMetaMask === true;
    
    console.log('[Connect][MetaMask] Mobile env, hasMetaMaskProvider:', hasMetaMaskProvider);
    
    // 如果没有任何 MetaMask provider，直接打开 deep link
    if (!hasMetaMaskProvider) {
      console.log('[Connect][MetaMask] No MetaMask provider → opening deep link');
      try { closeWalletModal?.(); } catch (_) {}
      
      const currentUrl = window.location.href;
      const urlWithoutProtocol = currentUrl.replace(/^https?:\/\//, '');
      const metamaskDeepLink = `https://metamask.app.link/dapp/${urlWithoutProtocol}`;
      
      window.location.href = metamaskDeepLink;
      return;
    }
    
    // 有 provider，尝试直接连接（带超时），如果失败则回退到 deep link
    console.log('[Connect][MetaMask] Has provider, trying direct connection...');
    try {
      // 先确保切到正确的链
      await enforcePreferredEvmChain(provider);
      
      // 尝试请求账户，设置超时（3秒）
      const accountsPromise = provider.request({ method: 'eth_requestAccounts' });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 1500)
      );
      
      await Promise.race([accountsPromise, timeoutPromise]);
      const address = await waitForAccounts(provider);
      
      // 连接成功！
      const chainId = await provider.request({ method: 'eth_chainId' });
      
      if (window.walletManager) {
        window.walletManager.walletType = 'metamask';
        window.walletManager.walletAddress = address;
        window.walletManager.isConnected = true;
        window.walletManager.saveToStorage?.();
        window.walletManager.updateUI?.();
        window.dispatchEvent(new CustomEvent('walletConnected', {
          detail: {
            address,
            credits: window.walletManager.credits || 0,
            isNewUser: !window.walletManager.getWalletData?.(address)
          }
        }));
      }
      
      // 关闭弹窗
      const modal = document.getElementById('walletModal');
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
      }
      
      if (window.bscGuide && typeof window.bscGuide.showSuccessMessage === 'function') {
        window.bscGuide.showSuccessMessage(address, chainId);
      } else {
        showNotification('MetaMask connected.', 'success');
      }
      console.log('[Connect][MetaMask] Mobile direct connection success ->', address);
      return;
      
    } catch (e) {
      // 连接失败（超时或用户拒绝），回退到 deep link
      console.log('[Connect][MetaMask] Direct connection failed:', e.message, '→ opening deep link');
      
      // 如果是用户主动拒绝，不要跳转 deep link
      if (e.code === 4001 || e.message?.includes('User rejected') || e.message?.includes('user rejected')) {
        showNotification('Connection cancelled by user(binance wallet is not available in US region.))error');
        return;
      }
      
      try { closeWalletModal?.(); } catch (_) {}
      
      const currentUrl = window.location.href;
      const urlWithoutProtocol = currentUrl.replace(/^https?:\/\//, '');
      const metamaskDeepLink = `https://metamask.app.link/dapp/${urlWithoutProtocol}`;
      
      window.location.href = metamaskDeepLink;
      return;
    }
  }

  // === 桌面端 或 移动端 MetaMask in-app browser：直连逻辑 ===
  console.log('[Connect][MetaMask] start (injected/desktop flow)');
  try {
    // ① 直接使用 window.ethereum（跳过 MetaMask SDK，避免干扰）
    const provider = window.ethereum;
    
    if (!provider || typeof provider.request !== 'function') {
       // 桌面端没有任何 EVM 钱包，显示安装指引
       if (!isMobileEnv && window.bscGuide && typeof window.bscGuide.showInstallMetaMaskGuide === 'function') {
          window.bscGuide.showInstallMetaMaskGuide();
          return;
       }
       showNotification('No wallet found. Please install MetaMask or another EVM wallet.', 'error');
       return;
    }

    // ② 请求账户授权 - 这会弹出钱包登录窗口
    console.log('[Connect][MetaMask] Requesting accounts from window.ethereum...');
    await provider.request({ method: 'eth_requestAccounts' });
    const address = await waitForAccounts(provider);

    // ③ 尝试切换到用户选择的网络（失败不阻塞）
    try {
      await enforcePreferredEvmChain(provider);
    } catch (switchErr) {
      console.warn('[Connect][MetaMask] Network switch failed (non-fatal):', switchErr?.message);
    }

    // ④ 写入状态 & 刷UI & 广播
    const chainId = await provider.request({ method: 'eth_chainId' });

    if (window.walletManager) {
      window.walletManager.ethereum = provider;
      window.walletManager.walletType = 'metamask';
      window.walletManager.walletAddress = address;
      window.walletManager.isConnected = true;
      window.walletManager.saveToStorage?.();
      window.walletManager.updateUI?.();
      window.dispatchEvent(new CustomEvent('walletConnected', {
        detail: {
          address,
          credits: window.walletManager.credits || 0,
          isNewUser: !window.walletManager.getWalletData?.(address)
        }
      }));
    }

    // ⑤ 成功后再关弹窗
    const modal = document.getElementById('walletModal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }

    showNotification('Wallet connected successfully!', 'success');
    console.log('[Connect][MetaMask] success ->', address);
  } catch (e) {
    console.error('[Connect][MetaMask] error:', e);
    // 用户取消连接
    if (e?.code === 4001 || e?.message?.toLowerCase().includes('user rejected')) {
      showNotification('Connection cancelled by user', 'info');
      return;
    }
    showNotification(e?.message || 'Failed to connect wallet', 'error');
  }
}

// 1.5) Binance Wallet —— 桌面走扩展，手机走 W3W Provider (deep-link to app)
async function connectBinanceWallet() {
  i3_bncProbeEnv('click_connectBinanceWallet');
  console.log('[Connect][Binance] start');
  
  // 🔑 关键：Binance Wallet 必须使用 BNB (EVM) 网络
  let preferred = getPreferredNetwork();
  if (!preferred) {
      console.log('[Connect][Binance] No network selected, auto-selecting BNB Chain');
      setPreferredNetwork('bnb');
      preferred = getPreferredNetwork();
  }
  // 如果用户选择了非 BNB 的其他 EVM 网络，强制提示切换到 BNB
  if (preferred.key !== 'bnb' && preferred.kind === 'evm') {
    console.warn('[Connect][Binance] User selected', preferred.key, 'but Binance Wallet works best with BNB Chain');
    showNotification('Binance Wallet works best with BNB Chain', 'info');
  }
  if (!preferred || preferred.kind !== 'evm') {
    showNotification('Invalid network: Please choose an EVM network first.', 'error');
    try { openNetworkPickerModal?.(); } catch (_) {}
    return;
  }

  // ============================================================
  // 🔑 DApp Browser: Use injected provider directly
  // ============================================================
  debugLog('=== connectBinanceWallet() called ===', 'info');
  debugLog(`Step 1: Checking detectBinanceDappBrowser() [CACHED]...`, 'info');
  
  // Check if we're in Binance DApp browser (uses cached result from page load)
  const isBinanceDappBrowser = detectBinanceDappBrowser();
  
  debugLog(`Step 2: isBinanceDappBrowser (cached) = ${isBinanceDappBrowser}`, isBinanceDappBrowser ? 'success' : 'warn');
  debugLog(`Step 2b: window.ethereum exists = ${!!window.ethereum}`, 'info');
  debugLog(`Step 2c: window.ethereum.isBinance (current) = ${window.ethereum?.isBinance}`, 'info');
  debugLog(`Step 2d: Cached provider exists = ${!!getCachedBinanceProvider()}`, 'info');
  
  if (isBinanceDappBrowser) {
    debugLog('Step 3: ✅ ENTERING DApp browser direct connection path', 'success');
    
    // Use the CACHED provider (saved at page load before other SDKs overwrote it)
    const provider = getCachedBinanceProvider() || window.ethereum;
    debugLog(`Step 3b: Using provider: ${provider === getCachedBinanceProvider() ? 'CACHED' : 'window.ethereum'}`, 'info');
    
    if (!provider || typeof provider.request !== 'function') {
      debugLog('Step 3c: ERROR - No valid provider available!', 'error');
      showNotification('Provider not available', 'error');
      return { success: false, error: 'No provider' };
    }
    
    // Close wallet modal first
    try { 
      closeWalletModal?.(); 
      debugLog('Step 4: Wallet modal closed', 'info');
    } catch (e) {
      debugLog(`Step 4: closeWalletModal error (non-fatal): ${e.message}`, 'warn');
    }
    
    try {
      debugLog('Step 5: Calling provider.request({ method: eth_requestAccounts })...', 'info');
      
      // Wallet connection using the CACHED provider
      const accounts = await provider.request({ 
        method: 'eth_requestAccounts' 
      });
      
      debugLog(`Step 6: eth_requestAccounts returned: ${JSON.stringify(accounts)}`, 'success');
      
      if (!accounts || accounts.length === 0) {
        debugLog('Step 6b: ERROR - No accounts returned!', 'error');
        throw new Error('No accounts returned from wallet');
      }
      
      const address = accounts[0];
      debugLog(`Step 7: Got address: ${address}`, 'success');
      
      // Get chain ID
      debugLog('Step 8: Getting chainId...', 'info');
      const chainId = await provider.request({ method: 'eth_chainId' });
      debugLog(`Step 9: chainId = ${chainId}`, 'success');
      
      // Update wallet manager
      debugLog('Step 10: Updating walletManager...', 'info');
      if (window.walletManager) {
        window.walletManager.ethereum = provider;  // Use cached provider
        window.walletManager.walletType = 'binance';
        window.walletManager.walletAddress = address;
        window.walletManager.isConnected = true;
        debugLog('Step 11: walletManager state updated', 'success');

        try {
          await window.walletManager.fetchRemoteWalletDataIfAvailable?.();
          debugLog('Step 12: Remote data fetched', 'info');
        } catch (e) {
          debugLog(`Step 12: fetchRemoteWalletDataIfAvailable error: ${e.message}`, 'warn');
        }

        window.walletManager.loadWalletSpecificData?.();
        window.walletManager.saveToStorage?.();
        window.walletManager.setupEventListeners?.();
        window.walletManager.updateUI?.();
        debugLog('Step 13: walletManager UI updated', 'success');

        window.dispatchEvent(new CustomEvent('walletConnected', {
          detail: {
            address,
            credits: window.walletManager.credits || 0,
            isNewUser: !window.walletManager.getWalletData?.(address)
          }
        }));
        debugLog('Step 14: walletConnected event dispatched', 'success');

        // Update network badge
        try {
          const networkInfo = mapChainIdToDisplay(chainId, 'binance');
          if (networkInfo) {
            renderNetworkBadge(networkInfo);
          }
          debugLog('Step 15: Network badge updated', 'success');
        } catch (e) {
          debugLog(`Step 15: Network badge error: ${e.message}`, 'warn');
        }
      } else {
        debugLog('Step 10b: WARNING - window.walletManager is null!', 'warn');
      }

      showNotification('Binance Wallet connected!', 'success');
      debugLog('🎉 CONNECTION SUCCESSFUL!', 'success');
      return { success: true, address };

    } catch (error) {
      debugLog(`❌ ERROR in DApp browser connection: ${error.message}`, 'error');
      debugLog(`Error code: ${error?.code}`, 'error');
      debugLog(`Error stack: ${error?.stack}`, 'error');
      
      if (error?.code === 4001 || error?.message?.toLowerCase().includes('user rejected')) {
        showNotification('Connection cancelled by user', 'info');
      } else {
        showNotification('Connection failed: ' + (error?.message || 'Unknown error'), 'error');
      }
      return { success: false, error: error?.message };
    }
    
    // IMPORTANT: Never fall through to SDK if we're in DApp browser
    debugLog('⚠️ Reached fallback return - this should not happen!', 'error');
    return { success: false, error: 'DApp browser connection failed' };
  }
  // ============================================================

  debugLog('Step 3: ❌ NOT in DApp browser - will use SDK/deeplink path', 'warn');

  // ---- Mobile: Use W3W Provider to auto-jump to Binance Wallet app ----
  const isMobile = isMobileDevice();
  const hasStrongInjected = hasStrongBinanceEvmProvider();

  // 移动端 + 没有 Binance 注入 provider（外部浏览器）
  // => 使用 W3W Provider，enable() 会自动跳转到 Binance 钱包 App
  if (isMobile && !hasStrongInjected) {
    console.log('[Binance] Mobile without injected provider -> Using W3W Provider (auto deep-link)');

    // 关闭钱包选择弹窗
    try { closeWalletModal?.(); } catch {}

    // 检查 W3W SDK 是否已加载
    if (typeof window.BINANCE_W3W_GET_PROVIDER !== 'function') {
      console.log('[Binance] W3W SDK not loaded yet, waiting...');
      showNotification('Loading Binance SDK, please wait...', 'info');
      
      let attempts = 0;
      while (typeof window.BINANCE_W3W_GET_PROVIDER !== 'function' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (typeof window.BINANCE_W3W_GET_PROVIDER !== 'function') {
        showNotification('Binance SDK failed to load. Please refresh and try again.', 'error');
        return;
      }
    }

    // 获取首选网络的 chainId，默认为 BNB Chain (56)
    let chainId = 56; // BNB Chain default
    if (preferred && preferred.chainId) {
      const hexChainId = preferred.chainId;
      if (hexChainId && hexChainId.startsWith('0x')) {
        chainId = parseInt(hexChainId, 16);
      } else if (hexChainId) {
        chainId = parseInt(hexChainId, 10);
      }
    }

    console.log('[Binance] Creating W3W provider with chainId:', chainId);

    try {
      // 创建 W3W Provider - enable() 会自动跳转到 Binance 钱包 App
      const provider = window.BINANCE_W3W_GET_PROVIDER({ chainId });
      
      // 设置语言
      if (typeof provider.setLng === 'function') {
        provider.setLng(navigator.language?.startsWith('zh') ? 'zh-CN' : 'en');
      }

      console.log('[Binance] W3W Provider created, calling enable() to open Binance app...');
      showNotification('Opening Binance Wallet app...', 'info');

      // enable() 会自动弹出 deep-link 跳转到 Binance 钱包 App
      // 用户在 App 中授权后，会返回到浏览器并带有连接信息
      const accounts = await provider.enable();
      
      console.log('[Binance] W3W enable() returned accounts:', accounts);

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from Binance Wallet');
      }

      const address = accounts[0];
      console.log('[Binance] Connected via W3W:', address.slice(0, 6) + '...' + address.slice(-4));

      // 设置事件监听
      setupBinanceW3WListeners(provider);

      // 写入状态
      if (window.walletManager) {
        window.walletManager.ethereum = provider;
        window.walletManager.walletType = 'binance';
        window.walletManager.walletAddress = address;
        window.walletManager.isConnected = true;

        try {
          await window.walletManager.fetchRemoteWalletDataIfAvailable?.();
        } catch (e) {
          console.warn('[Binance] Failed to fetch remote data:', e);
        }

        window.walletManager.loadWalletSpecificData?.();
        window.walletManager.saveToStorage?.();
        window.walletManager.updateUI?.();

        window.dispatchEvent(new CustomEvent('walletConnected', {
          detail: {
            address,
            credits: window.walletManager.credits || 0,
            isNewUser: !window.walletManager.getWalletData?.(address)
          }
        }));

        // 更新网络徽章
        try {
          const currentChainId = provider.chainId || await provider.request({ method: 'eth_chainId' });
          const networkInfo = mapChainIdToDisplay(currentChainId, 'binance');
          if (networkInfo) {
            renderNetworkBadge(networkInfo);
          }
        } catch (e) {
          console.warn('[Binance] Failed to update network badge:', e);
        }
      }

      showNotification('Binance Wallet connected!', 'success');
      console.log('[Binance] ✅ Mobile W3W Success ->', address);
      return { success: true, address };

    } catch (e) {
      console.error('[Binance] W3W connection error:', e);
      const errorMessage = e?.message || String(e);

      if (e?.code === 4001 || errorMessage.toLowerCase().includes('user rejected') || errorMessage.toLowerCase().includes('user denied')) {
        showNotification('Connection cancelled by user', 'info');
        return { success: false, error: 'User cancelled' };
      }

      // 如果 W3W 失败，提供回退选项
      showNotification('Failed to connect: ' + errorMessage, 'error');
      return { success: false, error: errorMessage };
    }
  }
  
  const isMobileEnv = isMobileDevice() || isRealMobileDevice();
  
  // 🔑 检测 Binance Wallet 是否已注入 provider（in-app browser 场景）
  let binanceProvider = getBinanceProvider();
  let hasInjectedProvider = binanceProvider && typeof binanceProvider.request === 'function';
  
  // 🔍 详细的调试信息输出
  console.log('🔍 [Binance Debug] Environment detection:', {
    ua: navigator.userAgent.substring(0, 100),
    isMobileEnv,
    hasInjectedProvider,
    '--- Binance Providers ---': '---',
    binanceChain: !!window.binanceChain,
    BinanceChain: !!window.BinanceChain,
    binancew3w: !!window.binancew3w,
    ethereumIsBinance: !!window.ethereum?.isBinance,
    '--- Other Wallets ---': '---',
    ethereumIsMetaMask: !!window.ethereum?.isMetaMask,
    ethereumIsCoinbase: !!window.ethereum?.isCoinbaseWallet,
    ethereumIsTrust: !!window.ethereum?.isTrust,
    '--- Provider Info ---': '---',
    providerFound: !!binanceProvider,
    providerType: binanceProvider ? (
      binanceProvider.isMetaMask ? 'MetaMask' :
      binanceProvider.isCoinbaseWallet ? 'Coinbase' :
      binanceProvider.isBinance ? 'Binance' :
      'Unknown'
    ) : 'None'
  });
  
  console.log('[Connect][Binance] Detection:', {
    isMobile: isMobileEnv,
    hasInjectedProvider: hasInjectedProvider,
    preferredNetwork: preferred.name,
    providerFound: !!binanceProvider
  });

  // ✅ 新增：强信号判断 —— 区分真正的 Web3 Wallet dApp browser vs tonbridge/SafariView
  const strongBinanceEvm = hasStrongBinanceEvmProvider();
  console.log('🔍 [Binance Debug] strongBinanceEvm:', strongBinanceEvm);

  // ✅ 如果"看似有 provider"，但没有任何 Binance EVM 强信号：
  // 大概率是在 Binance App 的普通 Explorer/SafariView（tonbridge 那种），不要走直连，直接 deeplink 到 Web3 Wallet dApp browser
  if (isMobileEnv && hasInjectedProvider && !strongBinanceEvm) {
    console.warn('[Connect][Binance] Provider exists but NO strong Binance EVM markers. Treat as NO provider and deeplink to Web3 Wallet.');
    hasInjectedProvider = false;
    binanceProvider = null;
  }

  // === 🔑 手机端处理逻辑 ===
  if (isMobileEnv) {
    const inBinance = isInBinanceEnv();
    
    console.log('[Connect][Binance] Mobile check - inBinance:', inBinance, 'hasInjectedProvider:', hasInjectedProvider, 'strongBinanceEvm:', strongBinanceEvm);
    
    // 🔑 关键修复：只要有 provider 就尝试直接连接
    // 不再严格依赖 isInBinanceEnv()，因为币安 in-app browser 可能检测不到
    if (hasInjectedProvider) {
      console.log('[Connect][Binance] Mobile with provider, attempting direct connect (inBinance=' + inBinance + ')...');
      
      try {
        const provider = binanceProvider;
        
        // 🔑 直接请求账户，不做链切换（避免触发页面刷新）
        console.log('[Connect][Binance] In-app: Checking accounts (skipping chain switch)...');
        
        // ✅ 补丁2: 先查是否已授权，避免不必要的刷新（带超时，防止假 provider 卡死）
        let accts = [];
        try {
          accts = await Promise.race([
            provider.request({ method: 'eth_accounts' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('eth_accounts timeout')), 1500))
          ]);
          console.log('[Connect][Binance] In-app: eth_accounts result:', accts?.length || 0, 'accounts');
        } catch (ethAccErr) {
          console.warn('[Connect][Binance] In-app: eth_accounts failed/timeout:', ethAccErr?.message);
          // ✅ 不再 deeplink，直接报错
          if (ethAccErr?.message?.includes('timeout')) {
            throw new Error('Binance provider not responding. If you are in Binance DApp browser, try reloading. Otherwise use WalletConnect.');
          }
        }
        
        if (!Array.isArray(accts) || accts.length === 0) {
          // ✅ 不再写入 pending 标记，直接请求授权
          console.log('[Connect][Binance] In-app: No accounts yet, requesting authorization...');
          
          try {
            await Promise.race([
              provider.request({ method: 'eth_requestAccounts' }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('eth_requestAccounts timeout')), 6000))
            ]);
          } catch (reqErr) {
            // 用户拒绝（code 4001）才停止
            if (reqErr?.code === 4001) {
              showNotification('Connection cancelled by user', 'info');
              return;
            }
            // ✅ 超时或其他错误：不再 deeplink，直接报错
            if (reqErr?.message?.includes('timeout')) {
              throw new Error('Binance provider not available. If you are in Binance DApp browser, try reloading. Otherwise use WalletConnect.');
            }
            console.warn('[Connect][Binance] In-app: eth_requestAccounts warning (may be normal):', reqErr?.message);
            // 不直接 return：有些情况下会刷新或延迟注入，后面 waitForAccounts 仍可能拿到
          }
        } else {
          console.log('[Connect][Binance] In-app: Already authorized, skipping eth_requestAccounts');
        }
        
        // 等待账户地址返回
        const address = await waitForAccounts(provider);
        if (!address) {
          throw new Error('Failed to get account address from Binance Wallet');
        }
        
        // 连接成功（不再需要清理 pending 标记，因为已禁用）
        
        console.log('[Connect][Binance] In-app: Account retrieved:', address.slice(0, 6) + '...' + address.slice(-4));
        
        // 写入状态 & 刷 UI & 广播事件
        if (window.walletManager) {
          window.walletManager.ethereum = provider;
          window.walletManager.walletType = 'binance';
          window.walletManager.walletAddress = address;
          window.walletManager.isConnected = true;
          
          try {
            await window.walletManager.fetchRemoteWalletDataIfAvailable?.();
          } catch (e) {
            console.warn('[Connect][Binance] Failed to fetch remote data:', e);
          }
          
          window.walletManager.loadWalletSpecificData?.();
          window.walletManager.saveToStorage?.();
          window.walletManager.setupEventListeners?.();
          window.walletManager.updateUI?.();
          
          window.dispatchEvent(new CustomEvent('walletConnected', {
            detail: {
              address,
              credits: window.walletManager.credits || 0,
              isNewUser: !window.walletManager.getWalletData?.(address)
            }
          }));
          
          // 更新网络徽章（获取当前链 ID，不切换）
          try {
            const chainId = await provider.request({ method: 'eth_chainId' });
            const networkInfo = mapChainIdToDisplay(chainId, 'binance');
            if (networkInfo) {
              renderNetworkBadge(networkInfo);
            }
          } catch (e) {
            console.warn('[Connect][Binance] Failed to update network badge:', e);
          }
        }
        
        // 关闭登录弹窗
        const modal = document.getElementById('walletModal');
        if (modal) {
          modal.classList.remove('show');
          modal.style.display = 'none';
        }
        
        showNotification('Binance Wallet connected successfully!', 'success');
        console.log('[Connect][Binance] ✅ Mobile Success ->', address);
        return;
        
      } catch (e) {
        console.error('[Connect][Binance] ❌ Mobile Error:', e);
        const errorMessage = e?.message || '';
        const errorCode = e?.code;
        
        if (errorCode === 4001 || errorMessage.toLowerCase().includes('user rejected')) {
          showNotification('Connection cancelled', 'info');
          return;
        }
        
        showNotification(errorMessage || 'Failed to connect Binance Wallet', 'error');
        return;
      }
    }
    
    // ✅ 这一段按新逻辑其实永远不会走到（因为上面已经 early-return 走 WalletConnect 了）
    // 但留个保险：不要再 deep link，直接报错提示
    else {
      throw new Error('Binance injected provider not found on mobile. Please use WalletConnect flow.');
    }
  }

  // === 桌面端：直连逻辑（优先使用扩展，无扩展则使用 SDK QR 码） ===
  try {
    let provider = binanceProvider || getBinanceProvider();
    
    // REMOVED: Don't fall back to window.ethereum as it would grab MetaMask instead of Binance
    // The getBinanceProvider() function already checks for Binance-specific providers only
    
    // 如果没有注入的 provider，使用 Binance Web3 Wallet SDK 进行 QR 码连接
    if (!provider || typeof provider.request !== 'function') {
      console.log('[Connect][Binance] Desktop: No injected provider found, using Binance SDK for QR code connection...');
      
      // 检查 SDK 是否已加载
      if (typeof window.BINANCE_W3W_GET_PROVIDER !== 'function') {
        showNotification('Binance Web3 Wallet SDK is loading, please try again in a moment', 'info');
        // 等待 SDK 加载（最多 3 秒）
        let attempts = 0;
        while (typeof window.BINANCE_W3W_GET_PROVIDER !== 'function' && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        if (typeof window.BINANCE_W3W_GET_PROVIDER !== 'function') {
          showNotification('Binance Web3 Wallet SDK failed to load. Please refresh the page.', 'error');
      return;
        }
      }
      
      // 获取首选网络的 chainId，默认为 BNB Chain (56)
      let chainId = 56; // BNB Chain default
      if (preferred && preferred.chainId) {
        // 将 hex chainId (如 '0x38') 转换为 decimal
        const hexChainId = preferred.chainId;
        if (hexChainId && hexChainId.startsWith('0x')) {
          chainId = parseInt(hexChainId, 16);
        } else if (hexChainId) {
          chainId = parseInt(hexChainId, 10);
        }
      }
      
      console.log('[Connect][Binance] Creating provider with chainId:', chainId);
      
      try {
        // RPC endpoints for supported chains
        const rpcMap = {
          1: 'https://eth.llamarpc.com',                    // Ethereum Mainnet
          56: 'https://bsc-dataseed.binance.org',           // BNB Chain
          97: 'https://data-seed-prebsc-1-s1.binance.org:8545', // BNB Testnet
          137: 'https://polygon-rpc.com',                   // Polygon
          204: 'https://opbnb-mainnet-rpc.bnbchain.org',    // opBNB
          42161: 'https://arb1.arbitrum.io/rpc',            // Arbitrum
          10: 'https://mainnet.optimism.io',                // Optimism
          8453: 'https://mainnet.base.org',                 // Base
          324: 'https://mainnet.era.zksync.io',             // zkSync Era
        };
        
        // 使用 Binance SDK 创建 provider（会自动显示 QR 码）
        const providerOptions = {
          chainId: chainId,
          rpc: rpcMap,
          showQrCodeModal: true,
          lng: navigator.language?.startsWith('zh') ? 'zh-CN' : 'en'
        };
        
        console.log('[Connect][Binance] Provider options:', providerOptions);
        provider = window.BINANCE_W3W_GET_PROVIDER(providerOptions);
        
        // Add debug event listeners to understand what's happening
        if (provider.connector) {
          provider.connector.on('transport_open', (relay) => {
            console.log('[Connect][Binance] ✓ Transport opened to relay:', relay);
          });
          provider.connector.on('transport_error', (error, url) => {
            console.error('[Connect][Binance] ✗ Transport error:', error, 'URL:', url);
          });
          provider.connector.on('transport_close', () => {
            console.log('[Connect][Binance] Transport closed');
          });
          provider.connector.on('uri_ready', (uri) => {
            console.log('[Connect][Binance] URI ready:', uri);
          });
          provider.connector.on('session_error', (error) => {
            console.error('[Connect][Binance] Session error:', error);
          });
          provider.connector.on('display_uri', (data) => {
            console.log('[Connect][Binance] Display URI event:', data);
          });
        }
        
        console.log('[Connect][Binance] SDK Provider created, calling enable() to show QR code...');
        
        // 调用 enable() 会显示 QR 码供移动端扫描
        const accounts = await provider.enable();
        
        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts returned from Binance Wallet');
        }
        
        const address = accounts[0];
        console.log('[Connect][Binance] SDK Connection successful:', address.slice(0, 6) + '...' + address.slice(-4));
        
        // 设置事件监听
        if (provider && typeof provider.on === 'function') {
          provider.on('accountsChanged', (accs) => {
            if (!accs || accs.length === 0) {
              if (window.walletManager) {
                window.walletManager.disconnectWallet();
              }
              return;
            }
            const nextAddress = accs[0];
            if (window.walletManager && nextAddress !== window.walletManager.walletAddress) {
              if (window.walletManager.walletAddress) {
                window.walletManager.saveWalletSpecificData();
              }
              window.walletManager.walletAddress = nextAddress;
              window.walletManager.loadWalletSpecificData();
              window.walletManager.saveToStorage();
              window.walletManager.updateUI();
              window.dispatchEvent(new CustomEvent('walletConnected', {
                detail: {
                  address: nextAddress,
                  credits: window.walletManager.credits || 0,
                  isNewUser: !window.walletManager.getWalletData(nextAddress)
                }
              }));
            }
          });
          
          provider.on('chainChanged', (newChainId) => {
            console.log('[Connect][Binance] Chain changed to:', newChainId);
            try {
              const info = mapChainIdToDisplay(newChainId, 'binance');
              renderNetworkBadge(info);
            } catch (e) {
              console.warn('[Connect][Binance] Failed to update network badge:', e);
            }
          });
          
          provider.on('disconnect', () => {
            console.log('[Connect][Binance] SDK disconnected');
            if (window.walletManager) {
              window.walletManager.disconnectWallet();
            }
          });
        }
        
        // 将 provider 存储到 walletManager
        if (window.walletManager) {
          window.walletManager.ethereum = provider;
          window.walletManager.walletType = 'binance';
          window.walletManager.walletAddress = address;
          window.walletManager.isConnected = true;
          
          try {
            await window.walletManager.fetchRemoteWalletDataIfAvailable?.();
          } catch (e) {
            console.warn('[Connect][Binance] Failed to fetch remote data:', e);
          }
          
          window.walletManager.loadWalletSpecificData?.();
          window.walletManager.saveToStorage?.();
          window.walletManager.updateUI?.();
          
          window.dispatchEvent(new CustomEvent('walletConnected', {
            detail: {
              address,
              credits: window.walletManager.credits || 0,
              isNewUser: !window.walletManager.getWalletData?.(address)
            }
          }));
          
          try {
            const currentChainId = await provider.request({ method: 'eth_chainId' });
            const networkInfo = mapChainIdToDisplay(currentChainId, 'binance');
            if (networkInfo) {
              renderNetworkBadge(networkInfo);
            }
          } catch (e) {
            console.warn('[Connect][Binance] Failed to update network badge:', e);
          }
        }
        
        // 关闭登录弹窗
        const modal = document.getElementById('walletModal');
        if (modal) {
          modal.classList.remove('show');
          modal.style.display = 'none';
        }
        
        showNotification('Binance Wallet connected via QR code!', 'success');
        console.log('[Connect][Binance] ✅ Desktop SDK Success ->', address);
        return;
        
      } catch (sdkError) {
        console.error('[Connect][Binance] SDK connection error:', sdkError);
        const errorMessage = sdkError?.message || String(sdkError);
        
        if (sdkError?.code === 4001 || errorMessage.toLowerCase().includes('user rejected') || errorMessage.toLowerCase().includes('user denied')) {
          showNotification('Connection cancelled by user', 'info');
          return;
        }
        
        // Check for crypto/HMAC errors - suggests SDK bundling issue
        if (errorMessage.includes('hmac') || errorMessage.includes('crypto') || errorMessage.includes('Internal error')) {
          console.error('[Connect][Binance] SDK crypto error detected - this is a known issue with CDN bundling');
          console.error('[Connect][Binance] The SDK requires Node.js crypto which needs proper polyfilling');
          console.error('[Connect][Binance] Suggesting fallback to WalletConnect for mobile connection');
          
          // Suggest using WalletConnect as fallback for mobile connection
          showNotification('QR code connection unavailable. Please use WalletConnect or install the Binance extension.', 'error');
          
          // Optionally, automatically try WalletConnect as fallback
          // Uncomment the following if you want auto-fallback:
          /*
          try {
            if (window.walletManager && typeof window.walletManager.connectWalletConnect === 'function') {
              console.log('[Connect][Binance] Falling back to WalletConnect...');
              const result = await window.walletManager.connectWalletConnect();
              if (result.success) {
                showNotification('Connected via WalletConnect instead', 'success');
                return result;
              }
            }
          } catch (wcError) {
            console.error('[Connect][Binance] WalletConnect fallback also failed:', wcError);
          }
          */
          return;
        }
        
        showNotification('QR code connection failed: ' + errorMessage, 'error');
        return;
      }
    }
    
    console.log('[Connect][Binance] Desktop: Provider found, attempting connection...');
    
    // 把 provider 存到 walletManager
    if (window.walletManager) {
      window.walletManager.ethereum = provider;
    }
    
    // 🔑 桌面端可以尝试切链（扩展支持较好）
    try {
      await enforcePreferredEvmChain(provider);
      console.log('[Connect][Binance] Network switched to', preferred.name);
    } catch (switchErr) {
      console.warn('[Connect][Binance] Network switch failed:', switchErr);
      // 如果切链失败，不要阻止连接，继续尝试
    }
    
    // 请求账户授权
    console.log('[Connect][Binance] Requesting accounts...');
    try {
      await provider.request({ method: 'eth_requestAccounts' });
      console.log('[Connect][Binance] Account request accepted');
    } catch (requestErr) {
      if (requestErr?.code === 4001) {
        showNotification('Connection cancelled by user', 'info');
        return;
      }
      console.warn('[Connect][Binance] eth_requestAccounts warning:', requestErr?.message);
    }
    
    // 等待账户地址返回
    console.log('[Connect][Binance] Waiting for accounts...');
    const address = await waitForAccounts(provider);
    if (!address) {
      throw new Error('Failed to get account address from Binance Wallet');
    }
    
    console.log('[Connect][Binance] Account retrieved:', address.slice(0, 6) + '...' + address.slice(-4));
    
    // 写入状态 & 刷 UI & 广播事件
    if (window.walletManager) {
      window.walletManager.walletType = 'binance';
      window.walletManager.walletAddress = address;
      window.walletManager.isConnected = true;
      
      try {
        await window.walletManager.fetchRemoteWalletDataIfAvailable?.();
      } catch (e) {
        console.warn('[Connect][Binance] Failed to fetch remote data:', e);
      }
      
      window.walletManager.loadWalletSpecificData?.();
      window.walletManager.saveToStorage?.();
      window.walletManager.setupEventListeners?.();
      window.walletManager.updateUI?.();
      
      window.dispatchEvent(new CustomEvent('walletConnected', {
        detail: {
          address,
          credits: window.walletManager.credits || 0,
          isNewUser: !window.walletManager.getWalletData?.(address)
        }
      }));
      
      try {
        const chainId = await provider.request({ method: 'eth_chainId' });
        const networkInfo = mapChainIdToDisplay(chainId, 'binance');
        if (networkInfo) {
          renderNetworkBadge(networkInfo);
        }
      } catch (e) {
        console.warn('[Connect][Binance] Failed to update network badge:', e);
      }
    }
    
    // 关闭登录弹窗
    const modal = document.getElementById('walletModal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
    
    showNotification('Binance Wallet connected successfully!', 'success');
    console.log('[Connect][Binance] ✅ Desktop Success ->', address);
    
  } catch (e) {
    console.error('[Connect][Binance] ❌ Desktop Error:', e);
    const errorMessage = e?.message || '';
    const errorCode = e?.code;
    
    if (errorCode === 4001 ||
        errorCode === 'ACTION_REJECTED' ||
        errorMessage.toLowerCase().includes('user rejected') ||
        errorMessage.toLowerCase().includes('user denied')) {
      showNotification('Connection cancelled', 'info');
      return;
    }
    
    showNotification(errorMessage || 'Failed to connect Binance Wallet', 'error');
  }
}


// ✅ 禁用旧的 Binance 自动重连逻辑 - 只清理旧标记，不再触发自动连接
document.addEventListener('DOMContentLoaded', async () => {
  // 延迟执行，确保所有脚本都已加载
  await new Promise(r => setTimeout(r, 500));

  try {
    const urlParams = new URLSearchParams(window.location.search);

    // 旧逻辑遗留：i3ac / bnc / binance / sessionStorage 标记
    const hasLegacyFlags =
      urlParams.has('i3ac') ||
      urlParams.has('bnc') ||
      urlParams.has('binance') ||
      sessionStorage.getItem('__i3_binance_autoconnect') === '1';

    if (hasLegacyFlags) {
      console.log('[Binance] Cleaning up legacy flags (no auto-connect)');
      
      // 只清理，不触发 connect
      urlParams.delete('i3ac');
      // bnc/binance 也清掉更干净：
      urlParams.delete('bnc');
      urlParams.delete('binance');
      sessionStorage.removeItem('__i3_binance_autoconnect');

      // 替换 URL（避免刷新后又带着标记）
      const clean =
        window.location.origin +
        window.location.pathname +
        (urlParams.toString() ? `?${urlParams.toString()}` : '') +
        (window.location.hash || '');
      window.history.replaceState({}, '', clean);
    }
  } catch (e) {
    console.warn('[Binance] legacy flag cleanup failed:', e);
  }
});

/**
 * 连接 Coinbase Wallet
 */
// 3) Coinbase（CDP）—— 桌面走 CDP，手机走 WalletConnect/AppKit
async function connectCoinbaseWallet() {
  let preferred = getPreferredNetwork();
  if (!preferred) {
      setPreferredNetwork('base'); // Default to Base for Coinbase Wallet
      preferred = getPreferredNetwork();
  }

  if (!preferred || preferred.kind !== 'evm') {
    showNotification('Invalid network: Please choose an EVM network first.', 'error');
    try { openNetworkPickerModal?.(); } catch (_) {}
    return;
  }

  const isMobileEnv = isMobileDevice() || isRealMobileDevice();

  // === 新增：检测是否在 Coinbase Wallet App 的浏览器中 (In-App Browser) ===
  // Coinbase Wallet 通常会注入 isCoinbaseWallet=true，但也可能伪装成 MetaMask
  const hasInjectedProvider = window.ethereum && (
      window.ethereum.isCoinbaseWallet || 
      window.ethereum.isMetaMask || 
      (window.ethereum.providers && window.ethereum.providers.some(p => p.isCoinbaseWallet))
  );

  // 1. 如果是移动端且没有注入 Provider -> 走 WalletConnect (AppKit)
  if (isMobileEnv && !hasInjectedProvider) {
    console.log('[Connect][Coinbase] Mobile detected & No Injected Provider → using WalletConnect/AppKit');
    await connectWalletConnect();
    return;
  }

  // 2. 如果检测到注入 Provider (移动端 In-App 或 桌面端已安装插件) -> 直接尝试标准连接
  if (hasInjectedProvider) {
      console.log('[Connect][Coinbase] Injected provider found. Attempting direct connection...');
      try {
          if (!window.walletManager) throw new Error('WalletManager not ready');
          
          // 调用 walletManager 的通用连接逻辑 (已修复支持 isCoinbaseWallet)
          const result = await window.walletManager.connectWallet('coinbase');
          
          if (result.success) {
               // 关弹窗
               const modal = document.getElementById('walletModal');
               if (modal) {
                 modal.classList.remove('show');
                 modal.style.display = 'none';
               }
               const dropdown = document.getElementById('accountDropdown');
               if (dropdown) dropdown.classList.remove('show');
               
               showNotification('Coinbase Wallet connected!', 'success');
               return;
          } else {
               throw new Error(result.error || 'Connection failed');
          }
      } catch (e) {
          console.warn('[Connect][Coinbase] Direct connection failed:', e);
          // 如果是移动端 In-App，这里失败了就真失败了，报出来
          if (isMobileEnv) {
              showNotification(e.message || 'Failed to connect in-app wallet', 'error');
              return;
          }
          // 如果是桌面端，还可以继续尝试下面的 CDP 逻辑作为 fallback
      }
  }

  // === 桌面端：保留原来的 CDP 逻辑 (Smart Wallet / Scan QR) ===
  console.log('[Connect][CDP] start');
  try {
    if (!window.cdpConnect) throw new Error('CDP not ready. Check SDK loader.');

    // ① 二维码/授权，返回地址
    const { address } = await window.cdpConnect();
    if (!address) throw new Error('CDP returned empty address');

    // ② 若有 provider，补齐切链与账户授权
    const provider = window.walletManager?.ethereum || window.ethereum;
    if (provider?.request) {
      try { await enforcePreferredEvmChain(provider); } catch (e) { console.warn('[CDP] switch chain skipped:', e); }
      try { await provider.request({ method: 'eth_requestAccounts' }); } catch {}
      try { await waitForAccounts(provider); } catch {}
    }

    // ③ 写入状态 & 刷UI & 广播
    if (window.walletManager) {
      window.walletManager.walletAddress = address;
      window.walletManager.isConnected = true;
      window.walletManager.walletType = 'coinbase';
      window.walletManager.saveToStorage?.();
      window.walletManager.updateUI?.();
      window.dispatchEvent(new CustomEvent('walletConnected', {
        detail: { address, credits: window.walletManager.credits || 0, isNewUser: !window.walletManager.getWalletData?.(address) }
      }));
    }

    // ④ 关你的白弹窗
    const modal = document.getElementById('walletModal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }

    const dropdown = document.getElementById('accountDropdown');
    if (dropdown) dropdown.classList.remove('show');

    showNotification('Coinbase (Base Smart Wallet) connected!', 'success');
  } catch (error) {
    console.error('[Connect][CDP] error:', error);
    showNotification(error?.message || 'Failed to connect Coinbase (CDP)', 'error');
  }
}


// 2) WalletConnect —— 简化版本
async function connectWalletConnect() {
  let preferred = getPreferredNetwork();
  if (!preferred) {
    setPreferredNetwork('ethereum');
    preferred = getPreferredNetwork();
  }

  if (!preferred || preferred.kind !== 'evm') {
    showNotification('Invalid network: Please choose an EVM network first.', 'error');
    try { openNetworkPickerModal?.(); } catch {}
    return;
  }
  
  console.log('[Connect][WalletConnect] Starting...');

  // 关闭钱包选择弹窗
  try {
    closeWalletModal?.();
  } catch {}

  try {
    if (!window.walletManager) {
      throw new Error('Wallet manager not available');
    }

    // 调用 walletManager 的连接方法
    const result = await window.walletManager.connectWallet('walletconnect');
    
    if (!result?.success) {
      throw new Error(result?.error || 'WalletConnect connection failed');
    }

    // 连接成功后切换网络
    const provider = window.walletManager.ethereum || window.ethereum;
    if (provider && typeof enforcePreferredEvmChain === 'function') {
      try {
        await enforcePreferredEvmChain(provider);
      } catch (switchErr) {
        console.warn('[WalletConnect] Network switch warning:', switchErr?.message);
      }
    }

    showNotification('WalletConnect connected successfully!', 'success');
    console.log('[Connect][WalletConnect] Success:', result.address);

  } catch (error) {
    console.error('[Connect][WalletConnect] Error:', error);
    const msg = error?.message || String(error);
    
    if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('cancelled')) {
      showNotification('Connection cancelled by user', 'info');
    } else if (msg.includes('timeout')) {
      showNotification('Connection timeout - please try again', 'error');
    } else {
      showNotification('WalletConnect failed: ' + msg, 'error');
    }
  }
}


    // 连接 Phantom (Solana)
// 4) Phantom (Solana)
async function connectSolanaPhantom() {
  // In-app browser detection for Phantom (mobile or desktop)
  if (window.phantom?.solana?.isPhantom || window.solana?.isPhantom) {
      console.log('[Connect][Phantom] In-app/Extension detected');
      // Allow direct pass-through without forced network check initially?
      // Actually, we still want to set preferred network to Solana if not set, 
      // but we should rely on wallet-manager's logic to handle the provider.
  }

  let preferred = getPreferredNetwork();
  if (!preferred) {
      setPreferredNetwork('solana'); // Auto-select Solana
      preferred = getPreferredNetwork();
  }

  // If user explicitly selected EVM, warn them. But if they are in Phantom App, 
  // they likely want Solana. We might want to auto-switch to Solana if they are in Phantom App?
  // For now, strict check:
  if (preferred.kind !== 'solana') {
    showNotification('Invalid network: Please switch to Solana before using Phantom.', 'error');
    return;
  }
  console.log('Solana Phantom connection initiated');

  try {
    // ⚠️ 不要先关弹窗；保持手势先连接
    if (!window.walletManager) throw new Error('Wallet manager not available');
    
    // Force "phantom" type
    const result = await window.walletManager.connectSolana('phantom');
    
    if (!result?.success) {
        // If failed, check if we are on mobile but NOT in Phantom app (e.g. Safari)
        // wallet-manager already handles the deep link logic in connectSolana
        throw new Error(result?.error || 'Failed to connect Phantom');
    }

    // 成功后再关你的白色弹窗
    const modal = document.getElementById('walletModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }

    try { window.walletManager?.updateUI?.(); } catch {}
    const dropdown = document.getElementById('accountDropdown');
    if (dropdown) dropdown.classList.remove('show');
    showNotification('Phantom (Solana) connected!', 'success');
  } catch (e) {
    console.error('Phantom connection error:', e);
    showNotification(e?.message || 'Failed to connect Phantom', 'error');
  }
}


/**
 * 钱包连接处理函数
 */
async function handleWalletConnect() {
    try {
        if (!window.walletManager) {
            showNotification('Wallet manager not loaded', 'error');
            return;
        }

        const result = await window.walletManager.connectWallet();
        if (result.success) {
            showNotification('Wallet connected successfully!', 'success');
            const dropdown = document.getElementById('accountDropdown');
            if (dropdown) {
                dropdown.classList.remove('show');
            }
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Wallet connection error:', error);
        showNotification('Failed to connect wallet', 'error');
    }
}

/**
 * 每日签到处理函数 - 支持 Admin 本地签到 + 普通用户链上签到
 */
async function handleDailyCheckin() {
    try {
        // 1. 检查钱包连接
        if (!window.walletManager || !window.walletManager.isConnected) {
            showNotification('Please connect your wallet first', 'error');
            return;
        }

        // 2. 判断是否为 Admin
        const isAdminUser = window.isAdmin && window.isAdmin();
        
        if (isAdminUser) {
            // Admin 用户 → 检查后执行本地签到
            if (!window.walletManager.canCheckinToday()) {
                showNotification('Already checked in today! Come back tomorrow.', 'error');
                return;
            }
            console.log('Admin user detected, executing local check-in');
            executeLocalCheckin();
        } else {
            // 普通用户 → 直接打开链上签到 Modal
            console.log('Regular user detected, opening on-chain check-in modal');
            
            if (typeof window.openOnChainCheckInModal === 'function') {
                // ⚠️ 关键修改：移除 await，不等待加载完成
                if (typeof window.loadUserCheckInStatus === 'function') {
                    window.loadUserCheckInStatus(); // 移除了 await
                }
                window.openOnChainCheckInModal();
            } else {
                console.error('On-chain check-in modal function not found');
                showNotification('Check-in feature not available', 'error');
            }
        }
    } catch (error) {
        console.error('Daily check-in error:', error);
        showNotification('Failed to process check-in: ' + error.message, 'error');
    }
}
/**
 * 执行本地签到(仅 Admin 用户)
 */
async function executeLocalCheckin() {
    try {
        const address = (window.walletManager.walletAddress || '').toLowerCase();

        // Firebase 同步(如果可用)
        if (window.firebaseDb) {
            const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = 
                await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

            const walletRef = doc(window.firebaseDb, 'wallets', address);
            const snap = await getDoc(walletRef);

            let remoteTotalCheckins = 0;
            let lastCheckinAt = null;
            
            if (snap.exists()) {
                const data = snap.data() || {};
                lastCheckinAt = data.lastCheckinAt || null;
                remoteTotalCheckins = Number(data.totalCheckins || 0);
            } else {
                await setDoc(walletRef, { 
                    address: address, 
                    createdAt: serverTimestamp(), 
                    totalCheckins: 0 
                }, { merge: true });
            }

            // 同步时间戳到本地
            if (lastCheckinAt && typeof lastCheckinAt.toMillis === 'function') {
                try { 
                    localStorage.setItem('last_checkin_at', String(lastCheckinAt.toMillis())); 
                } catch (_) {}
            }

            // 执行本地签到
            const result = window.walletManager.dailyCheckin();
            if (!result || !result.success) {
                showNotification(result?.error || 'Check-in failed', 'error');
                return;
            }

            // 同步到 Firestore
            try {
                await updateDoc(walletRef, {
                    lastCheckinAt: serverTimestamp(),
                    totalCheckins: remoteTotalCheckins + 1,
                    credits: window.walletManager.credits,
                    lastUpdated: serverTimestamp(),
                    lastCheckinType: 'local-admin'
                });
            } catch (e) {
                console.warn('Failed to sync to Firestore:', e);
            }

            showNotification(`Check-in successful! +${result.reward} I3 tokens`, 'success');
        } else {
            // Firebase 不可用时的降级处理
            const result = window.walletManager.dailyCheckin();
            if (result && result.success) {
                showNotification(`Check-in successful! +${result.reward} I3 tokens`, 'success');
            } else {
                showNotification(result?.error || 'Check-in failed', 'error');
            }
        }
    } catch (error) {
        console.error('Local check-in error:', error);
        showNotification('Check-in failed: ' + error.message, 'error');
    }
}

/**
 * 钱包断开连接处理函数
 */
function handleWalletDisconnect() {
    try {
        if (window.walletManager) {
            window.walletManager.disconnectWallet();
        }
    } catch (error) {
        console.error('Wallet disconnect error:', error);
        showNotification('Failed to disconnect wallet', 'error');
    }
}

/**
 * 显示通知消息
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型 ('success' 或 'error')
 */
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.textContent = message;
  
  // 根据类型设置背景色
  let bgColor = '#ef4444'; // 默认错误（红色）
  if (type === 'success') {
    bgColor = '#10b981'; // 成功（绿色）
  } else if (type === 'info') {
    bgColor = '#3b82f6'; // 信息（蓝色）
  }
  
  notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      background: ${bgColor};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
      transform: translateX(100%);
      opacity: 0;
  `;
    document.body.appendChild(notification);

    // 动画显示
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);

    // 自动消失
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * 初始化钱包UI状态
 */
function initializeWalletUI() {
    try {
        if (window.walletManager) {
            const userInfo = window.walletManager.getUserInfo();
            if (userInfo.isConnected) {
                updateWalletUI(userInfo.address, userInfo.credits);
                updateConnectButton(true);
            } else {
                resetWalletUI();
                updateConnectButton(false);
            }

            updateCheckinButton();

            // 初始化时渲染首选网络徽章
            try {
                const preferred = getPreferredNetwork?.();
                if (preferred) {
                    renderNetworkBadge(preferred);
                } else {
                    // 如果没有偏好，设置默认值并显示
                    setPreferredNetwork('bnb');
                }
            } catch (e) {
                console.error('Failed to render preferred network badge:', e);
            }
        }
    } catch (error) {
        console.error('Error initializing wallet UI:', error);
    }
}

/**
 * 更新钱包UI显示 - 更新为I3 tokens术语
 * @param {string} address - 钱包地址
 * @param {number} credits - I3 tokens数量
 */
function updateWalletUI(address, credits) {
    const accountBtnText = document.getElementById('accountBtnText');
    const creditsDisplay = document.getElementById('creditsDisplay');

    if (accountBtnText && address) {
        // 已连接：显示截断的钱包地址
        accountBtnText.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
    } else if (accountBtnText) {
        // 未连接：显示 Login
        accountBtnText.textContent = 'Login';
    }

    setWalletTypeIcon(window.walletManager?.walletType || null);

    if (creditsDisplay && address && typeof credits === 'number') {
        // 已连接：显示并更新 I3 tokens
        creditsDisplay.style.display = 'inline';
        const rounded = (Math.round((Number(credits) || 0) * 1000) / 1000).toFixed(3);
        creditsDisplay.textContent = `${rounded} I3 tokens`;
    } else if (creditsDisplay) {
        // 未连接：隐藏 token
        creditsDisplay.style.display = 'none';
    }
}


/**
 * 重置钱包UI到未连接状态
 */
function resetWalletUI() {
    const accountBtnText = document.getElementById('accountBtnText');
    const creditsDisplay = document.getElementById('creditsDisplay');
    
    if (accountBtnText) {
        accountBtnText.textContent = 'Login';
    }
    setWalletTypeIcon(null);
    
    if (creditsDisplay) {
      creditsDisplay.style.display = 'none';
    }

}

/**
 * 在账号按钮文本(#accountBtnText)右侧显示当前钱包的小图标
 * 会自动创建 <img id="walletTypeIcon">，并根据 walletType 切换 src/alt
 * @param {string|null} walletType - 'metamask' | 'walletconnect' | 'coinbase' | 'solana-phantom' | null
 */
function setWalletTypeIcon(walletType) {
    const textEl = document.getElementById('accountBtnText');
    if (!textEl) return;

    // 确保有图标元素
    let iconEl = document.getElementById('walletTypeIcon');
    if (!iconEl) {
        iconEl = document.createElement('img');
        iconEl.id = 'walletTypeIcon';
        // 插到地址文本后面
        if (textEl.parentNode) {
            textEl.parentNode.insertBefore(iconEl, textEl.nextSibling);
        }
    }

    // 本地 SVG 映射（把路径替换成你项目里已存在的 svg 资源路径）
    const ICONS = {
        metamask:        'svg/metamask.svg',
        walletconnect:   'svg/walletconnect.svg',
        coinbase:        'svg/coinbase.svg',
        binance:         'svg/binance.svg',
        'solana-phantom':'svg/phantom.svg'
    };

    // 根据类型设置
    const key = (walletType || '').toLowerCase();
    if (ICONS[key]) {
        iconEl.src = ICONS[key];
        iconEl.alt = key;
        iconEl.title = key === 'solana-phantom' ? 'Phantom (Solana)' : key.charAt(0).toUpperCase() + key.slice(1);
        iconEl.style.display = 'inline-block';
    } else {
        // 未连接或未知类型 -> 隐藏
        iconEl.removeAttribute('src');
        iconEl.removeAttribute('alt');
        iconEl.style.display = 'none';
    }
}


/**
 * 更新连接按钮状态 - 修改为显示钱包选择模态框
 * @param {boolean} isConnected - 是否已连接
 */
function updateConnectButton(isConnected) {
    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) {
        if (isConnected) {
            connectBtn.textContent = 'Disconnect Wallet';
            connectBtn.onclick = handleWalletDisconnect;
            connectBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        } else {
            connectBtn.textContent = 'Connect Wallet';
            connectBtn.onclick = showWalletSelectionModal; // 修改为显示钱包选择模态框
            connectBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
        }
    }
}

/**
 * 更新签到按钮状态 - 更新为I3 tokens术语
 */
function updateCheckinButton() {
    const checkinBtn = document.getElementById('checkinBtn');
    if (!checkinBtn || !window.walletManager) return;
    
    const userInfo = window.walletManager.getUserInfo();
    
    // 🔑 强制检查：明确的 Admin 判断
    const isAdminUser = (
        typeof window.isAdmin === 'function' && 
        window.currentUser && 
        window.currentUser.email && 
        window.isAdmin() === true
    );
    
    console.log('updateCheckinButton called:', { 
        isConnected: userInfo.isConnected, 
        isAdminUser 
    });
    
    if (userInfo.isConnected) {
        if (isAdminUser) {
            // Admin 逻辑
            const canCheckin = window.walletManager.canCheckinToday();
            checkinBtn.textContent = canCheckin ? 'Daily Check-in' : 'Already Checked-in Today';
            checkinBtn.disabled = !canCheckin;
            checkinBtn.style.opacity = canCheckin ? '1' : '0.6';
            checkinBtn.style.cursor = canCheckin ? 'pointer' : 'not-allowed';
            checkinBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
            checkinBtn.style.color = '#ffffff';
        } else {
            // 🔑 非 Admin：强制覆盖所有样式
            checkinBtn.textContent = 'Daily Check-in';
            checkinBtn.disabled = false;
            checkinBtn.style.opacity = '1';
            checkinBtn.style.cursor = 'pointer';
            checkinBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
            checkinBtn.style.color = '#ffffff';
        }
    } else {
        // 未连接
        checkinBtn.textContent = 'Daily Check-in';
        checkinBtn.disabled = true;
        checkinBtn.style.opacity = '0.4';
        checkinBtn.style.background = '#f3f4f6';
        checkinBtn.style.color = '#9ca3af';
        checkinBtn.style.cursor = 'not-allowed';
    }
}

/**
 * 检查钱包管理器是否可用
 */
function checkWalletManager() {
    let attempts = 0;
    const maxAttempts = 50;
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        if (window.walletManager) {
            clearInterval(checkInterval);
            initializeWalletUI();
            console.log('Wallet manager found and UI initialized');
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('Wallet manager not found after maximum attempts');
        }
    }, 100);
}

// 钱包事件监听器 - 更新为I3 tokens术语
window.addEventListener('walletConnected', function(event) {
    console.log('Wallet connected event received:', event.detail);
    const { address, credits, isNewUser } = event.detail;
    
    updateWalletUI(address, credits);
    updateConnectButton(true);
    updateCheckinButton();
    
    // Persist wallet linkage to Firestore after Firebase is ready
    const writeWalletLinkage = () => {
        try {
            if (typeof window.onWalletConnected !== 'function') return;
            const mm = window.walletManager?.getMetaMaskProvider?.();
			if (mm && typeof mm.request === 'function') {
			  mm.request({ method: 'eth_chainId' }).then((cid) => {
			    const networkName = mapChainIdToName(cid);
                const info = mapChainIdToDisplay(cid, window.walletManager?.walletType);
                renderNetworkBadge(info);
			    window.onWalletConnected(address, cid, networkName);
			  }).catch(() => window.onWalletConnected(address));
			} else {
			  window.onWalletConnected(address);
			}
        } catch (e) {
            console.warn('Failed to write wallet linkage to Firestore:', e);
        }
    };
    if (window.firebaseDb) {
        writeWalletLinkage();
    } else {
        const onReady = () => { window.removeEventListener('firebaseReady', onReady); writeWalletLinkage(); };
        window.addEventListener('firebaseReady', onReady);
    }

    // Optional: Attempt Firebase login automatically if allowed via setting
    try {
        const autoGoogle = (localStorage.getItem('autoGoogleOnWalletConnect') || 'off') === 'on';
        if (autoGoogle && window.firebaseAuth && !window.firebaseAuth.currentUser && typeof window.handleGoogleSignIn === 'function') {
            window.handleGoogleSignIn('auto');
        }
    } catch (e) {
        console.warn('Skipping Firebase auto-login after wallet connect:', e);
    }
    
    if (isNewUser) {
        showNotification('Welcome! You can earn 30 I3 tokens daily by checking in!', 'success');
    }
});

// Helper: map EVM chainId to human-readable name
function mapChainIdToName(chainId) {
    const map = {
        '0x1': 'Ethereum Mainnet',
        '0x5': 'Goerli Testnet',
        '0x38': 'BSC Mainnet',
        '0x61': 'BSC Testnet',
        '0x89': 'Polygon Mainnet'
    };
    return map[chainId] || chainId || null;
}

window.addEventListener('walletDisconnected', function() {
    console.log('Wallet disconnected event received');
    // 🔒 重置 WalletConnect 连接锁
    window.isWalletConnectConnecting = false;
    // 🔒 重置 wallet-manager 的连接锁
    if (window.walletManager) {
        window.walletManager.isConnecting = false;
    }
    resetWalletUI();
    updateConnectButton(false);
    updateCheckinButton();
    renderNetworkBadge({ name: getPreferredNetwork().name, icon: getPreferredNetwork().icon });
    showNotification('Wallet disconnected', 'success');
});

window.addEventListener('dailyCheckinSuccess', function(event) {
    console.log('Daily checkin success event received:', event.detail);
    const { reward, newBalance, totalCheckins } = event.detail;
    
    // 更新I3 tokens显示
    const creditsDisplay = document.getElementById('creditsDisplay');
    if (creditsDisplay) {
        const rounded = (Math.round((Number(newBalance) || 0) * 1000) / 1000).toFixed(3);
        creditsDisplay.textContent = `${rounded} I3 tokens`;
    }
    
    updateCheckinButton();
    
    // 显示更详细的成功信息
    showNotification(`Check-in #${totalCheckins} complete! +${reward} I3 tokens earned`, 'success');
});

window.addEventListener('creditsSpent', function(event) {
    console.log('Credits spent event received:', event.detail);
    const { amount, newBalance, reason } = event.detail;
    
    // 更新I3 tokens显示
    const creditsDisplay = document.getElementById('creditsDisplay');
    if (creditsDisplay) {
        const rounded = (Math.round((Number(newBalance) || 0) * 1000) / 1000).toFixed(3);
        creditsDisplay.textContent = `${rounded} I3 tokens`;
    }
    
    showNotification(`Spent ${amount} I3 tokens for ${reason}`, 'success');
});

// ESC 键关闭模态框
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('walletModal');
        if (modal && modal.classList.contains('show')) {
            closeWalletModal();
        }
    }
});

// ===== DApp Browser Auto-Connect =====
// Automatically connect when opened in a DApp browser with injected provider
async function attemptDappBrowserAutoConnect() {
    // Skip if already connected
    if (window.walletManager?.isConnected) {
        console.log('[AutoConnect] Already connected, skipping auto-connect');
        return false;
    }

    // Skip if walletManager not ready yet
    if (!window.walletManager) {
        console.log('[AutoConnect] WalletManager not ready');
        return false;
    }

    const isMobile = isMobileDevice() || isRealMobileDevice();
    
    // 🔑 Direct check for Binance DApp browser (highest priority)
    // This is the most reliable signal from the screenshot: ethereum.isBinance: true
    const hasBinanceInjected = window.ethereum?.isBinance === true && typeof window.ethereum?.request === 'function';
    
    // Check for other injected providers
    const hasBinanceProvider = hasBinanceInjected || hasStrongBinanceEvmProvider();
    const hasMetaMaskProvider = window.ethereum?.isMetaMask && !window.ethereum?.isBinance;
    const hasCoinbaseProvider = window.ethereum?.isCoinbaseWallet;
    const hasPhantomProvider = window.phantom?.solana?.isPhantom || window.solana?.isPhantom;
    const hasGenericProvider = window.ethereum && typeof window.ethereum.request === 'function';
    
    // Check UA for "bnc" which indicates Binance app
    const uaContainsBnc = /bnc/i.test(navigator.userAgent);
    
    console.log('[AutoConnect] DApp browser detection:', {
        isMobile,
        hasBinanceInjected,
        hasBinanceProvider,
        hasMetaMaskProvider,
        hasCoinbaseProvider,
        hasPhantomProvider,
        hasGenericProvider,
        uaContainsBnc,
        ethereumIsBinance: window.ethereum?.isBinance,
        ua: navigator.userAgent.substring(0, 100)
    });

    // Auto-connect conditions:
    // 1. Mobile DApp browsers
    // 2. OR desktop with clear Binance injection (isBinance flag)
    const shouldAutoConnect = isMobile || hasBinanceInjected;
    
    if (!shouldAutoConnect) {
        console.log('[AutoConnect] No auto-connect trigger detected');
        return false;
    }

    // Determine which wallet to auto-connect based on detected provider
    let walletType = null;
    let provider = null;

    // Prioritize Binance if isBinance flag is set OR UA contains "bnc"
    if (hasBinanceInjected || (hasBinanceProvider && uaContainsBnc)) {
        walletType = 'binance';
        provider = window.ethereum; // Use window.ethereum directly since isBinance is true
        console.log('[AutoConnect] 🎯 Detected Binance DApp browser (isBinance=' + window.ethereum?.isBinance + ', uaContainsBnc=' + uaContainsBnc + ')');
    } else if (hasBinanceProvider) {
        walletType = 'binance';
        provider = getBinanceProvider();
        console.log('[AutoConnect] Detected Binance provider');
    } else if (hasMetaMaskProvider) {
        walletType = 'metamask';
        provider = window.ethereum;
        console.log('[AutoConnect] Detected MetaMask DApp browser');
    } else if (hasCoinbaseProvider) {
        walletType = 'coinbase';
        provider = window.ethereum;
        console.log('[AutoConnect] Detected Coinbase DApp browser');
    } else if (hasPhantomProvider) {
        walletType = 'phantom';
        provider = window.phantom?.solana || window.solana;
        console.log('[AutoConnect] Detected Phantom DApp browser');
    } else if (hasGenericProvider && isMobile) {
        // On mobile with a generic provider, assume it's the wallet's built-in browser
        walletType = 'generic';
        provider = window.ethereum;
        console.log('[AutoConnect] Detected generic mobile DApp browser');
    }

    if (!walletType || !provider) {
        console.log('[AutoConnect] No suitable injected provider found for auto-connect');
        return false;
    }

    try {
        console.log(`[AutoConnect] Auto-connecting with ${walletType}...`);
        
        // Handle Solana (Phantom) separately
        if (walletType === 'phantom') {
            setPreferredNetwork('solana');
            const result = await window.walletManager.connectSolana('phantom');
            if (result?.success) {
                console.log('[AutoConnect] Phantom auto-connect successful:', result.address);
                showNotification('Wallet connected automatically!', 'success');
                return true;
            }
            return false;
        }

        // EVM wallets
        // Set appropriate default network
        if (walletType === 'binance') {
            setPreferredNetwork('bnb');
        } else if (walletType === 'coinbase') {
            setPreferredNetwork('base');
        } else if (!getPreferredNetwork()) {
            setPreferredNetwork('ethereum');
        }

        // Request accounts from injected provider
        console.log('[AutoConnect] Requesting accounts from injected provider...');
        
        // First check if already authorized
        let accounts = [];
        try {
            accounts = await Promise.race([
                provider.request({ method: 'eth_accounts' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]);
        } catch (e) {
            console.log('[AutoConnect] eth_accounts check failed:', e.message);
        }

        // If not authorized, request authorization
        if (!accounts || accounts.length === 0) {
            console.log('[AutoConnect] No existing authorization, requesting accounts...');
            try {
                await Promise.race([
                    provider.request({ method: 'eth_requestAccounts' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);
            } catch (e) {
                if (e.code === 4001) {
                    console.log('[AutoConnect] User rejected connection');
                    return false;
                }
                console.warn('[AutoConnect] eth_requestAccounts warning:', e.message);
            }
        }

        // Wait for accounts
        const address = await waitForAccounts(provider, { totalMs: 8000 });
        if (!address) {
            console.log('[AutoConnect] Failed to get account address');
            return false;
        }

        // Get chain ID
        const chainId = await provider.request({ method: 'eth_chainId' });

        // Update wallet manager state
        window.walletManager.ethereum = provider;
        window.walletManager.walletType = walletType === 'generic' ? 'injected' : walletType;
        window.walletManager.walletAddress = address;
        window.walletManager.isConnected = true;

        // Load wallet data
        try {
            await window.walletManager.fetchRemoteWalletDataIfAvailable?.();
        } catch (e) {
            console.warn('[AutoConnect] Failed to fetch remote data:', e);
        }

        window.walletManager.loadWalletSpecificData?.();
        window.walletManager.saveToStorage?.();
        window.walletManager.setupEventListeners?.();
        window.walletManager.updateUI?.();

        // Dispatch connected event
        window.dispatchEvent(new CustomEvent('walletConnected', {
            detail: {
                address,
                credits: window.walletManager.credits || 0,
                isNewUser: !window.walletManager.getWalletData?.(address)
            }
        }));

        // Update network badge
        try {
            const networkInfo = mapChainIdToDisplay(chainId, walletType);
            if (networkInfo) {
                renderNetworkBadge(networkInfo);
            }
        } catch (e) {
            console.warn('[AutoConnect] Failed to update network badge:', e);
        }

        console.log(`[AutoConnect] ✅ Success! Connected ${walletType} wallet:`, address.slice(0, 6) + '...' + address.slice(-4));
        showNotification('Wallet connected automatically!', 'success');
        return true;

    } catch (error) {
        console.error('[AutoConnect] Auto-connect failed:', error);
        return false;
    }
}

// ===== Debug Overlay =====
function createDebugOverlay() {
  // Check if already exists
  if (document.getElementById('debug-overlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  overlay.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.9);
    color: #00ff00;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    z-index: 999999;
    border-top: 2px solid #00ff00;
  `;
  overlay.innerHTML = '<div style="color: #ffff00; margin-bottom: 5px;">🔍 DEBUG OVERLAY</div>';
  document.body.appendChild(overlay);
}

function debugLog(message, type = 'info') {
  const overlay = document.getElementById('debug-overlay');
  if (!overlay) {
    createDebugOverlay();
  }
  
  const logDiv = document.getElementById('debug-overlay');
  if (logDiv) {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
      'info': '#00ff00',
      'warn': '#ffff00', 
      'error': '#ff4444',
      'success': '#00ffff'
    };
    const color = colors[type] || '#00ff00';
    const entry = document.createElement('div');
    entry.style.cssText = `color: ${color}; margin: 2px 0; word-wrap: break-word;`;
    entry.textContent = `[${timestamp}] ${message}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
  
  // Also log to console
  console.log(`[DEBUG] ${message}`);
}

// ===== DApp Browser Detection with Caching =====
// Cache the detection result AND the original provider at page load
// because other SDKs may overwrite window.ethereum later
let _cachedIsDappBrowser = null;
let _cachedOriginalProvider = null;

// CRITICAL: Run detection IMMEDIATELY when script loads (before other SDKs can overwrite)
(function earlyDappBrowserCache() {
  if (window.ethereum && window.ethereum.isBinance === true) {
    _cachedIsDappBrowser = true;
    _cachedOriginalProvider = window.ethereum;
    console.log('[EARLY CACHE] ✅ Detected DApp browser, saved provider reference BEFORE SDKs could overwrite');
  } else {
    console.log('[EARLY CACHE] ℹ️ Not in DApp browser or ethereum not yet available');
  }
})();

function detectAndCacheDappBrowser() {
  // Only detect once at page load
  if (_cachedIsDappBrowser !== null) {
    return _cachedIsDappBrowser;
  }
  
  // Check if window.ethereum.isBinance is true
  const isDappBrowser = window.ethereum && window.ethereum.isBinance === true;
  
  if (isDappBrowser) {
    // Cache the result AND save a reference to the original provider
    _cachedIsDappBrowser = true;
    _cachedOriginalProvider = window.ethereum;
    console.log('[Cache] Cached DApp browser detection: TRUE, saved original provider');
  } else {
    _cachedIsDappBrowser = false;
  }
  
  return _cachedIsDappBrowser;
}

function detectBinanceDappBrowser() {
  // Use cached result if available
  if (_cachedIsDappBrowser !== null) {
    return _cachedIsDappBrowser;
  }
  // Otherwise do fresh detection
  return detectAndCacheDappBrowser();
}

function getCachedBinanceProvider() {
  // Return the cached original provider (before other SDKs overwrote it)
  return _cachedOriginalProvider;
}

// Show visual indicator when DApp browser is detected
function showDappBrowserIndicator() {
  // Create debug overlay first
  createDebugOverlay();
  
  debugLog('Starting DApp browser detection...', 'info');
  debugLog(`window.ethereum exists: ${!!window.ethereum}`, 'info');
  debugLog(`window.ethereum.isBinance: ${window.ethereum?.isBinance}`, 'info');
  debugLog(`window.ethereum.isMetaMask: ${window.ethereum?.isMetaMask}`, 'info');
  debugLog(`typeof window.ethereum.request: ${typeof window.ethereum?.request}`, 'info');
  
  const isDetected = detectBinanceDappBrowser();
  debugLog(`detectBinanceDappBrowser() returned: ${isDetected}`, isDetected ? 'success' : 'warn');

  if (isDetected) {
    // Create a visible banner at the top of the page
    const banner = document.createElement('div');
    banner.id = 'dapp-browser-indicator';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-weight: 600;
      font-size: 16px;
      z-index: 100000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      border-bottom: 2px solid #b45309;
    `;
    banner.textContent = '🎯 Binance DApp Browser Detected!';
    document.body.insertBefore(banner, document.body.firstChild);
    
    // Adjust body padding to account for banner
    document.body.style.paddingTop = '50px';
    
    debugLog('✅ DApp browser banner displayed', 'success');
  } else {
    debugLog('⚠️ NOT detected as DApp browser', 'warn');
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('Wallet integration script loaded');
    
    // Show DApp browser indicator
    showDappBrowserIndicator();
    
    checkWalletManager();
    
    // Cross-page reconcile: if Firebase is ready and wallet connected, hydrate from Firestore
    try {
        if (window.walletManager && window.walletManager.isConnected && typeof window.walletManager.fetchRemoteWalletDataIfAvailable === 'function') {
            if (window.firebaseDb) {
                window.walletManager.fetchRemoteWalletDataIfAvailable();
            } else {
                window.addEventListener('firebaseReady', () => {
                    if (window.walletManager && window.walletManager.isConnected) {
                        window.walletManager.fetchRemoteWalletDataIfAvailable();
                    }
                });
            }
        }
    } catch (e) { console.warn('Cross-page reconcile skipped:', e); }
});

// 页面可见性变化时重新检查状态
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.walletManager) {
        setTimeout(() => {
            initializeWalletUI();
        }, 500);
    }
});

// 导出函数到全局作用域
window.handleWalletConnect = handleWalletConnect;
window.handleDailyCheckin = handleDailyCheckin;
window.executeLocalCheckin = executeLocalCheckin;
window.handleWalletDisconnect = handleWalletDisconnect;
window.showNotification = showNotification;
window.initializeWalletUI = initializeWalletUI;
window.showWalletSelectionModal = showWalletSelectionModal;
window.closeWalletModal         = closeWalletModal;
window.connectMetaMaskWallet    = connectMetaMaskWallet;
window.connectBinanceWallet     = connectBinanceWallet;
window.connectCoinbaseWallet    = connectCoinbaseWallet; 
window.connectWalletConnect     = connectWalletConnect;
window.connectSolanaPhantom     = connectSolanaPhantom;
// 导出移动设备检测函数
window.isMobileDevice = isMobileDevice;
window.isRealMobileDevice = isRealMobileDevice;
// 导出 DApp 浏览器检测函数
window.detectBinanceDappBrowser = detectBinanceDappBrowser;
// 导出调试函数
window.debugLog = debugLog;
window.createDebugOverlay = createDebugOverlay;


console.log('✅ Wallet integration functions loaded successfully');


function getAddChainParams(preferred) {
  const MAP = {
    '0x1':    { chainName:'Ethereum Mainnet', rpcUrls:['https://rpc.ankr.com/eth'] },
    '0x38':   { chainName:'BNB Smart Chain',  rpcUrls:['https://bsc-dataseed.binance.org'] },
    '0x2105': { chainName:'Base',             rpcUrls:['https://mainnet.base.org'] },
    '0xa4b1': { chainName:'Arbitrum One',     rpcUrls:['https://arb1.arbitrum.io/rpc'] },
    '0x144':  { chainName:'ZKsync Era',       rpcUrls:['https://mainnet.era.zksync.io'] },
    '0x44d':   { chainName:'Polygon zkEVM',    rpcUrls:['https://zkevm-rpc.com'] },
    '0xa':    { chainName:'Optimism',         rpcUrls:['https://mainnet.optimism.io'] },
    '0xcc':   { chainName:'opBNB', rpcUrls:['https://opbnb-mainnet-rpc.bnbchain.org'] },
  };
  const base = MAP[preferred.chainId] || { chainName: preferred.name, rpcUrls: [] };
  return { chainId: preferred.chainId, chainName: base.chainName, rpcUrls: base.rpcUrls, nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18} };
}

console.log('✅ Unified wallet connection function loaded');

// === Network badge helpers ===
function mapChainIdToDisplay(chainId, walletType, solanaNetworkHint) {
  const CHAINS = {
    '0x1':     { name:'Ethereum',      icon:'svg/chains/ethereum.svg' },
    '0x38':    { name:'BNB Chain',     icon:'svg/chains/bnb.svg' },
    '0x61':    { name:'BSC Testnet',   icon:'svg/chains/bnb.svg' },
    '0x44d':   { name:'Polygon zkEVM', icon:'svg/chains/polygon-zkevm.svg' },
    '0xa':     { name:'Optimism',      icon:'svg/chains/optimism.svg' },
    '0xa4b1':  { name:'Arbitrum One',  icon:'svg/chains/arbitrum.svg' },
    '0x2105':  { name:'Base',          icon:'svg/chains/base.svg' },
    '0x144':   { name:'ZKsync Era',    icon:'svg/chains/zksync.svg' },
    '0xcc':    { name:'opBNB', icon:'svg/chains/opbnb.svg' },
  };
  // Solana（用 walletType + network hint）
  if ((walletType || '').startsWith('solana')) {
    const net = (solanaNetworkHint || 'devnet').toLowerCase();
    return { name: `Solana ${net[0].toUpperCase()+net.slice(1)}`, icon:'svg/chains/solana.svg' };
  }
  return CHAINS[chainId] || null; // 未匹配则不显示
}

function renderNetworkBadge(info) {
  const badge = document.getElementById('networkBadge');
  if (!badge) return;

  // 没有链信息时隐藏
  if (!info) {
    badge.style.display = 'none';
    return;
  }

  const { name, icon } = info;
  const iconEl = badge.querySelector('.network-badge__icon');
  const textEl = badge.querySelector('.network-badge__text');

  if (textEl) textEl.textContent = name;

  if (iconEl && icon) {
    // 先预加载图标，避免出现破图闪烁
    const img = new Image();
    img.onload = () => {
      iconEl.src = icon;
      iconEl.alt = name;
      badge.style.display = 'inline-flex';
    };
    img.onerror = () => {
      // 图标加载失败也至少显示徽章
      badge.style.display = 'inline-flex';
    };
    img.src = icon;
  } else {
    badge.style.display = 'inline-flex';
  }

  badge.style.cursor = 'pointer';

  // 点击徽章时打开网络选择器
  badge.onclick = () => {
    try {
      openNetworkPickerModal();
    } catch (e) {
      console.error(e);
    }
  };
}


async function enforcePreferredEvmChain(provider) {
  const preferred = getPreferredNetwork();
  if (!preferred || preferred.kind !== 'evm' || !provider || typeof provider.request !== 'function') return;
  try {
    const current = await provider.request({ method: 'eth_chainId' });
    if (current.toLowerCase() !== preferred.chainId.toLowerCase()) {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: preferred.chainId }]
      });
    }
  } catch (e) {
    if (e.code === 4902) {
      // 链还没加，先加再切
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [getAddChainParams(preferred)]
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: preferred.chainId }]
      });
    } else {
      throw e;
    }
  }
}

function openNetworkPickerModal() {
  // 如果已存在，做成 toggle
  const exists = document.getElementById('networkModal');
  if (exists) {
    exists.classList.toggle('show');
    return;
  }

  // 关闭时移除节点
  function close() {
    const m = document.getElementById('networkModal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(() => { try { m.remove(); } catch {} }, 250);
  }

  // 1) 遮罩
  const modal = document.createElement('div');
  modal.id = 'networkModal';
  modal.className = 'network-modal'; // 独立类名，避免和钱包模态冲突
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  // 2) 面板
  const panel = document.createElement('div');
  panel.className = 'network-modal-content';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  // 3) 头部
  const header = document.createElement('div');
  header.className = 'network-modal-header';
  header.innerHTML = `
    <div class="network-modal-title">Select a Network</div>
    <button class="network-close-btn" aria-label="Close">✕</button>
  `;
  header.querySelector('.network-close-btn').onclick = () => close();

  // 4) 列表
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '12px';

  const order = ['bnb','opbnb','ethereum','base','arbitrum','zksync','polygon-zkevm','optimism','solana'];

  // ✅ 和 Login 保持一致的结构：wallet-option + wallet-icon-wrap + wallet-info/wallet-name
const makeRow = (net) => {
  const row = document.createElement('div');
  row.className = 'wallet-option available';

  // ✅ 检查是否支持签到
  const supportsCheckIn = (net.key === 'bnb' || net.key === 'opbnb' || net.key === 'solana');
  
  row.innerHTML = `
    <span class="wallet-icon-wrap">
      <img src="${net.icon}" alt="${net.name}">
    </span>
    <div class="wallet-info">
      <div class="wallet-name">
        ${net.name}
      </div>
    </div>
  `;

  // ✅ 改为异步：点选后立即切链（若已连接）
  row.onclick = async () => {
    try {
      // 1) 先写入首选网络 & 立刻刷新左上角徽章
      setPreferredNetwork(net.key);
      renderNetworkBadge({ name: net.name, icon: net.icon });

      // 2) 如果当前已连接：EVM 直接切链；Solana 给提示
      const isConnected = !!(window.walletManager?.isConnected);
      if (isConnected) {
        if (net.kind === 'evm') {
          const provider =
            window.walletManager?.getMetaMaskProvider?.() ||
            window.walletManager?.ethereum ||
            window.ethereum;

          if (provider?.request) {
            // 复用你已有的切链助手：内部会判断当前链 & 处理 4902 add+switch
            await enforcePreferredEvmChain(provider);
          } else {
            throw new Error('No EVM provider available');
          }
        } else if (net.kind === 'solana') {
          // 目前已连的是 EVM 钱包时，提示使用 Solana 钱包
          window.showNotification?.(
            'Please connect with a Solana wallet (e.g., Phantom) to use Solana.',
            'info'
          );
        }
      }
    } catch (e) {
      console.error('[NetworkPicker] switch failed:', e);
      window.showNotification?.(e?.message || 'Failed to switch network', 'error');
    } finally {
      // 不论成功/失败都关闭弹窗
      close();
    }
  };

  return row;
};

  order.forEach(k => { const n = I3_NETWORKS[k]; if (n) list.appendChild(makeRow(n)); });

  // 5) 页脚
  const footer = document.createElement('div');
  footer.className = 'network-modal-footer';
  footer.innerHTML = `
  <div style="text-align: center; color: #6b7280; font-size: 13px;">
    By Intelligence Cubed
  </div>
  `;

  // 6) 组装
  panel.appendChild(header);
  panel.appendChild(list);
  panel.appendChild(footer);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  // 展示
  requestAnimationFrame(() => modal.classList.add('show'));
}


// ===== Preferred Network (pre-connect) =====
const I3_NETWORKS = {
  ethereum: { kind:'evm', key:'ethereum', name:'Ethereum', icon:'svg/chains/ethereum.svg', chainId:'0x1' },
  bnb:      { kind:'evm', key:'bnb',      name:'BNB Chain', icon:'svg/chains/bnb.svg',      chainId:'0x38' },
  base:     { kind:'evm', key:'base',     name:'Base',      icon:'svg/chains/base.svg',     chainId:'0x2105' },
  arbitrum: { kind:'evm', key:'arbitrum', name:'Arbitrum One', icon:'svg/chains/arbitrum.svg', chainId:'0xa4b1' },
  zksync:   { kind:'evm', key:'zksync',   name:'ZKsync Era',   icon:'svg/chains/zksync.svg',   chainId:'0x144' },
  'polygon-zkevm': { kind:'evm', key:'polygon-zkevm', name:'Polygon zkEVM', icon:'svg/chains/polygon-zkevm.svg', chainId:'0x44d' },
  optimism: { kind:'evm', key:'optimism', name:'Optimism', icon:'svg/chains/optimism.svg', chainId:'0xa' },
  opbnb: { kind:'evm', key:'opbnb', name:'opBNB', icon:'svg/chains/opbnb.svg', chainId:'0xcc' },
  solana:   { kind:'solana', key:'solana', name:'Solana (Devnet)', icon:'svg/chains/solana.svg', network:'devnet' },
};

function getPreferredNetwork() {
  try {
    const raw = localStorage.getItem('i3_preferred_network');
    const data = raw ? JSON.parse(raw) : null;
    if (data && I3_NETWORKS[data.key]) return I3_NETWORKS[data.key];
  } catch {}
  // Return null if no preference is set (do not force switch to BNB)
  return null; 
}

function setPreferredNetwork(key) {
  const n = I3_NETWORKS[key] || I3_NETWORKS.ethereum;
  localStorage.setItem('i3_preferred_network', JSON.stringify({ key: n.key }));
  // 刷新徽章
  renderNetworkBadge({ name: n.name, icon: n.icon });
}

document.addEventListener('DOMContentLoaded', () => {
  const n = getPreferredNetwork();
  // 未连接也显示徽章（如果没有偏好，默认显示 BNB Chain）
  if (n) {
    renderNetworkBadge({ name: n.name, icon: n.icon });
  } else {
    // 默认设置为 BNB Chain 并显示
    setPreferredNetwork('bnb');
  }
  // 点击徽章 -> 打开网络选择面板
  const badge = document.getElementById('networkBadge');
  if (badge) badge.addEventListener('click', openNetworkPickerModal);
});

// ===== 链上签到 Modal 控制函数 =====
function openOnChainCheckInModal() {
    const modal = document.getElementById('onChainCheckInModal');
    if (!modal) {
        console.error('On-chain check-in modal not found');
        return;
    }
    
    // 检查钱包连接
    if (!window.walletManager || !window.walletManager.isConnected) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    modal.style.display = 'flex';
        // —— 插入开始：打开时根据本地状态初始化 UI —— 
		try {
		  const btn = document.getElementById('executeCheckInBtn');
		  const streakEl = document.getElementById('currentStreak');
		  const totalEl  = document.getElementById('totalCheckIns');
		  const rewardEl = document.getElementById('nextReward');
		  // 固定显示 30
		  if (rewardEl) rewardEl.textContent = '30';
		  // 从本地数据回填数字（与 walletManager/dailyCheckin 写入的 key 对齐）
		  const totalChk = parseInt(localStorage.getItem('total_checkins') || '0', 10);
		  if (totalEl) totalEl.textContent = String(totalChk);
		  // streak 采用同一 id（若你有单独累计，也可从 localStorage 读取自有 key）
		  // 先不做复杂计算：若今天已签，则至少显示 >=1；否则保持现值或 0
		  const lastMs = parseInt(localStorage.getItem('last_checkin_at') || '0', 10);
		  const DAY_MS = 24 * 60 * 60 * 1000;
		  const checkedToday = lastMs > 0 && (Date.now() - lastMs) < DAY_MS;
		  if (checkedToday) {
		    if (btn) {
		      btn.disabled = true;
		      btn.textContent = 'Already Checked Today';
		      btn.classList?.add?.('opacity-60', 'pointer-events-none');
		    }
		  } else {
		    if (btn) {
		      btn.disabled = false;
		      btn.textContent = 'Daily Check-in';
		      btn.classList?.remove?.('opacity-60', 'pointer-events-none');
		    }
		  }
		  // 兼容你在 Solana 成功后写入的"今日已签"标志（双保险）
		  try {
		    const mark = JSON.parse(localStorage.getItem('checkin_status_SOLANA') || 'null');
		    if (mark && mark.date === new Date().toISOString().slice(0,10) && btn) {
		      btn.disabled = true;
		      btn.textContent = 'Already Checked Today';
		      btn.classList?.add?.('opacity-60', 'pointer-events-none');
		    }
		  } catch (_) {}
		} catch (e) {
		  console.warn('[modal init] Failed to init gate from local storage:', e);
		}
		// —— 插入结束 —— 
    modal.classList.add('show');
}

function closeOnChainCheckInModal() {
    const modal = document.getElementById('onChainCheckInModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

async function executeOnChainCheckIn() {
    const chainSelector = document.getElementById('chainSelector');
    const selectedChain = chainSelector ? chainSelector.value : 'BSC';
    const loadingDiv = document.getElementById('checkInLoading');
    const btn = document.getElementById('executeCheckInBtn');
    
    try {
        // 显示加载状态
        if (loadingDiv) loadingDiv.style.display = 'block';
        if (btn) btn.disabled = true;
        
        // 这里添加你的链上签到逻辑
        // 暂时使用本地签到作为示例
        handleDailyCheckin();
        
        // 成功后关闭 Modal
        setTimeout(() => {
            closeOnChainCheckInModal();
        }, 1500);
        
    } catch (error) {
        console.error('On-chain check-in error:', error);
        showNotification('On-chain check-in failed: ' + error.message, 'error');
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (btn) btn.disabled = false;
    }
}

// 导出到全局
window.openOnChainCheckInModal = openOnChainCheckInModal;
window.closeOnChainCheckInModal = closeOnChainCheckInModal;
window.executeOnChainCheckIn = executeOnChainCheckIn;

console.log('✅ On-chain check-in modal functions loaded');

// ===== Binance Wallet 调试辅助 =====
// 在页面加载时检测 Binance Wallet provider 并输出调试信息
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    console.log('🔍 [Binance Debug] Checking for Binance Wallet provider...');
    console.log('🔍 [Binance Debug] UserAgent:', navigator.userAgent);
    
    const debug = {
      ua: navigator.userAgent,
      isMobileEnv: isMobileDevice() || isRealMobileDevice(),
      hasInjectedProvider: !!getBinanceProvider(),
      binanceChain: !!window.binanceChain,
      BinanceChain: !!window.BinanceChain,
      binancew3w: !!window.binancew3w,
      ethereumIsBinance: !!window.ethereum?.isBinance,
      ethereumProviders: window.ethereum?.providers?.map(p => ({
        isBinance: p?.isBinance,
        isMetaMask: p?.isMetaMask,
        isCoinbaseWallet: p?.isCoinbaseWallet
      })) || null
    };
    
    console.log('🔍 [Binance Debug] Complete environment info:', debug);
    
    // 如果检测到 Binance provider，输出成功消息
    const provider = getBinanceProvider();
    if (provider) {
      console.log('✅ [Binance Debug] Binance Wallet provider detected!');
      console.log('✅ [Binance Debug] Provider details:', {
        hasRequest: typeof provider.request === 'function',
        isBinance: provider.isBinance,
        isConnected: provider.isConnected,
        chainId: provider.chainId
      });
    } else {
      console.warn('⚠️ [Binance Debug] Binance Wallet provider not detected');
      console.warn('⚠️ [Binance Debug] Available global objects:', {
        'window.binanceChain': !!window.binanceChain,
        'window.BinanceChain': !!window.BinanceChain,
        'window.binancew3w': !!window.binancew3w,
        'window.ethereum': !!window.ethereum,
        'window.ethereum?.isBinance': !!window.ethereum?.isBinance
      });
      
      if (isMobileDevice() || isRealMobileDevice()) {
        console.log('💡 [Binance Debug] Mobile: Please open this page in Binance Wallet App browser');
      } else {
        console.log('💡 [Binance Debug] Desktop: Please install Binance Wallet Chrome extension');
      }
    }
  }, 2000); // 延迟 2 秒，确保所有脚本都已加载
});
