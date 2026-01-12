// onchain-checkin.js - 统一的链上签到入口（EVM + Solana）完整版

/* ======================== 通用工具函数 ======================== */

/**
 * 安全的通知函数（兼容全站通知系统）
 */
function safeNotify(msg, type = 'info', opts = {}) {
    try {
        if (typeof window.showNotification === 'function') {
            return window.showNotification(msg, type, opts);
        }
        // Fallback toast
        let host = document.getElementById('i3-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'i3-toast-host';
            host.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:12px;pointer-events:none;`;
            document.body.appendChild(host);
        }
        const palette = {
            success: ['#10b981', '#ecfdf5'],
            error: ['#ef4444', '#fef2f2'],
            warning: ['#f59e0b', '#fffbeb'],
            info: ['#3b82f6', '#eff6ff']
        };
        const [fg, bg] = palette[type] || palette.info;
        const el = document.createElement('div');
        el.style.cssText = `min-width:280px;max-width:640px;background:${bg};color:#111827;border-left:6px solid ${fg};` +
            'box-shadow:0 10px 25px rgba(0,0,0,.15);border-radius:12px;padding:14px 18px;font-size:14px;font-weight:600;pointer-events:auto;';
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'opacity .25s, transform .25s';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-6px)';
            setTimeout(() => el.remove(), 260);
        }, opts.duration || 2600);
    } catch (e) {
        console.log('[notify-fallback]', msg);
    }
}

/**
 * 检查 EVM 地址是否有效
 */
function isValidEvmAddress(addr) {
    return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/**
 * 检查是否选择了Solana链
 */
function isSolanaSelectedInUI() {
    const sel = document.getElementById('chainSelector');
    if (!sel) return false;
    const v = (sel.value || '').toString().trim().toUpperCase();
    return (
        v === 'SOL' ||
        v === 'SOLANA' ||
        v === 'SOLANA_DEVNET' ||
        v === 'SOLANA DEVNET' ||
        v === 'SOLANA_MAINNET' ||
        v === 'SOLANA MAINNET' ||
        v === 'MAINNET_SOLANA'
    );
}

/**
 * 更新UI状态显示
 */
function updateStatusUI(streak, totalCheckIns, nextReward, canCheckIn) {
    const streakEl = document.getElementById('currentStreak');
    const totalEl = document.getElementById('totalCheckIns');
    const rewardEl = document.getElementById('nextReward');
    const btn = document.getElementById('executeCheckInBtn');

    if (streakEl) streakEl.textContent = `${streak ?? 0} days`;
    if (totalEl) totalEl.textContent = String(totalCheckIns ?? 0);
    if (rewardEl) rewardEl.textContent = `${nextReward ?? 30} credits`;

    if (btn) {
        btn.disabled = !canCheckIn;
        btn.textContent = canCheckIn ? 'Check In Now' : 'Already Checked In Today';
        btn.style.opacity = canCheckIn ? '1' : '0.6';
        btn.style.cursor = canCheckIn ? 'pointer' : 'not-allowed';
    }
}

/**
 * 防重入锁
 */
if (typeof window.__i3_checkin_busy === 'undefined') {
    window.__i3_checkin_busy = false;
}

function setBusy(busy) {
    window.__i3_checkin_busy = !!busy;
    const btn = document.getElementById('executeCheckInBtn');
    if (btn) {
        btn.disabled = busy;
    }
}

/**
 * Loading状态
 */
function setLoadingState(isLoading, message = 'Processing...') {
    const loading = document.getElementById('checkInLoading');
    const btn = document.getElementById('executeCheckInBtn');
    const loadingText = document.getElementById('loadingText');

    if (loading) loading.style.display = isLoading ? 'block' : 'none';
    if (btn) btn.style.display = isLoading ? 'none' : 'block';
    if (loadingText) loadingText.textContent = message;
}

/* ======================== EVM 专属函数 ======================== */

/**
 * 加载用户链上签到状态（EVM）
 */
async function loadUserCheckInStatus() {
    try {
        // Solana早退
        if (isSolanaSelectedInUI()) {
            console.log('[checkin] Solana selected - skip EVM status load');
            return;
        }

        if (!window.walletManager || !window.walletManager.isConnected) {
            console.warn('Wallet not connected, skipping status load');
            return;
        }

        const address = window.walletManager.walletAddress;
        const chainSelector = document.getElementById('chainSelector');
        const selectedChain = chainSelector ? chainSelector.value : 'BSC';
        const config = window.getContractConfig(selectedChain);

        if (!config) {
            console.error('Invalid chain config');
            updateStatusUI(0, 0, 30, false);
            return;
        }

        // 检查ethers是否加载
        if (typeof ethers === 'undefined') {
            console.error('Ethers.js not loaded');
            updateStatusUI(0, 0, 30, false);
            return;
        }

        // 创建只读provider
        const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        const contract = new ethers.Contract(
            config.checkInAddress,
            window.CHECKIN_ABI,
            provider
        );

        // 查询用户状态
        const status = await contract.getUserStatus(address);
        
        // status是数组: [lastDay, streak, totalCredits, availableCredits, nextReward, canCheckInToday]
        const streak = status[1].toString();
        const totalCheckIns = status[2].toString();
        const nextReward = status[4].toString();
        const canCheckIn = status[5];

        updateStatusUI(streak, totalCheckIns, nextReward, canCheckIn);

    } catch (error) {
        console.error('Failed to load check-in status:', error);
        updateStatusUI(0, 0, 30, true);
    }
}

/**
 * 切换到指定链
 */
async function switchToChain(targetChainId) {
    try {
        // 优先使用 walletManager 中存储的 provider
        let provider = window.walletManager?.ethereum;
        
        // 如果没有，尝试从 walletManager 获取（根据钱包类型）
        if (!provider && window.walletManager?.walletType === 'binance') {
            // 尝试获取 Binance provider
            if (typeof window.getBinanceProvider === 'function') {
                provider = window.getBinanceProvider();
            } else if (typeof window.getCachedBinanceProvider === 'function') {
                provider = window.getCachedBinanceProvider();
            }
        }
        
        // 最后的回退：使用 window.ethereum
        if (!provider) {
            provider = window.ethereum;
        }
        
        if (!provider || typeof provider.request !== 'function') {
            throw new Error('No wallet provider found');
        }

        // 获取当前链
        const currentChainId = await provider.request({ method: 'eth_chainId' });
        
        if (currentChainId === targetChainId) {
            return true; // 已经在目标链
        }

        // 尝试切换
        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: targetChainId }],
            });
            return true;
        } catch (switchError) {
            // 如果链未添加（错误码4902），则添加链
            if (switchError.code === 4902) {
                const config = window.getContractConfig(targetChainId);
                if (!config) {
                    throw new Error('Chain configuration not found');
                }

                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: targetChainId,
                        chainName: config.chainName,
                        rpcUrls: [config.rpcUrl],
                        nativeCurrency: config.nativeCurrency,
                        blockExplorerUrls: [config.explorer]
                    }],
                });
                return true;
            }
            throw switchError;
        }
    } catch (error) {
        console.error('Failed to switch chain:', error);
        throw error;
    }
}

/**
 * 检查BNB余额是否足够
 */
async function checkBNBBalance(provider, address, minBalance = '0.00004') {
    try {
        const balance = await provider.getBalance(address);
        const minBalanceWei = ethers.utils.parseEther(minBalance);

        return {
            sufficient: balance.gte(minBalanceWei),
            balance: ethers.utils.formatEther(balance),
            minRequired: minBalance
        };
    } catch (error) {
        console.error('Failed to check balance:', error);
        throw error;
    }
}

/**
 * 显示余额不足Modal
 */
function showInsufficientBalanceModal(currentBalance, requiredBalance, symbol, chainKey) {
    const chain = String(chainKey || '').toUpperCase();
    const sym = String(symbol || 'ETH');
    let swapName = 'Swap to native gas token';
    let swapDesc = `Swap tokens to ${sym}`;
    let bridgeName = 'Bridge assets';
    let bridgeDesc = 'Bridge from another network';
    let depositName = 'Top up';
    let depositDesc = `Add ${sym} to your wallet`;
    
    if (chain === 'BSC' || chain === 'OPBNB') {
        swapName = 'Swap tokens to BNB';
        swapDesc = 'Use PancakeSwap to exchange tokens';
        bridgeName = 'Bridge from other chains';
        bridgeDesc = 'Transfer assets from Ethereum, etc.';
        depositName = 'Deposit from exchange';
        depositDesc = 'Withdraw BNB from your exchange account';
    } else if (chain === 'ETH') {
        swapName = 'Swap tokens to ETH';
        swapDesc = 'Use Uniswap to exchange tokens';
        bridgeName = 'Bridge from L2 / other chains';
        bridgeDesc = 'Move ETH to mainnet if needed';
        depositName = 'Buy / Deposit ETH';
        depositDesc = 'Top up ETH to pay gas';
    } else if (chain === 'BASE') {
        swapName = 'Swap tokens to ETH (Base)';
        swapDesc = 'Use Uniswap on Base';
        bridgeName = 'Bridge to Base';
        bridgeDesc = 'Use Base Bridge to move ETH to Base';
        depositName = 'Top up ETH on Base';
        depositDesc = 'Ensure your wallet has ETH on Base';
    }
    
    let modal = document.getElementById('insufficientBalanceModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'insufficientBalanceModal';
        modal.className = 'wallet-modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="wallet-modal-content" style="max-width: 520px;">
            <button class="wallet-close-btn" onclick="closeInsufficientBalanceModal()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 1L13 13M13 1L1 13" stroke="#374151" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
            <h3 style="margin: 0 0 8px 0;">Insufficient Gas Balance</h3>
            <p style="margin: 0 0 10px 0; color: #6b7280;">
                Current: <b>${currentBalance} ${sym}</b> &nbsp;|&nbsp; Estimated required: <b>${requiredBalance} ${sym}</b>
            </p>
            <p style="font-size: 13px; color: #374151; margin: 0 0 16px 0;">
                Please top up your gas token to complete check-in.
            </p>
            <div class="wallet-options">
                <div class="wallet-option available" onclick="redirectToSwap('${chain}')">
                    <span class="wallet-icon-wrap"></span>
                    <div class="wallet-info">
                        <div class="wallet-name">${swapName}</div>
                        <div class="wallet-description">${swapDesc}</div>
                    </div>
                </div>
                <div class="wallet-option available" onclick="redirectToBridge('${chain}')">
                    <span class="wallet-icon-wrap"></span>
                    <div class="wallet-info">
                        <div class="wallet-name">${bridgeName}</div>
                        <div class="wallet-description">${bridgeDesc}</div>
                    </div>
                </div>
                <div class="wallet-option available" onclick="redirectToBinanceDeposit('${chain}')">
                    <span class="wallet-icon-wrap"></span>
                    <div class="wallet-info">
                        <div class="wallet-name">${depositName}</div>
                        <div class="wallet-description">${depositDesc}</div>
                    </div>
                </div>
            </div>
            <div class="wallet-footer" style="margin-top: 20px;">
                By Intelligence Cubed
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

/**
 * 关闭余额不足Modal
 */
function closeInsufficientBalanceModal() {
    const modal = document.getElementById('insufficientBalanceModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

/**
 * 跳转函数
 */
function redirectToSwap(chainKey) {
    const chain = String(chainKey || '').toUpperCase();
    if (chain === 'BSC') {
        window.open('https://pancakeswap.finance/swap?chain=bsc', '_blank');
        return;
    }
    if (chain === 'OPBNB') {
        window.open('https://pancakeswap.finance/swap?chain=opbnb', '_blank');
        return;
    }
    if (chain === 'BASE') {
        window.open('https://app.uniswap.org/swap?chain=base', '_blank');
        return;
    }
    // ETH / default
    window.open('https://app.uniswap.org/swap?chain=mainnet', '_blank');
}

function redirectToBridge(chainKey) {
    const chain = String(chainKey || '').toUpperCase();
    if (chain === 'BASE') {
        window.open('https://bridge.base.org/', '_blank');
        return;
    }
    // BSC / OPBNB / default
    window.open('https://www.bnbchain.org/en/bnb-chain-bridge', '_blank');
}

function redirectToBinanceDeposit(chainKey) {
    const chain = String(chainKey || '').toUpperCase();
    if (chain === 'ETH' || chain === 'BASE') {
        // 通用：让用户去钱包的 buy/onramp 或交易所入金
        window.open('https://portfolio.metamask.io/buy', '_blank');
        return;
    }
    // BSC / OPBNB：沿用你原来的 Binance 指引
    window.open('https://www.binance.com/en/support/faq/list/2', '_blank');
}

/**
 * 更新Firebase（链上签到后）
 */
async function updateFirebaseAfterOnChainCheckIn(credits, txHash, streak) {
    try {
        if (!window.firebaseDb || !window.walletManager) {
            console.warn('Firebase or wallet manager not available');
            return;
        }

        const address = window.walletManager.walletAddress.toLowerCase();
        const { doc, updateDoc, setDoc, getDoc, serverTimestamp, increment } = 
            await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

        const walletRef = doc(window.firebaseDb, 'wallets', address);

        // 检查文档是否存在
        const walletSnap = await getDoc(walletRef);

        if (!walletSnap.exists()) {
            // 创建新文档
            await setDoc(walletRef, {
                address: address,
                credits: credits,
                lastCheckinAt: serverTimestamp(),
                totalCheckins: 1,
                currentStreak: streak,
                lastCheckinTx: txHash,
                lastCheckinType: 'on-chain',
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });
        } else {
            // 更新现有文档
            await updateDoc(walletRef, {
                credits: increment(credits),
                lastCheckinAt: serverTimestamp(),
                totalCheckins: increment(1),
                currentStreak: streak,
                lastCheckinTx: txHash,
                lastCheckinType: 'on-chain',
                lastUpdated: serverTimestamp()
            });
        }

        // 同步到本地内存
        if (window.walletManager) {
            window.walletManager.credits = (window.walletManager.credits || 0) + credits;
        }

        console.log('Firebase updated after on-chain check-in');
    } catch (error) {
        console.warn('Failed to update Firebase (non-critical):', error);
    }
}

/**
 * 执行EVM链上签到
 */
async function executeEVMCheckIn() {
    try {
        const address = window.walletManager.walletAddress;
        const chainSelector = document.getElementById('chainSelector');
        const selectedChain = chainSelector.value;
        const config = window.getContractConfig(selectedChain);

        if (!config) {
            safeNotify('Invalid chain selected', 'error');
            return;
        }

        if (!isValidEvmAddress(config.checkInAddress)) {
            safeNotify(`${selectedChain}: check-in contract address is not set`, 'error');
            return;
        }

        console.log('Starting on-chain check-in on', config.chainName);

        // 获取 provider（优先使用 walletManager 中存储的）
        let provider = window.walletManager?.ethereum;
        if (!provider && window.walletManager?.walletType === 'binance') {
            if (typeof window.getBinanceProvider === 'function') {
                provider = window.getBinanceProvider();
            } else if (typeof window.getCachedBinanceProvider === 'function') {
                provider = window.getCachedBinanceProvider();
            }
        }
        if (!provider) {
            provider = window.ethereum;
        }
        if (!provider || typeof provider.request !== 'function') {
            safeNotify('No wallet provider available. Please reconnect your wallet.', 'error');
            return;
        }

        // 检查当前链并显示切换提示
        try {
            const currentChainId = await provider.request({ method: 'eth_chainId' });

            if (currentChainId.toLowerCase() !== config.chainId.toLowerCase()) {
                const currentNetworkName = 'Unknown'; // 可以添加映射函数
                
                const alertBox = document.createElement('div');
                alertBox.style.cssText = `
                    position: fixed; top: 20px; right: 20px; background: #10b981; color: white;
                    padding: 20px 30px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                    z-index: 10001; font-size: 16px; font-weight: bold; max-width: 400px;
                    animation: slideIn 0.3s ease;
                `;
                alertBox.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 24px;">🔄</span>
                        <div>
                            <div style="margin-bottom: 5px;">Switching Network</div>
                            <div style="font-size: 13px; font-weight: normal; opacity: 0.9;">
                                From <strong>${currentNetworkName}</strong> to <strong>${config.chainName}</strong>
                            </div>
                        </div>
                    </div>
                `;

                if (!document.getElementById('slideInAnimation')) {
                    const style = document.createElement('style');
                    style.id = 'slideInAnimation';
                    style.textContent = `
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `;
                    document.head.appendChild(style);
                }

                document.body.appendChild(alertBox);
                setTimeout(() => {
                    alertBox.style.animation = 'slideIn 0.3s ease reverse';
                    setTimeout(() => alertBox.remove(), 300);
                }, 2000);

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (e) {
            console.warn('Failed to check current chain:', e);
        }

        // 切换到正确的链
        setLoadingState(true, 'Switching network...');
        await switchToChain(config.chainId);

        // 创建provider和signer（使用上面获取的 provider）
        const web3Provider = new ethers.providers.Web3Provider(provider);
        const signer = web3Provider.getSigner();
        const userAddress = await signer.getAddress();

        // 创建合约实例（先创建，便于估算 gas）
        const contract = new ethers.Contract(
            config.checkInAddress,
            window.CHECKIN_ABI,
            signer
        );

        // 检查余额（用 gas 估算更通用，适配 BSC/opBNB/ETH/Base）
        setLoadingState(true, 'Estimating gas & checking balance...');
        const nativeSymbol = (config.nativeCurrency && config.nativeCurrency.symbol) ? config.nativeCurrency.symbol : 'ETH';
        let requiredWei;
        try {
            const gasEstimate = await contract.estimateGas.checkIn({ value: 0 });
            const gasPrice = await web3Provider.getGasPrice();
            requiredWei = gasEstimate.mul(gasPrice).mul(120).div(100); // 20% buffer
        } catch (e) {
            // fallback：不给你卡死，至少保证有一点 native 资产
            requiredWei = ethers.utils.parseEther(selectedChain === 'ETH' ? '0.0002' : '0.00005');
        }
        const balanceWei = await web3Provider.getBalance(userAddress);
        if (balanceWei.lt(requiredWei)) {
            setLoadingState(false);
            if (typeof closeOnChainCheckInModal === 'function') {
                closeOnChainCheckInModal();
            }
            showInsufficientBalanceModal(
                ethers.utils.formatEther(balanceWei),
                ethers.utils.formatEther(requiredWei),
                nativeSymbol,
                selectedChain
            );
            return;
        }

        // 估算Gas
        try {
            const gasEstimate = await contract.estimateGas.checkIn({ value: 0 });
            console.log('Estimated gas:', gasEstimate.toString());
        } catch (e) {
            console.warn('Gas estimation failed (non-critical):', e.message);
        }

        // 发送交易
        setLoadingState(true, 'Please confirm in your wallet...');
        const tx = await contract.checkIn({
            value: ethers.utils.parseEther('0')
        });

        // 等待确认
        setLoadingState(true, 'Waiting for confirmation...');
        const receipt = await tx.wait();
        console.log('Transaction confirmed:', receipt.transactionHash);

        // 解析事件获取奖励
        let credits = 30; // 默认值
        let streak = 1;
        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed && parsed.name === 'CheckedIn') {
                    credits = Number(parsed.args.credits);
                    streak = Number(parsed.args.streak);
                    console.log('CheckedIn event:', {
                        user: parsed.args.user,
                        dayIndex: parsed.args.dayIndex.toString(),
                        streak: streak,
                        credits: credits
                    });
                    break;
                }
            } catch (e) {
                // Skip logs that don't match
            }
        }

        // 更新Firebase
        await updateFirebaseAfterOnChainCheckIn(credits, receipt.transactionHash, streak);

        // 成功提示
        setLoadingState(false);
        if (typeof closeOnChainCheckInModal === 'function') {
            closeOnChainCheckInModal();
        }
        safeNotify(`Check-in successful! +${credits} credits earned (Streak: ${streak} days)`, 'success');

        // 刷新UI
        if (window.walletManager && window.walletManager.updateUI) {
            window.walletManager.updateUI();
        }

        // 重新加载签到状态
        setTimeout(() => {
            loadUserCheckInStatus();
        }, 2000);

    } catch (error) {
        setLoadingState(false);
        console.error('EVM check-in failed:', error);

        let errorMessage = 'Check-in failed';
        if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
            errorMessage = 'Transaction cancelled by user';
        } else if (error.message && error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient BNB for gas fee';
        } else if (error.message) {
            errorMessage = error.message.length > 100 
                ? error.message.substring(0, 100) + '...' 
                : error.message;
        }

        safeNotify(errorMessage, 'error');
    }
}

/* ======================== Solana 专属函数 ======================== */

/**
 * Solana成功后的UI更新
 */
function applySolanaPostSuccessUI({ reward = 30 } = {}) {
    // 1) 更新按钮
    const btn = document.getElementById('executeCheckInBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Already Checked Today';
        btn.classList?.add?.('opacity-60', 'pointer-events-none');
    }

    // 2) 面板数字自增
    const num = (el) => parseInt((el?.textContent || '0').replace(/\D+/g, '')) || 0;
    const streakEl = document.getElementById('currentStreak');
    const totalEl = document.getElementById('totalCheckIns');

    if (streakEl) streakEl.textContent = `${num(streakEl) + 1} days`;
    if (totalEl) totalEl.textContent = String(num(totalEl) + 1);

    // 3) 同步到 Firebase（使用 increment 原子操作）
    if (window.walletManager) {
        window.walletManager.credits = (window.walletManager.credits || 0) + reward;
    }

    // 异步更新 Firebase（不阻塞UI）
    try {
        updateFirebaseAfterOnChainCheckIn(reward, '', 0).catch(err => 
            console.warn('[Solana] Failed to update Firebase:', err)
        );
    } catch {}

    // 4) 更新总积分显示

    // 6) 标记今日已签
    try {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem('checkin_status_SOLANA', JSON.stringify({ date: today }));
    } catch {}
}

/* ======================== 统一执行入口 ======================== */

/**
 * 统一的链上签到执行函数
 */
async function executeOnChainCheckIn() {
    if (window.__i3_checkin_busy) {
        console.warn('[checkin] duplicate click ignored');
        return;
    }

    setBusy(true);

    try {
        // 1) 钱包连接检查
        if (!window.walletManager || !window.walletManager.isConnected) {
            safeNotify('Please connect your wallet first', 'error');
            return;
        }

        // 2) 钱包类型守卫
        const wt = String(window.walletManager?.walletType || '').toLowerCase();
        const walletKind = wt.includes('solana') ? 'solana' : 'evm';
        
        const sel = document.getElementById('chainSelector');
        const v = String(sel?.value || '').toLowerCase();
        const targetKind = /(solana|^sol\b)/.test(v) ? 'solana' : 'evm';

        if (walletKind !== targetKind) {
            if (walletKind === 'evm' && targetKind === 'solana') {
                safeNotify('You are using an EVM wallet. Please switch to a Solana wallet (e.g., Phantom) to check in on Solana.', 'error');
                try {
                    typeof showWalletSelectionModal === 'function' && showWalletSelectionModal();
                } catch {}
            } else if (walletKind === 'solana' && targetKind === 'evm') {
                safeNotify('You are using a Solana wallet. Please connect an EVM wallet (MetaMask / WalletConnect / Coinbase) for EVM check-in.', 'error');
                try {
                    typeof showWalletSelectionModal === 'function' && showWalletSelectionModal();
                } catch {}
            }
            return;
        }

        // 3) Solana分流
        if (targetKind === 'solana') {
            // 关键：根据 UI 选择同步 Solana cluster
            const vUp = String(sel?.value || '').toUpperCase();
            window.setCurrentChain?.('solana');
            if (vUp.includes('MAINNET')) {
                window.setSolanaCluster?.('mainnet');
            } else {
                // 默认按 devnet
                window.setSolanaCluster?.('devnet');
            }

            try {
                window.openSolanaCheckinModal?.();
            } catch {}

            const ui = {
                onStatus: (m) => console.log('[solana] status:', m),
                onError: (err) => safeNotify(`Solana check-in failed: ${err?.message || err}`, 'error'),
                onSuccess: async ({ txSig, url }) => {
                    safeNotify('Solana check-in successful!', 'success');
                    
                    const a = document.getElementById('txExplorerLink');
                    if (a && url) {
                        a.href = url;
                        a.textContent = 'View on Solana Explorer';
                    }

                    applySolanaPostSuccessUI({ reward: 30 });
                    window.walletManager?.updateUI?.();
                }
            };

            if (typeof window.executeSolanaCheckin === 'function') {
                await window.executeSolanaCheckin(ui);
            } else {
                safeNotify('Solana module not loaded', 'error');
            }
            return;
        }

        // 4) EVM流程
        if (typeof ethers === 'undefined') {
            safeNotify('Ethers not loaded', 'error');
            return;
        }

        await executeEVMCheckIn();

    } catch (err) {
        console.error('executeOnChainCheckIn failed:', err);
        if (!String(err?.message || err).includes('Wallet kind does not match')) {
            safeNotify(err?.message || String(err), 'error');
        }
    } finally {
        setTimeout(() => setBusy(false), 800);
    }
}

/* ======================== 事件绑定 ======================== */

(function bindOnce() {
    if (window.__i3_checkin_listener_bound) return;
    window.__i3_checkin_listener_bound = true;

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('executeCheckInBtn');
        if (btn) {
            // 移除可能存在的内联onclick
            btn.removeAttribute('onclick');
            btn.addEventListener('click', executeOnChainCheckIn);
        }

        const refreshBtn = document.getElementById('refreshStatusBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadUserCheckInStatus);
        }

        const sel = document.getElementById('chainSelector');
        if (sel) {
            sel.addEventListener('change', (e) => {
                const v = (e.target.value || '').toUpperCase();
                // Solana: 额外同步 cluster（devnet/mainnet）
                if (v === 'SOLANA_MAINNET' || v === 'SOLANA MAINNET') {
                    window.setSolanaCluster?.('mainnet');
                    window.setCurrentChain?.('solana');
                } else if (v === 'SOLANA_DEVNET' || v === 'SOLANA DEVNET' || v === 'SOLANA') {
                    window.setSolanaCluster?.('devnet');
                    window.setCurrentChain?.('solana');
                } else if (v === 'OPBNB') {
                    window.setCurrentChain?.('opbnb');
                } else if (v === 'ETH') {
                    window.setCurrentChain?.('eth');
                } else if (v === 'BASE') {
                    window.setCurrentChain?.('base');
                } else {
                    window.setCurrentChain?.('bsc');
                }
                loadUserCheckInStatus();
            });

            // 初始同步
            const v0 = (sel.value || '').toUpperCase();
            if (v0 === 'SOLANA_MAINNET' || v0 === 'SOLANA MAINNET') {
                window.setSolanaCluster?.('mainnet');
                window.setCurrentChain?.('solana');
            } else if (v0 === 'SOLANA_DEVNET' || v0 === 'SOLANA DEVNET' || v0 === 'SOLANA') {
                window.setSolanaCluster?.('devnet');
                window.setCurrentChain?.('solana');
            } else if (v0 === 'OPBNB') {
                window.setCurrentChain?.('opbnb');
            } else if (v0 === 'ETH') {
                window.setCurrentChain?.('eth');
            } else if (v0 === 'BASE') {
                window.setCurrentChain?.('base');
            } else {
                window.setCurrentChain?.('bsc');
            }
        }

        // 初始加载状态
        loadUserCheckInStatus();
    });
})();

/* ======================== 导出到全局 ======================== */

window.executeOnChainCheckIn = executeOnChainCheckIn;
window.loadUserCheckInStatus = loadUserCheckInStatus;
window.updateStatusUI = updateStatusUI;
window.closeInsufficientBalanceModal = closeInsufficientBalanceModal;
window.redirectToSwap = redirectToSwap;
window.redirectToBridge = redirectToBridge;
window.redirectToBinanceDeposit = redirectToBinanceDeposit;
window.applySolanaPostSuccessUI = applySolanaPostSuccessUI;

console.log('✅ On-chain check-in module loaded (EVM + Solana unified)');