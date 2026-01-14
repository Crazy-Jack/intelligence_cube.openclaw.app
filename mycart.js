// 🛒 MyCart页面 - 购物车功能 (修复版 - 添加真正的支付验证)
console.log('🛒 加载 MyCart 页面...');

// 购物车数据存储
let cartItems = JSON.parse(localStorage.getItem('cartItems')) || [];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 MyCart页面初始化');
    updateCartDisplay();
    updateCartSummary();
});

// 检查用户是否已连接钱包
function checkWalletConnection() {
    if (!window.walletManager) {
        return { connected: false, error: 'Wallet manager not loaded' };
    }
    
    const userInfo = window.walletManager.getUserInfo();
    return {
        connected: userInfo.isConnected,
        address: userInfo.address,
        tokens: userInfo.credits, // 这里是I3 tokens余额
        error: userInfo.isConnected ? null : 'Please connect your wallet first'
    };
}

// 验证用户是否有足够的I3 tokens
function validatePayment(totalCost) {
    const walletStatus = checkWalletConnection();
    
    if (!walletStatus.connected) {
        return {
            valid: false,
            error: walletStatus.error,
            required: totalCost,
            available: 0
        };
    }
    
    if (walletStatus.tokens < totalCost) {
        return {
            valid: false,
            error: `Insufficient I3 tokens. You need ${totalCost} I3 tokens but only have ${walletStatus.tokens} I3 tokens.`,
            required: totalCost,
            available: walletStatus.tokens
        };
    }
    
    return {
        valid: true,
        available: walletStatus.tokens,
        required: totalCost
    };
}

// 更新购物车显示
function updateCartDisplay() {
    const emptyCart = document.getElementById('emptyCart');
    const cartItems = document.getElementById('cartItems');
    const clearCartBtn = document.getElementById('clearCartBtn');
    
    if (getCartItems().length === 0) {
        emptyCart.style.display = 'block';
        cartItems.style.display = 'none';
        clearCartBtn.style.display = 'none';
    } else {
        emptyCart.style.display = 'none';
        cartItems.style.display = 'block';
        clearCartBtn.style.display = 'flex';
        populateCartTable();
    }
}

// 获取购物车商品
function getCartItems() {
    return JSON.parse(localStorage.getItem('cartItems')) || [];
}

// 保存购物车商品
function saveCartItems(items) {
    localStorage.setItem('cartItems', JSON.stringify(items));
}

// 添加商品到购物车
function addToCartStorage(modelName, tokenQuantity = 1, shareQuantity = 0) {
    const modelData = getModelData(modelName);
    if (!modelData) {
        console.error('⚠ 模型数据未找到:', modelName);
        return false;
    }

    let cartItems = getCartItems();
    const existingItem = cartItems.find(item => item.modelName === modelName);

    if (existingItem) {
        existingItem.tokenQuantity = (existingItem.tokenQuantity || 0) + tokenQuantity;
        existingItem.shareQuantity = (existingItem.shareQuantity || 0) + shareQuantity;
    } else {
        cartItems.push({
            modelName: modelName,
            tokenQuantity: tokenQuantity,
            shareQuantity: shareQuantity,
            addedAt: new Date().toISOString()
        });
    }

    saveCartItems(cartItems);
    console.log('✅ 商品已添加到购物车:', modelName, 'Tokens:', tokenQuantity, 'Shares:', shareQuantity);
    return true;
}

// 填充购物车表格（根据设备类型）
function populateCartTable() {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        renderMobileCart();
    } else {
        renderDesktopCart();
    }
    
    updateCartSummary();
}

// 渲染桌面端购物车表格
function renderDesktopCart() {
    const tableBody = document.getElementById('cartTableBody');
    const cartItems = getCartItems();

    if (!tableBody) {
        console.error('⚠ 未找到购物车表格');
        return;
    }

    tableBody.innerHTML = '';

    cartItems.forEach((item, index) => {
        const modelData = getModelData(item.modelName);
        if (!modelData) {
            console.warn('⚠️ 模型数据未找到:', item.modelName);
            return;
        }

        const modelName = item.modelName;
        const tokenQuantity = item.tokenQuantity || 0;
        const shareQuantity = item.shareQuantity || 0;
        
        const tokenSubtotal = (modelData.tokenPrice * tokenQuantity).toFixed(2);
        const shareSubtotal = (modelData.sharePrice * shareQuantity).toFixed(2);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="model-info">
                    <div class="model-name">${modelName}</div>
                    <div class="model-details">Total Score: ${modelData.totalScore}% | Compatibility: ${modelData.compatibility}</div>
                </div>
            </td>
            <td>
                <div class="cart-category">${modelData.category}</div>
            </td>
            <td class="price-display">
                <div class="purchase-option">
                    <div class="price-info">${modelData.tokenPrice}/K<img src="svg/i3-token-logo.svg" class="token-logo" alt="i3"></div>
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="updateTokenQuantity(${index}, ${tokenQuantity - 1})" ${tokenQuantity <= 0 ? 'disabled' : ''}>−</button>
                        <input type="number" class="quantity-input" value="${tokenQuantity}" min="0" max="999" 
                               onchange="updateTokenQuantity(${index}, parseInt(this.value))" 
                               onkeypress="if(event.key==='Enter') updateTokenQuantity(${index}, parseInt(this.value))">
                        <button class="quantity-btn" onclick="updateTokenQuantity(${index}, ${tokenQuantity + 1})" ${tokenQuantity >= 999 ? 'disabled' : ''}>+</button>
                    </div>
                    <div class="subtotal-small">Subtotal: ${tokenSubtotal}<img src="svg/i3-token-logo.svg" class="token-logo" alt="i3"></div>
                </div>
            </td>
            <td class="price-display">
                <div class="purchase-option">
                    <div class="price-info">${modelData.sharePrice}K<img src="svg/i3-token-logo.svg" class="token-logo" alt="i3"></div>
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="updateShareQuantity(${index}, ${shareQuantity - 1})" ${shareQuantity <= 0 ? 'disabled' : ''}>−</button>
                        <input type="number" class="quantity-input" value="${shareQuantity}" min="0" max="999" 
                               onchange="updateShareQuantity(${index}, parseInt(this.value))" 
                               onkeypress="if(event.key==='Enter') updateShareQuantity(${index}, parseInt(this.value))">
                        <button class="quantity-btn" onclick="updateShareQuantity(${index}, ${shareQuantity + 1})" ${shareQuantity >= 999 ? 'disabled' : ''}>+</button>
                    </div>
                    <div class="subtotal-small">Subtotal: ${shareSubtotal}K<img src="svg/i3-token-logo.svg" class="token-logo" alt="i3"></div>
                </div>
            </td>
            <td class="total-subtotal">
                <div class="total-amount">${(parseFloat(tokenSubtotal) + parseFloat(shareSubtotal) * 1000).toFixed(2)}<img src="svg/i3-token-logo.svg" class="token-logo" alt="i3"></div>
            </td>
            <td>
                <button class="remove-btn" onclick="removeFromCart(${index})">Remove</button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

// 渲染移动端购物车卡片
function renderMobileCart() {
    const cartItems = getCartItems();
    let mobileContainer = document.querySelector('.mobile-cart-items');
    
    if (!mobileContainer) {
        mobileContainer = document.createElement('div');
        mobileContainer.className = 'mobile-cart-items';
        const cartItemsSection = document.getElementById('cartItems');
        if (cartItemsSection) {
            const tableContainer = cartItemsSection.querySelector('.cart-table-container');
            if (tableContainer) {
                tableContainer.parentNode.insertBefore(mobileContainer, tableContainer.nextSibling);
            } else {
                cartItemsSection.appendChild(mobileContainer);
            }
        }
    }
    
    mobileContainer.innerHTML = '';
    
    cartItems.forEach((item, index) => {
        const modelData = getModelData(item.modelName);
        if (!modelData) {
            console.warn('⚠️ 模型数据未找到:', item.modelName);
            return;
        }
        
        const tokenQuantity = item.tokenQuantity || 0;
        const shareQuantity = item.shareQuantity || 0;
        const tokenSubtotal = (modelData.tokenPrice * tokenQuantity).toFixed(2);
        const shareSubtotal = (modelData.sharePrice * shareQuantity).toFixed(2);
        const totalSubtotal = (parseFloat(tokenSubtotal) + parseFloat(shareSubtotal) * 1000).toFixed(2);
        
        // 获取用户余额（用于显示SHARES INVESTMENT的可用余额）
        let availableBalance = '0';
        try {
            if (window.walletManager && window.walletManager.getUserInfo) {
                const userInfo = window.walletManager.getUserInfo();
                if (userInfo && userInfo.credits) {
                    availableBalance = (userInfo.credits / 1000).toFixed(1) + 'K';
                }
            }
        } catch (e) {
            console.warn('无法获取用户余额:', e);
        }
        
        const card = document.createElement('div');
        card.className = 'mobile-cart-item';
        card.innerHTML = `
            <div class="mobile-item-header">
                <div class="model-name">${item.modelName}</div>
                <div class="model-details">Total Score: ${modelData.totalScore}% | Compatibility: ${modelData.compatibility}</div>
                <div class="cart-category">${modelData.category}</div>
            </div>
            
            <div class="mobile-purchase-section">
                <div class="mobile-purchase-type">TOKEN PURCHASE</div>
                <div class="mobile-price-row">
                    <div class="mobile-price-info">
                        ${modelData.tokenPrice}/K
                        <img src="svg/i3-token-logo.svg" class="token-logo" alt="i3">
                    </div>
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="updateTokenQuantity(${index}, ${tokenQuantity - 1})" ${tokenQuantity <= 0 ? 'disabled' : ''}>−</button>
                        <input type="number" class="quantity-input" value="${tokenQuantity}" min="0" max="999" 
                               onchange="updateTokenQuantity(${index}, parseInt(this.value))">
                        <button class="quantity-btn" onclick="updateTokenQuantity(${index}, ${tokenQuantity + 1})" ${tokenQuantity >= 999 ? 'disabled' : ''}>+</button>
                    </div>
                </div>
                <div class="mobile-subtotal-info">
                    Subtotal: ${tokenSubtotal}
                    <img src="svg/i3-token-logo.svg" class="token-logo" alt="i3" style="width: 12px; height: 12px;">
                </div>
            </div>
            
            <div class="mobile-purchase-section">
                <div class="mobile-purchase-type">SHARES INVESTMENT</div>
                <div class="mobile-price-row">
                    <div class="mobile-price-info" style="color: #10b981;">
                        ${availableBalance}
                        <img src="svg/i3-token-logo.svg" class="token-logo" alt="i3">
                    </div>
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="updateShareQuantity(${index}, ${shareQuantity - 1})" ${shareQuantity <= 0 ? 'disabled' : ''}>−</button>
                        <input type="number" class="quantity-input" value="${shareQuantity}" min="0" max="999" 
                               onchange="updateShareQuantity(${index}, parseInt(this.value))">
                        <button class="quantity-btn" onclick="updateShareQuantity(${index}, ${shareQuantity + 1})" ${shareQuantity >= 999 ? 'disabled' : ''}>+</button>
                    </div>
                </div>
                <div class="mobile-subtotal-info">
                    Subtotal: ${shareSubtotal}K
                    <img src="svg/i3-token-logo.svg" class="token-logo" alt="i3" style="width: 12px; height: 12px;">
                </div>
            </div>
            
            <div class="mobile-item-total">
                <span class="mobile-total-label">Item Total:</span>
                <span class="mobile-total-value">
                    ${totalSubtotal}
                    <img src="svg/i3-token-logo.svg" class="token-logo" alt="i3">
                </span>
            </div>
            
            <button class="mobile-remove-btn" onclick="removeFromCart(${index})">
                Remove from Cart
            </button>
        `;
        
        mobileContainer.appendChild(card);
    });
}

// 更新Token数量
function updateTokenQuantity(index, newQuantity) {
    if (newQuantity < 0 || newQuantity > 999) {
        alert('Token quantity must be between 0 and 999');
        return;
    }

    let cartItems = getCartItems();
    if (cartItems[index]) {
        cartItems[index].tokenQuantity = newQuantity;
        
        if (newQuantity === 0 && (cartItems[index].shareQuantity || 0) === 0) {
            cartItems.splice(index, 1);
        }
        
        saveCartItems(cartItems);
        updateCartDisplay();
        console.log('✅ Token数量已更新:', cartItems[index]?.modelName, '新数量:', newQuantity);
    }
}

// 更新Share数量
function updateShareQuantity(index, newQuantity) {
    if (newQuantity < 0 || newQuantity > 999) {
        alert('Share quantity must be between 0 and 999');
        return;
    }

    let cartItems = getCartItems();
    if (cartItems[index]) {
        cartItems[index].shareQuantity = newQuantity;
        
        if (newQuantity === 0 && (cartItems[index].tokenQuantity || 0) === 0) {
            cartItems.splice(index, 1);
        }
        
        saveCartItems(cartItems);
        updateCartDisplay();
        console.log('✅ Share数量已更新:', cartItems[index]?.modelName, '新数量:', newQuantity);
    }
}

// 从购物车移除商品
function removeFromCart(index) {
    let cartItems = getCartItems();
    const item = cartItems[index];
    
    if (confirm(`Remove "${item.modelName}" from your cart?`)) {
        cartItems.splice(index, 1);
        saveCartItems(cartItems);
        updateCartDisplay();
        console.log('✅ 商品已从购物车移除:', item.modelName);
    }
}

// 清空购物车
function clearCart() {
    if (confirm('Are you sure you want to clear your entire cart?')) {
        localStorage.removeItem('cartItems');
        updateCartDisplay();
        console.log('✅ 购物车已清空');
    }
}

// 更新购物车摘要
function updateCartSummary() {
    const cartItems = getCartItems();
    const cartCount = document.getElementById('cartCount');

    if (cartCount) {
        cartCount.textContent = `${cartItems.length} item${cartItems.length !== 1 ? 's' : ''}`;
    }
}

// 显示结账弹窗 - 先显示订单摘要，不进行验证
function showCheckoutModal() {
    const cartItems = getCartItems();
    if (cartItems.length === 0) {
        alert('Your cart is empty!');
        return;
    }

    // 计算总计和数量
    let tokenPriceTotal = 0;
    let sharePriceTotal = 0;
    let totalTokenQuantity = 0;
    let totalShareQuantity = 0;
    let modelCount = cartItems.length;
    let orderItemsHtml = '';

    cartItems.forEach(item => {
        const modelData = getModelData(item.modelName);
        if (modelData) {
            const tokenQuantity = item.tokenQuantity || 0;
            const shareQuantity = item.shareQuantity || 0;
            
            totalTokenQuantity += tokenQuantity;
            totalShareQuantity += shareQuantity;
            
            const tokenSubtotal = modelData.tokenPrice * tokenQuantity;
            const shareSubtotal = modelData.sharePrice * shareQuantity;
            tokenPriceTotal += tokenSubtotal;
            sharePriceTotal += shareSubtotal;
            
            if (tokenQuantity > 0 || shareQuantity > 0) {
                orderItemsHtml += `
                    <div class="order-item">
                        <div class="order-item-name">${item.modelName}</div>
                        <div class="order-item-details">
                            ${tokenQuantity > 0 ? `${tokenQuantity}K tokens` : ''}
                            ${tokenQuantity > 0 && shareQuantity > 0 ? ' + ' : ''}
                            ${shareQuantity > 0 ? `${shareQuantity} shares` : ''}
                        </div>
                    </div>
                `;
            }
        }
    });

    const grandTotal = tokenPriceTotal + (sharePriceTotal * 1000);

    // 更新弹窗内容
    document.getElementById('modalModels').textContent = modelCount;
    document.getElementById('modalTokens').textContent = totalTokenQuantity + 'K Tokens';
    document.getElementById('modalShares').textContent = totalShareQuantity;
    document.getElementById('modalTotal').innerHTML = `${grandTotal.toFixed(2)} <img src="svg/i3-token-logo.svg" class="token-logo" alt="i3">`;
    document.getElementById('modalOrderItems').innerHTML = orderItemsHtml;

    // 显示弹窗
    document.getElementById('checkoutModal').style.display = 'flex';
}

// 关闭结账弹窗
function closeCheckoutModal() {
    document.getElementById('checkoutModal').style.display = 'none';
    
    // 清除余额信息（如果有的话）
    const modalBody = document.querySelector('.modal-body');
    const balanceInfo = modalBody.querySelector('div[style*="Your I3 Token Balance"]');
    if (balanceInfo) {
        balanceInfo.remove();
    }
}

// 保存购物车购买到 My Assets，并写一条交易记录
function savePurchaseToAssets(cartItems, orderSummary) {
    try {
        console.log('💾 Saving purchase to My Assets...', { cartItems, orderSummary });

        // 1. 读出已有 myAssets，兼容旧结构
        let stored = null;
        try {
            const raw = localStorage.getItem('myAssets');
            stored = raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('⚠️ Failed to parse existing myAssets, resetting:', e);
        }

        let myAssets = stored || { tokens: [], shares: [], history: [] };

        // 确保这三个字段一定是数组，避免 .push / .length 报错
        if (!Array.isArray(myAssets.tokens)) myAssets.tokens = [];
        if (!Array.isArray(myAssets.shares)) myAssets.shares = [];
        if (!Array.isArray(myAssets.history)) myAssets.history = [];

        // 2. 更新 tokens / shares 持仓
        cartItems.forEach(item => {
            const modelData = getModelData(item.modelName);
            if (!modelData) {
                console.warn('⚠️ Model data not found for item:', item);
                return;
            }
            
            const tokensToAdd = item.tokenQuantity || 0;
            const sharesToAdd = item.shareQuantity || 0;

            if (tokensToAdd > 0) {
                const existingTokenIndex = myAssets.tokens.findIndex(t => t.modelName === item.modelName);
                if (existingTokenIndex >= 0) {
                    myAssets.tokens[existingTokenIndex].quantity += tokensToAdd;
                    myAssets.tokens[existingTokenIndex].lastPurchase = new Date().toISOString();
                } else {
                    myAssets.tokens.push({
                        modelName: item.modelName,
                        quantity: tokensToAdd,
                        category: modelData.category,
                        industry: modelData.industry,
                        tokenPrice: modelData.tokenPrice,
                        sharePrice: modelData.sharePrice,
                        change: modelData.change,
                        rating: modelData.rating,
                        usage: modelData.usage,
                        compatibility: modelData.compatibility,
                        totalScore: modelData.totalScore,
                        purchaseDate: new Date().toISOString(),
                        lastPurchase: new Date().toISOString()
                    });
                }
            }

            if (sharesToAdd > 0) {
                const existingShareIndex = myAssets.shares.findIndex(s => s.modelName === item.modelName);
                if (existingShareIndex >= 0) {
                    myAssets.shares[existingShareIndex].quantity += sharesToAdd;
                    myAssets.shares[existingShareIndex].lastPurchase = new Date().toISOString();
                } else {
                    myAssets.shares.push({
                        modelName: item.modelName,
                        quantity: sharesToAdd,
                        category: modelData.category,
                        industry: modelData.industry,
                        tokenPrice: modelData.tokenPrice,
                        sharePrice: modelData.sharePrice,
                        change: modelData.change,
                        rating: modelData.rating,
                        usage: modelData.usage,
                        compatibility: modelData.compatibility,
                        totalScore: modelData.totalScore,
                        purchaseDate: new Date().toISOString(),
                        lastPurchase: new Date().toISOString()
                    });
                }
            }
        });

        // 3. 写入一条订单级别的 history 记录（Payment History 后面会用）
        const now = new Date();
        const orderId = 'order_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 8);
        
        myAssets.history.push({
            id: orderId,
            type: 'buy_tokens',                   // 先统一当作 buy_tokens，后面如果要拆 share 再细化
            timestamp: now.getTime(),
            modelName: orderSummary.models === 1 && cartItems[0]
                ? cartItems[0].modelName
                : 'Multiple models',
            quantity: orderSummary.totalTokens || 0,     // 这里用 K tokens 数量
            creditsSpent: -orderSummary.totalAmount,     // 负号 = 花掉的 i3 credits
            status: 'completed',
            meta: {
                from: 'mycart',
                models: orderSummary.models,
                totalTokens: orderSummary.totalTokens,
                totalShares: orderSummary.totalShares,
                totalAmount: orderSummary.totalAmount
            }
        });
        
        localStorage.setItem('myAssets', JSON.stringify(myAssets));
        console.log('✅ Purchase saved to My Assets:', myAssets);
    } catch (error) {
        console.error('❌ Error saving purchase to My Assets:', error);
        throw error;
    }
}
// 下单功能 - 在这里进行所有验证
// ✅ 更新（P0）：使用后端验证的 spendCreditsUnified
async function placeOrder() {
    const cartItems = getCartItems();
    
    // 1. 首先检查钱包连接状态
    const walletStatus = checkWalletConnection();
    if (!walletStatus.connected) {
        alert('⚠️ Please connect your MetaMask wallet first to proceed with payment.\n\nClick "Login" → "Connect Wallet"');
        return;
    }
    
    // 2. 计算总计和数量
    let tokenPriceTotal = 0;
    let sharePriceTotal = 0;
    let totalTokenQuantity = 0;
    let totalShareQuantity = 0;
    
    cartItems.forEach(item => {
        const modelData = getModelData(item.modelName);
        if (modelData) {
            const tokenQuantity = item.tokenQuantity || 0;
            const shareQuantity = item.shareQuantity || 0;
            
            totalTokenQuantity += tokenQuantity;
            totalShareQuantity += shareQuantity;
            
            tokenPriceTotal += modelData.tokenPrice * tokenQuantity;
            sharePriceTotal += modelData.sharePrice * shareQuantity;
        }
    });

    const grandTotal = tokenPriceTotal + (sharePriceTotal * 1000);
    
    // 3. 验证支付能力
    const paymentValidation = validatePayment(grandTotal);
    if (!paymentValidation.valid) {
        alert(`❌ Payment Failed!\n\n${paymentValidation.error}\n\n💡 Tip: Get more I3 tokens by doing daily check-ins (+30 I3 tokens per day)!\n\nTransaction cancelled.`);
        return;
    }
    
    // 4. ✅ 使用后端验证的消费函数（P0）
    const spendResult = await window.spendCreditsUnified(
        grandTotal,
        'model_purchase',
        {
            modelCount: cartItems.length,
            modelIds: cartItems.map(item => item.modelName)
        }
    );

    if (!spendResult.success) {
        alert(`❌ Payment Processing Failed!\n\n${spendResult.error}\n\nTransaction cancelled.`);
        return;
    }
    
    // 5. 保存购买记录到My Assets
    savePurchaseToAssets(cartItems, {
        models: cartItems.length,
        totalTokens: totalTokenQuantity,
        totalShares: totalShareQuantity,
        totalAmount: grandTotal
    });
    
    // 5.1. 逐个条目写入 Payment History 交易记录
    if (window.apiManager && typeof window.apiManager.recordTransaction === 'function') {
        const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        cartItems.forEach(item => {
            const modelData = getModelData(item.modelName);
            if (!modelData) return;

            // 1）买 tokens
            if (item.tokenQuantity && item.tokenQuantity > 0 && modelData.tokenPrice) {
                const tokenCost = Number((item.tokenQuantity * modelData.tokenPrice).toFixed(3));
                window.apiManager.recordTransaction({
                    type: 'buy_tokens',
                    modelName: item.modelName,
                    quantity: item.tokenQuantity,
                    creditsSpent: -tokenCost,
                    timestamp: Date.now(),
                    status: 'completed',
                    source: 'mycart',
                    orderId: orderId
                }).catch(err => {
                    console.warn('[PaymentHistory] Failed to record buy_tokens tx:', err);
                });
            }

            // 2）买 shares
            if (item.shareQuantity && item.shareQuantity > 0 && modelData.sharePrice) {
                const shareCost = Number((item.shareQuantity * modelData.sharePrice).toFixed(3));
                window.apiManager.recordTransaction({
                    type: 'buy_shares',
                    modelName: item.modelName,
                    quantity: item.shareQuantity,
                    creditsSpent: -shareCost,
                    timestamp: Date.now(),
                    status: 'completed',
                    source: 'mycart',
                    orderId: orderId
                }).catch(err => {
                    console.warn('[PaymentHistory] Failed to record buy_shares tx:', err);
                });
            }
        });
    }
    
    // 6. 显示成功消息
    alert(`🎉 Order Placed Successfully!\n\n💳 Payment: ${grandTotal.toFixed(2)} I3 tokens\n📊 Models: ${cartItems.length}\n🎯 Tokens: ${totalTokenQuantity}K\n📈 Shares: ${totalShareQuantity}\n\n💰 Remaining Balance: ${spendResult.newBalance} I3 tokens\n\n✅ Your models have been added to your account.\nThank you for your purchase!`);
    
    // 7. 清空购物车
    localStorage.removeItem('cartItems');
    updateCartDisplay();
    
    // 8. 关闭弹窗
    closeCheckoutModal();
    
    // 9. 跳转到My Assets页面
    setTimeout(() => {
        console.log('📄 Redirecting to My Assets...');
        window.location.href = 'myassets.html';
    }, 1000);
}

// 点击弹窗外部关闭弹窗
document.addEventListener('click', function(event) {
    const modal = document.getElementById('checkoutModal');
    if (event.target === modal) {
        closeCheckoutModal();
    }
});

// ESC键关闭弹窗
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeCheckoutModal();
    }
});

// 从URL参数获取要添加的模型（用于从其他页面跳转）
function handleURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const addModel = urlParams.get('add');
    
    if (addModel) {
        const success = addToCartStorage(addModel, 1, 0);
        if (success) {
            updateCartDisplay();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// 页面加载时处理URL参数
document.addEventListener('DOMContentLoaded', function() {
    handleURLParams();
});

// 监听窗口大小变化，切换布局
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        const cartItems = getCartItems();
        if (cartItems.length > 0) {
            populateCartTable();
        }
    }, 250);
});

// 导出函数供其他页面使用
window.addToCartFromOtherPage = addToCartStorage;
window.getCartItemCount = function() {
    return getCartItems().reduce((total, item) => total + item.quantity, 0);
};