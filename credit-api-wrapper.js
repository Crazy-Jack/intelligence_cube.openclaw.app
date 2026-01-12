// credit-api-wrapper.js
// 前端与后端 Cloud Functions 通信的统一接口
// 确保所有 credit 操作都通过此接口

/**
 * 初始化 Cloud Functions 参考
 */
let functionsRef = null;

function initializeCloudFunctions() {
  if (typeof firebase !== 'undefined' && firebase.functions) {
    functionsRef = firebase.functions();
    // 如果在本地开发，指向本地模拟器
    if (window.location.hostname === 'localhost') {
      functionsRef.useEmulator('localhost', 5001);
    }
  }
}

// 监听 Firebase 初始化事件
if (typeof window !== 'undefined') {
  window.addEventListener('firebaseReady', initializeCloudFunctions);
  // 如果已经初始化
  setTimeout(initializeCloudFunctions, 1000);
}

// ============================================================
// 🔒 API 1：验证和消费 Credit（P0）
// ============================================================
/**
 * 安全地消费 credit（通过后端验证）
 * @param {string} walletAddress - 钱包地址
 * @param {number} amount - 消费金额
 * @param {string} reason - 消费原因
 * @param {string} signature - 钱包签名
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
async function safeSpendCredits(walletAddress, amount, reason, signature) {
  try {
    if (!functionsRef) {
      throw new Error('Cloud Functions not initialized');
    }

    // 生成签名的消息
    const message = `Spend ${amount} credits for ${reason}`;

    const validateAndSpendCredits = functionsRef.httpsCallable(
      'validateAndSpendCredits'
    );

    const result = await validateAndSpendCredits({
      walletAddress: walletAddress,
      amount: amount,
      reason: reason,
      signature: signature,
      message: message
    });

    return result.data;
  } catch (error) {
    console.error('[Credit API] safeSpendCredits error:', error);
    throw error;
  }
}

// ============================================================
// 🔒 API 2：获取 Admin 配置（P1）
// ============================================================
/**
 * 从后端获取 Admin 邮箱列表
 * @returns {Promise<{adminEmails: string[]}>}
 */
async function getAdminConfig() {
  try {
    if (!functionsRef) {
      throw new Error('Cloud Functions not initialized');
    }

    const getAdminConfig = functionsRef.httpsCallable('getAdminConfig');
    const result = await getAdminConfig({});

    return result.data;
  } catch (error) {
    console.error('[Credit API] getAdminConfig error:', error);
    return { adminEmails: [] };
  }
}

// ============================================================
// 🔒 API 3：检查是否为 Admin（P1）
// ============================================================
/**
 * 安全地检查当前用户是否为 Admin
 * @returns {Promise<{isAdmin: boolean, userEmail: string}>}
 */
async function checkIsAdmin() {
  try {
    if (!functionsRef) {
      return { isAdmin: false };
    }

    const checkIsAdmin = functionsRef.httpsCallable('checkIsAdmin');
    const result = await checkIsAdmin({});

    return result.data;
  } catch (error) {
    console.error('[Credit API] checkIsAdmin error:', error);
    return { isAdmin: false };
  }
}

// ============================================================
// 🔒 API 4：Admin 快速签到（P1）
// ============================================================
/**
 * Admin 用户快速签到（10000 credits）
 * @param {string} walletAddress - 钱包地址
 * @returns {Promise<{success: boolean, reward: number, newBalance: number}>}
 */
async function adminQuickCheckin(walletAddress) {
  try {
    if (!functionsRef) {
      throw new Error('Cloud Functions not initialized');
    }

    const adminQuickCheckin = functionsRef.httpsCallable(
      'adminQuickCheckin'
    );

    const result = await adminQuickCheckin({
      walletAddress: walletAddress
    });

    return result.data;
  } catch (error) {
    console.error('[Credit API] adminQuickCheckin error:', error);
    throw error;
  }
}

// ============================================================
// 🔒 API 5：记录交易到 Firebase（P2）
// ============================================================
/**
 * 记录交易到 Firebase（用于审计和跨设备同步）
 * @param {string} walletAddress - 钱包地址
 * @param {object} transactionData - 交易数据
 * @returns {Promise<{success: boolean}>}
 */
async function recordTransactionToFirebase(walletAddress, transactionData) {
  try {
    if (!functionsRef) {
      console.warn('[Credit API] Cloud Functions not available, skipping Firebase sync');
      return { success: false };
    }

    const recordTransaction = functionsRef.httpsCallable('recordTransaction');

    const result = await recordTransaction({
      walletAddress: walletAddress,
      ...transactionData
    });

    return result.data;
  } catch (error) {
    console.error('[Credit API] recordTransaction error:', error);
    return { success: false };
  }
}

// ============================================================
// 🔒 API 6：获取交易历史（P2）
// ============================================================
/**
 * 从 Firebase 获取钱包的交易历史
 * @param {string} walletAddress - 钱包地址
 * @param {number} limit - 返回的最大条数
 * @returns {Promise<{transactions: array}>}
 */
async function getTransactionHistory(walletAddress, limit = 50) {
  try {
    if (!functionsRef) {
      throw new Error('Cloud Functions not initialized');
    }

    const getTransactionHistory = functionsRef.httpsCallable(
      'getTransactionHistory'
    );

    const result = await getTransactionHistory({
      walletAddress: walletAddress,
      limit: limit
    });

    return result.data;
  } catch (error) {
    console.error('[Credit API] getTransactionHistory error:', error);
    return { success: false, transactions: [] };
  }
}

// ============================================================
// 🔒 API 7：获取钱包信息（P3）
// ============================================================
/**
 * 获取钱包的完整信息（credits、签到数据等）
 * @param {string} walletAddress - 钱包地址
 * @returns {Promise<{credits: number, totalCheckins: number}>}
 */
async function getWalletInfo(walletAddress) {
  try {
    if (!functionsRef) {
      throw new Error('Cloud Functions not initialized');
    }

    const getWalletInfo = functionsRef.httpsCallable('getWalletInfo');

    const result = await getWalletInfo({
      walletAddress: walletAddress
    });

    return result.data;
  } catch (error) {
    console.error('[Credit API] getWalletInfo error:', error);
    return { success: false, credits: 0 };
  }
}

// ============================================================
// 导出所有 API
// ============================================================
if (typeof window !== 'undefined') {
  window.creditAPI = {
    initializeCloudFunctions,
    safeSpendCredits,
    getAdminConfig,
    checkIsAdmin,
    adminQuickCheckin,
    recordTransactionToFirebase,
    getTransactionHistory,
    getWalletInfo
  };
}

// 如果在 Node.js 环境（例如测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    safeSpendCredits,
    getAdminConfig,
    checkIsAdmin,
    adminQuickCheckin,
    recordTransactionToFirebase,
    getTransactionHistory,
    getWalletInfo
  };
}
