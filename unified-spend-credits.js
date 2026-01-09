// unified-spend-credits.js
// 统一的 credit 消费接口 - 确保所有 HTML 页面使用一致的逻辑
// 本文件必须在 credit-api-wrapper.js 之后加载

/**
 * 统一的消费 credit 函数
 * 所有需要消费 credit 的页面都应该使用此函数
 * 
 * @param {number} amount - 消费金额
 * @param {string} reason - 消费原因（'model_purchase', 'workflow_tokens_purchase' 等）
 * @param {object} metadata - 额外的元数据（modelId, modelName 等）
 * @returns {Promise<{success: boolean, newBalance: number, error?: string}>}
 */
async function spendCreditsUnified(amount, reason, metadata = {}) {
  try {
    // 1. 检查基本条件
    if (!window.walletManager || !window.walletManager.isConnected) {
      return { 
        success: false, 
        error: 'Please connect your wallet first' 
      };
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return { 
        success: false, 
        error: 'Invalid amount' 
      };
    }

    // 2. 本地快速检查（UX 友好）
    if (window.walletManager.credits < amount) {
      return { 
        success: false, 
        error: `Insufficient credits. You have ${window.walletManager.credits} but need ${amount}` 
      };
    }

    // 3. 直接消费（验证已禁用）
    console.log(`[Spend Credits] Attempting to spend ${amount} credits for ${reason}`);
    
    // ⚠️ 注释掉：后端验证
    // const result = await window.walletManager.safeSpendCreditsWithSignature(amount, reason);
    
    // ✅ 简化：直接扣除
    const result = await window.walletManager.safeSpendCreditsWithSignature(
      amount,
      reason
    );

    if (result.success) {
      // 4. 记录额外元数据
      if (metadata.modelId || metadata.modelName) {
        await window.creditAPI.recordTransactionToFirebase(
          window.walletManager.walletAddress,
          {
            type: 'spend',
            amount: -amount,
            reason: reason,
            modelId: metadata.modelId || null,
            modelName: metadata.modelName || null
          }
        ).catch(err => console.warn('[Spend Credits] Failed to record metadata:', err));
      }

      // 5. 显示成功提示
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          `✅ Successfully spent ${amount} I3 tokens. New balance: ${result.newBalance}`,
          'success'
        );
      }

      return {
        success: true,
        newBalance: result.newBalance,
        spent: amount
      };
    } else {
      // 后端返回错误
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          `❌ Failed to spend credits: ${result.error || 'Unknown error'}`,
          'error'
        );
      }

      return {
        success: false,
        error: result.error || 'Backend validation failed'
      };
    }
  } catch (error) {
    console.error('[Spend Credits] Error:', error);
    
    if (typeof window.showNotification === 'function') {
      window.showNotification(
        `❌ Error: ${error.message}`,
        'error'
      );
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 购买模型的统一函数（mycart.html 使用）
 */
async function purchaseModels(models, totalCost) {
  return spendCreditsUnified(
    totalCost,
    'model_purchase',
    {
      modelCount: models.length,
      modelIds: models.map(m => m.id)
    }
  );
}

/**
 * 购买 Workflow tokens 的统一函数（workflow.html 使用）
 */
async function purchaseWorkflowTokens(workflowId, tokenCost) {
  return spendCreditsUnified(
    tokenCost,
    'workflow_tokens_purchase',
    {
      workflowId: workflowId,
      tokenCost: tokenCost
    }
  );
}

// ============================================================
// 导出到全局
// ============================================================
if (typeof window !== 'undefined') {
  window.spendCreditsUnified = spendCreditsUnified;
  window.purchaseModels = purchaseModels;
  window.purchaseWorkflowTokens = purchaseWorkflowTokens;
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    spendCreditsUnified,
    purchaseModels,
    purchaseWorkflowTokens
  };
}
