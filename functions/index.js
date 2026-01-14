// Firebase Cloud Functions - I3 Credit System Backend API
// Deploy: firebase deploy --only functions

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const ethers = require('ethers');

// 初始化 Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// ============================================================
// 🔒 问题1：后端验证消费 credit（P0）
// ============================================================
/**
 * 验证钱包签名并消费 credit
 * 防止前端修改 credit
 */
exports.validateAndSpendCredits = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查身份认证
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const { 
        walletAddress, 
        amount, 
        reason, 
        signature, 
        message 
      } = data;

      // 2. 验证钱包地址格式
      if (!ethers.utils.isAddress(walletAddress)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid wallet address'
        );
      }

      // 3. 验证数量
      if (typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Amount must be positive number'
        );
      }

      // 4. 验证签名（钱包所有权证明）
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Invalid wallet signature'
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();
      const walletRef = db.collection('wallets').doc(normalizedAddress);

      // 5. 原子操作：检查和扣除
      const result = await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);

        if (!walletDoc.exists) {
          throw new functions.https.HttpsError(
            'not-found',
            'Wallet not found in database'
          );
        }

        const currentCredits = walletDoc.data().credits || 0;

        // 6. 检查余额
        if (currentCredits < amount) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Insufficient credits. Current: ${currentCredits}, Required: ${amount}`
          );
        }

        // 7. 原子操作：同步扣除
        transaction.update(walletRef, {
          credits: admin.firestore.FieldValue.increment(-amount),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          lastSpendReason: reason,
          lastSpendAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 8. 记录到交易历史（审计）
        transaction.set(
          walletRef.collection('transactions').doc(),
          {
            type: 'spend',
            amount: -amount,
            reason: reason,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            walletAddress: normalizedAddress
          }
        );

        return {
          success: true,
          spent: amount,
          newBalance: currentCredits - amount
        };
      });

      return result;
    } catch (error) {
      console.error('validateAndSpendCredits error:', error);
      throw error;
    }
  }
);

// ============================================================
// 🔒 问题4：安全地获取 Admin 邮箱列表（P1）
// ============================================================
/**
 * 从 Firestore 获取 Admin 配置
 * 防止 Admin 邮箱在前端 hardcode
 */
exports.getAdminConfig = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查认证
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      // 2. 从 Firestore 读取 Admin 配置
      const configDoc = await db.collection('admin').doc('config').get();

      if (!configDoc.exists) {
        // 初始化配置
        await db.collection('admin').doc('config').set({
          adminEmails: [
            'admin@intelligencecubed.io',
            'dev@intelligencecubed.io'
          ],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { adminEmails: [] };
      }

      return {
        adminEmails: configDoc.data().adminEmails || []
      };
    } catch (error) {
      console.error('getAdminConfig error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================
// 🔒 问题4：检查用户是否为 Admin（P1）
// ============================================================
/**
 * 安全地检查当前用户是否为 Admin
 * 返回 isAdmin 标志
 */
exports.checkIsAdmin = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查认证
      if (!context.auth) {
        return { isAdmin: false };
      }

      const userEmail = context.auth.token.email;

      // 2. 从 Firestore 读取 Admin 邮箱列表
      const configDoc = await db.collection('admin').doc('config').get();
      const adminEmails = configDoc.data()?.adminEmails || [];

      // 3. 检查当前用户是否在列表中
      const isAdmin = adminEmails.includes(userEmail);

      return { isAdmin, userEmail };
    } catch (error) {
      console.error('checkIsAdmin error:', error);
      return { isAdmin: false };
    }
  }
);

// ============================================================
// Admin 快速签到（Admin 专用）
// ============================================================
/**
 * Admin 用户快速签到（10000 credits）
 * 需要 Admin 身份验证
 */
exports.adminQuickCheckin = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查认证
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      // 2. 检查是否为 Admin
      const userEmail = context.auth.token.email;
      const configDoc = await db.collection('admin').doc('config').get();
      const adminEmails = configDoc.data()?.adminEmails || [];

      if (!adminEmails.includes(userEmail)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only Admin users can use quick check-in'
        );
      }

      const { walletAddress } = data;

      if (!ethers.utils.isAddress(walletAddress)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid wallet address'
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();
      const walletRef = db.collection('wallets').doc(normalizedAddress);
      const ADMIN_REWARD = 10000;

      // 3. 原子操作：检查 24h 限制并更新
      const result = await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        let lastCheckinAt = 0;
        let totalCheckins = 0;

        if (walletDoc.exists) {
          lastCheckinAt = walletDoc.data().lastCheckinAt?.toMillis?.() || 0;
          totalCheckins = walletDoc.data().totalCheckins || 0;
        }

        // 4. 检查 24h 限制
        const DAY_MS = 24 * 60 * 60 * 1000;
        if (lastCheckinAt > 0 && Date.now() - lastCheckinAt < DAY_MS) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Already checked in today'
          );
        }

        // 5. 更新钱包
        transaction.set(
          walletRef,
          {
            credits: admin.firestore.FieldValue.increment(ADMIN_REWARD),
            totalCheckins: totalCheckins + 1,
            currentStreak: totalCheckins + 1,
            lastCheckinAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCheckinType: 'local-admin',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            address: normalizedAddress
          },
          { merge: true }
        );

        // 6. 记录交易历史
        transaction.set(
          walletRef.collection('transactions').doc(),
          {
            type: 'daily_checkin',
            amount: ADMIN_REWARD,
            reason: 'admin-quick-checkin',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            walletAddress: normalizedAddress,
            adminEmail: userEmail
          }
        );

        return {
          success: true,
          reward: ADMIN_REWARD,
          newBalance: (walletDoc.data()?.credits || 0) + ADMIN_REWARD,
          totalCheckins: totalCheckins + 1
        };
      });

      return result;
    } catch (error) {
      console.error('adminQuickCheckin error:', error);
      throw error;
    }
  }
);

// ============================================================
// 🔒 问题6：同步支付历史到 Firebase（P2）
// ============================================================
/**
 * 记录交易到 Firebase（替代 localStorage）
 */
exports.recordTransaction = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查认证
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const {
        walletAddress,
        type,
        amount,
        reason,
        modelId,
        modelName
      } = data;

      if (!ethers.utils.isAddress(walletAddress)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid wallet address'
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();
      const walletRef = db.collection('wallets').doc(normalizedAddress);

      // 2. 写入交易记录
      await walletRef.collection('transactions').add({
        type: type,
        amount: amount,
        reason: reason || 'manual',
        modelId: modelId || null,
        modelName: modelName || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed',
        walletAddress: normalizedAddress,
        userId: context.auth.uid
      });

      return { success: true, message: 'Transaction recorded' };
    } catch (error) {
      console.error('recordTransaction error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================
// 获取用户的交易历史
// ============================================================
/**
 * 获取钱包的所有交易记录
 */
exports.getTransactionHistory = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查认证
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const { walletAddress, limit = 50 } = data;

      if (!ethers.utils.isAddress(walletAddress)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid wallet address'
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();
      const walletRef = db.collection('wallets').doc(normalizedAddress);

      // 2. 查询交易历史
      const snapshot = await walletRef
        .collection('transactions')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toMillis?.() || null
      }));

      return { success: true, transactions };
    } catch (error) {
      console.error('getTransactionHistory error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================
// 获取钱包的完整信息
// ============================================================
/**
 * 获取钱包的所有数据（credits、签到信息等）
 */
exports.getWalletInfo = functions.https.onCall(
  async (data, context) => {
    try {
      // 1. 检查认证
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const { walletAddress } = data;

      if (!ethers.utils.isAddress(walletAddress)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid wallet address'
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();
      const walletRef = db.collection('wallets').doc(normalizedAddress);
      const doc = await walletRef.get();

      if (!doc.exists) {
        return {
          success: true,
          exists: false,
          credits: 0,
          totalCheckins: 0,
          currentStreak: 0
        };
      }

      const data_obj = doc.data();
      return {
        success: true,
        exists: true,
        credits: data_obj.credits || 0,
        totalCheckins: data_obj.totalCheckins || 0,
        currentStreak: data_obj.currentStreak || 0,
        lastCheckinAt: data_obj.lastCheckinAt?.toMillis?.() || null,
        lastCheckinType: data_obj.lastCheckinType || null,
        createdAt: data_obj.createdAt?.toMillis?.() || null
      };
    } catch (error) {
      console.error('getWalletInfo error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
