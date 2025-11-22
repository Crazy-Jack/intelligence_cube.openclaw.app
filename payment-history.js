// Payment History Page JavaScript
console.log('💳 Loading Payment History page...');

// ========== GLOBAL STATE ==========
let allTransactions = [];
let filteredTransactions = [];
let currentPage = 1;
const itemsPerPage = 20;

// ========== DATA FUNCTIONS ==========

// Get transaction history from localStorage and Firestore
async function getTransactionHistory() {
    try {
        // Get from localStorage first
        const localHistory = getLocalTransactions();
        console.log('📦 Local transactions:', localHistory.length);
        
        // Try to get from Firestore if connected
        if (window.firebaseDb && window.walletManager && window.walletManager.isConnected) {
            try {
                const firestoreHistory = await getFirestoreTransactions();
                console.log('☁️ Firestore transactions:', firestoreHistory.length);
                
                // Merge and deduplicate
                const merged = mergeTransactions(localHistory, firestoreHistory);
                console.log('🔄 Merged transactions:', merged.length);
                return merged;
            } catch (error) {
                console.warn('⚠️ Failed to fetch from Firestore, using local only:', error);
                return localHistory;
            }
        }
        
        return localHistory;
    } catch (error) {
        console.error('❌ Error loading transaction history:', error);
        return [];
    }
}

// Get transactions from localStorage（兼容两种格式：老的订单格式 + 新的交易格式）
function getLocalTransactions() {
    try {
        const raw = localStorage.getItem('myAssets');
        if (!raw) {
            console.log('ℹ️ No myAssets found in localStorage');
            return [];
        }

        let myAssets;
        try {
            myAssets = JSON.parse(raw);
        } catch (e) {
            console.warn('⚠️ Failed to parse myAssets JSON:', e);
            return [];
        }

        const history = Array.isArray(myAssets.history) ? myAssets.history : [];
        console.log('📦 Raw history entries from myAssets:', history.length);

        const normalized = history
            .map((entry, index) => {
                if (!entry || typeof entry !== 'object') return null;

                // 已经是"标准化交易"的情况（来自 apiManager.recordTransaction）
                const isTxShape =
                    typeof entry.type === 'string' &&
                    typeof entry.creditsSpent === 'number';

                const tx = { ...entry };

                // ------ 统一处理 timestamp ------
                let ts = tx.timestamp;
                if (typeof ts === 'string') {
                    const d = new Date(ts);
                    ts = isNaN(d.getTime()) ? null : d.getTime();
                }
                if (typeof ts !== 'number') {
                    if (tx.purchaseDate) {
                        const d = new Date(tx.purchaseDate);
                        ts = isNaN(d.getTime()) ? Date.now() : d.getTime();
                    } else {
                        ts = Date.now();
                    }
                }
                tx.timestamp = ts;

                // ------ 统一处理 id ------
                if (!tx.id) {
                    tx.id = tx.orderId || ('local_' + ts + '_' + index);
                }

                // 已经是标准交易：只做补全，不改含义
                if (isTxShape) {
                    if (!tx.status) tx.status = 'completed';
                    if (typeof tx.quantity !== 'number') tx.quantity = 0;
                    if (!tx.modelName) tx.modelName = '';
                    return tx;
                }

                // ===== 从"老的订单格式"生成一条标准交易 =====
                const totalTokens =
                    typeof tx.totalTokens === 'number' ? tx.totalTokens : 0;
                const totalShares =
                    typeof tx.totalShares === 'number' ? tx.totalShares : 0;
                const totalAmount =
                    typeof tx.totalAmount === 'number' ? tx.totalAmount : 0;

                // 交易类型：优先看 tokens / shares
                let type = 'unknown';
                if (totalTokens > 0 && totalShares === 0) {
                    type = 'buy_tokens';
                } else if (totalShares > 0 && totalTokens === 0) {
                    type = 'buy_shares';
                } else if (totalTokens > 0 && totalShares > 0) {
                    // 混合订单，简化为 buy_tokens（总价一致）
                    type = 'buy_tokens';
                }

                // modelName：1 个模型就显示名字，多于 1 个显示 Multiple models
                let modelName = '';
                if (Array.isArray(tx.items) && tx.items.length === 1) {
                    modelName = tx.items[0].modelName || '';
                } else if (Array.isArray(tx.items) && tx.items.length > 1) {
                    modelName = 'Multiple models';
                }

                // quantity：买 tokens 用 totalTokens，买 shares 用 totalShares
                let quantity = 0;
                if (type === 'buy_tokens') {
                    quantity = totalTokens;
                } else if (type === 'buy_shares') {
                    quantity = totalShares;
                }

                // creditsSpent：花出去用负号
                const creditsSpent =
                    typeof tx.creditsSpent === 'number'
                        ? tx.creditsSpent
                        : -Number(totalAmount || 0);

                return {
                    ...tx,                // 保留原始字段（items / totalTokens 等）
                    id: tx.id,
                    type,
                    timestamp: ts,
                    modelName,
                    quantity,
                    creditsSpent,
                    status: tx.status || 'completed',
                    source: tx.meta?.from || 'mycart'
                };
            })
            .filter(Boolean);

        // 新到旧排序
        normalized.sort((a, b) => b.timestamp - a.timestamp);

        console.log('✅ Normalized local transactions:', normalized.length);
        return normalized;
    } catch (error) {
        console.error('❌ Error reading local transactions:', error);
        return [];
    }
}

// Get transactions from Firestore
async function getFirestoreTransactions() {
    try {
        if (!window.firebaseDb) {
            throw new Error('Firestore not initialized');
        }
        
        const { collection, query, where, getDocs, orderBy } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
        
        const walletAddress = window.walletManager.walletAddress.toLowerCase();
        const transactionsRef = collection(window.firebaseDb, 'transactions');
        const q = query(
            transactionsRef,
            where('walletAddress', '==', walletAddress),
            orderBy('timestamp', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const transactions = [];
        
        querySnapshot.forEach((doc) => {
            transactions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return transactions;
    } catch (error) {
        console.error('❌ Error fetching Firestore transactions:', error);
        return [];
    }
}

// Merge and deduplicate transactions
function mergeTransactions(local, remote) {
    const merged = [...remote]; // Start with remote (authoritative)
    const remoteIds = new Set(remote.map(t => t.id));
    
    // Add local transactions that don't exist in remote
    local.forEach(transaction => {
        if (!remoteIds.has(transaction.id)) {
            merged.push(transaction);
        }
    });
    
    // Sort by timestamp (newest first)
    merged.sort((a, b) => b.timestamp - a.timestamp);
    
    return merged;
}

// Save transaction to localStorage and Firestore
async function saveTransaction(transaction) {
    try {
        // Save to localStorage
        const myAssets = JSON.parse(localStorage.getItem('myAssets')) || { tokens: [], shares: [], history: [] };
        if (!myAssets.history) {
            myAssets.history = [];
        }
        myAssets.history.push(transaction);
        localStorage.setItem('myAssets', JSON.stringify(myAssets));
        console.log('✅ Transaction saved to localStorage');
        
        // Save to Firestore if connected
        if (window.firebaseDb && window.walletManager && window.walletManager.isConnected) {
            try {
                const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
                const transactionRef = doc(window.firebaseDb, 'transactions', transaction.id);
                await setDoc(transactionRef, transaction);
                console.log('✅ Transaction saved to Firestore');
            } catch (error) {
                console.warn('⚠️ Failed to save to Firestore:', error);
            }
        }
    } catch (error) {
        console.error('❌ Error saving transaction:', error);
    }
}

// ========== CALCULATION FUNCTIONS ==========

// Calculate statistics
function calculateStats(transactions) {
    const stats = {
        totalSpent: 0,
        monthSpent: 0,
        totalTransactions: transactions.length,
        mostUsedModel: '-'
    };
    
    const now = Date.now();
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    // 按模型统计"使用次数"
    // 把会花 credits 的模型相关交易都算进去：API 调用 + 买 tokens + 买 shares
    const modelCounts = {};
    const usageTypes = ['api_call', 'buy_tokens', 'buy_shares'];

    transactions.forEach(tx => {
        // Total spent (negative = spent, positive = earned)
        if (tx.creditsSpent < 0) {
            stats.totalSpent += Math.abs(tx.creditsSpent);
        }
        
        // This month spent
        if (tx.timestamp >= monthAgo && tx.creditsSpent < 0) {
            stats.monthSpent += Math.abs(tx.creditsSpent);
        }
        
        // 统计模型使用次数：
        // 1）必须有 modelName
        // 2）是会花 credits 的类型（api_call / buy_tokens / buy_shares）
        // 3）creditsSpent < 0（排除 Daily Check-In 这种加分的记录）
        if (
            tx.modelName &&
            tx.creditsSpent < 0 &&
            usageTypes.includes(tx.type)
        ) {
            modelCounts[tx.modelName] = (modelCounts[tx.modelName] || 0) + 1;
        }
    });
    
    // Find most used model（按"次数最多"选）
    let maxCount = 0;
    let mostUsed = '-';
    for (const [model, count] of Object.entries(modelCounts)) {
        if (count > maxCount) {
            maxCount = count;
            mostUsed = model;
        }
    }
    stats.mostUsedModel = mostUsed;
    
    return stats;
}

// ========== DISPLAY FUNCTIONS ==========

// Update statistics display
function updateStatsDisplay(transactions) {
    const stats = calculateStats(transactions);
    
    document.getElementById('totalSpent').innerHTML = `
        ${stats.totalSpent.toFixed(2)} <img src="svg/i3-token-logo.svg" class="token-icon" alt="i3">
    `;
    
    document.getElementById('monthSpent').innerHTML = `
        ${stats.monthSpent.toFixed(2)} <img src="svg/i3-token-logo.svg" class="token-icon" alt="i3">
    `;
    
    document.getElementById('totalTransactions').textContent = stats.totalTransactions;
    document.getElementById('mostUsedModel').textContent = stats.mostUsedModel;
}

// Display transactions table
function displayTransactions() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageTransactions = filteredTransactions.slice(start, end);
    
    const tbody = document.getElementById('transactionsTableBody');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('transactionsTable');
    const paginationSection = document.getElementById('paginationSection');
    
    // Update transaction count
    document.getElementById('transactionCount').textContent = 
        `Showing ${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? 's' : ''}`;
    
    if (filteredTransactions.length === 0) {
        emptyState.style.display = 'block';
        tableContainer.style.display = 'none';
        paginationSection.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';
    
    tbody.innerHTML = '';
    
    pageTransactions.forEach(tx => {
        const row = document.createElement('tr');
        
        // Format date
        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        // Format type
        const typeLabel = formatTransactionType(tx.type);
        
        // Format quantity
        const quantityStr = formatQuantity(tx.type, tx.quantity);
        
        // Format credits (negative = spent, positive = earned)
        const creditsClass = tx.creditsSpent >= 0 ? 'positive' : '';
        const creditsSign = tx.creditsSpent >= 0 ? '+' : '';
        const creditsValue = Math.abs(tx.creditsSpent).toFixed(2);
        
        row.innerHTML = `
            <td>
                <div class="transaction-date">
                    <span class="date-primary">${dateStr}</span>
                    <span class="date-secondary">${timeStr}</span>
                </div>
            </td>
            <td>
                <span class="type-badge ${tx.type}">${typeLabel}</span>
            </td>
            <td>
                <span class="model-name">${tx.modelName || '-'}</span>
            </td>
            <td>
                <span class="quantity">${quantityStr}</span>
            </td>
            <td>
                <div class="credits-display ${creditsClass}">
                    ${creditsSign}${creditsValue} <img src="svg/i3-token-logo.svg" class="token-icon" alt="i3">
                </div>
            </td>
            <td>
                <span class="status-badge ${tx.status}">${tx.status}</span>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Update pagination
    updatePagination();
}

// Format transaction type label
function formatTransactionType(type) {
    const labels = {
        'buy_tokens': 'Buy Tokens',
        'buy_shares': 'Buy Shares',
        'api_call': 'API Call',
        'daily_checkin': 'Daily Check-in',
        'social_task': 'Social Task'
    };
    return labels[type] || type;
}

// Format quantity display
function formatQuantity(type, quantity) {
    if (type === 'buy_tokens') {
        return `${quantity}K tokens`;
    } else if (type === 'buy_shares') {
        return `${quantity} shares`;
    } else if (type === 'api_call') {
        return `${quantity} call${quantity !== 1 ? 's' : ''}`;
    } else {
        return quantity ? `${quantity}` : '-';
    }
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    
    const paginationSection = document.getElementById('paginationSection');
    paginationSection.style.display = totalPages > 1 ? 'flex' : 'none';
}

// ========== FILTER FUNCTIONS ==========

// Apply filters
function applyFilters() {
    const typeFilter = document.getElementById('filterType').value;
    const timeFilter = document.getElementById('filterTime').value;
    const statusFilter = document.getElementById('filterStatus').value;
    
    filteredTransactions = allTransactions.filter(tx => {
        // Type filter
        if (typeFilter !== 'all' && tx.type !== typeFilter) {
            return false;
        }
        
        // Time filter
        if (timeFilter !== 'all') {
            const days = parseInt(timeFilter);
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            if (tx.timestamp < cutoff) {
                return false;
            }
        }
        
        // Status filter
        if (statusFilter !== 'all' && tx.status !== statusFilter) {
            return false;
        }
        
        return true;
    });
    
    currentPage = 1; // Reset to first page
    displayTransactions();
}

// Reset filters
function resetFilters() {
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterTime').value = 'all';
    document.getElementById('filterStatus').value = 'all';
    
    filteredTransactions = [...allTransactions];
    currentPage = 1;
    displayTransactions();
}

// ========== PAGINATION FUNCTIONS ==========

// Change page
function changePage(direction) {
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    currentPage += direction;
    
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    displayTransactions();
    
    // Scroll to top of table
    document.querySelector('.transactions-table-container').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
}

// Make function global for onclick
window.changePage = changePage;

// ========== EXPORT FUNCTION ==========

// Export transactions to CSV
function exportTransactions() {
    if (filteredTransactions.length === 0) {
        alert('No transactions to export!');
        return;
    }
    
    // CSV headers
    let csv = 'Date,Time,Type,Model,Quantity,Credits Spent,Status\n';
    
    // CSV data
    filteredTransactions.forEach(tx => {
        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString('en-US');
        const timeStr = date.toLocaleTimeString('en-US');
        const typeLabel = formatTransactionType(tx.type);
        const quantityStr = formatQuantity(tx.type, tx.quantity);
        const creditsSign = tx.creditsSpent >= 0 ? '+' : '';
        const creditsValue = creditsSign + Math.abs(tx.creditsSpent).toFixed(2);
        
        csv += `"${dateStr}","${timeStr}","${typeLabel}","${tx.modelName || '-'}","${quantityStr}","${creditsValue}","${tx.status}"\n`;
    });
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    console.log('✅ Transactions exported to CSV');
}

// Make functions global for onclick
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.exportTransactions = exportTransactions;

// ========== INITIALIZATION ==========

// Initialize page
async function initializePage() {
    console.log('💳 Initializing Payment History page...');
    
    // Load transactions
    allTransactions = await getTransactionHistory();
    filteredTransactions = [...allTransactions];
    
    console.log('📊 Loaded transactions:', allTransactions.length);
    
    // Update displays
    updateStatsDisplay(allTransactions);
    displayTransactions();
    
    console.log('✅ Payment History page loaded successfully');
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', initializePage);

// Listen for wallet events
window.addEventListener('walletConnected', initializePage);
window.addEventListener('walletUpdated', initializePage);

