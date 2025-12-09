// 🔧 API Manager for Intelligence Cubed

class APIManager {
    constructor() {
        // Ensure we always have a valid config structure
        this.config = window.APP_CONFIG || {};
        if (!this.config.proxy) {
            this.config.proxy = {};
        }
        
        // Set default values if not provided
        this.config.proxy.apiKey = this.config.proxy.apiKey || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
        this.config.proxy.model = this.config.proxy.model || 'i3-model';
        this.config.proxy.maxTokens = this.config.proxy.maxTokens || 4000;
        this.config.proxy.temperature = this.config.proxy.temperature || 0.7;
        
        this.baseURL = 'http://34.71.119.178:8000';
        // this.baseURL = 'http://localhost:8000';
        this.isInitialized = false;
        this.init();
    }
    
    init() {
        console.log('🔧 API Manager initialized');
        this.isInitialized = true;
    }
    
    // ===== Capability inference & messaging =====
    inferCapabilities(modelName, userPrompt) {
        try {
            const capabilities = new Set(['text']);
            const lower = (s) => (s || '').toLowerCase();
            const modelData = (window.MODEL_DATA && window.MODEL_DATA[modelName]) ? window.MODEL_DATA[modelName] : null;
            let haystack = [ modelName, modelData?.category, modelData?.purpose, modelData?.useCase ].map(lower).join(' ');
            try {
                const wfRaw = localStorage.getItem('currentWorkflow');
                if (wfRaw) {
                    const wf = JSON.parse(wfRaw);
                    haystack += ' ' + lower(wf?.name) + ' ' + lower(wf?.description);
                }
            } catch (_) {}

            const promptLower = lower(userPrompt);
            haystack += ' ' + promptLower;

            // Image / Vision
            if (/(vision|image|visual|segmentation|detection|recognition|ocr|camera|photo|picture|png|jpg|jpeg|gif|3d|point\s*cloud|stereo)/.test(haystack)) {
                capabilities.add('images');
            }
            // Video
            if (/(video|mp4|mov|avi)/.test(haystack)) {
                capabilities.add('video');
            }
            // Audio
            if (/(audio|speech|voice|asr|tts|wav|mp3|flac|recording)/.test(haystack)) {
                capabilities.add('audio');
            }

            return { capabilities: Array.from(capabilities) };
        } catch (_) {
            return { capabilities: ['text'] };
        }
    }


    // ===== Guardrails helpers (client-side) =====
    buildSystemPrompt(modelName, userPrompt, extraSystem = '') {
        // Simplified system prompt - capability instruction now handled in backend
        const modelContext = [
            `You are ${modelName}.`,
            'You are a finetuned specialized niche model.',
            (extraSystem || '').trim()
        ].filter(Boolean).join('\n\n');

        return modelContext;
    }

    // NEW: Streaming chat request (client-side)
    async streamChatRequest(messages, options = {}) {
        const { model = null, onDelta, onStart, onError, onDone } = options;
        if (!this.isInitialized) throw new Error('API Manager not initialized');
        const apiKey = this.getAPIKey();
        if (!apiKey) throw new Error('API Key not found');

        const requestBody = {
            model: model || this.config.proxy.model,
            messages,
            max_tokens: this.config.proxy.maxTokens,
            temperature: this.config.proxy.temperature,
            stream: true
        };

        let fullText = '';
        try {
            console.log('🚀 Making API request to local proxy: /api/chat/completions');
            console.log('📝 Request body:', requestBody);
            
            // Get test mode state from localStorage
            const testModeEnabled = localStorage.getItem('i3TestMode') === 'true';
            
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'I3-API-Key': apiKey,
                    'X-Test-Mode': testModeEnabled ? 'true' : 'false'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const err = await response.text().catch(() => '');
                console.error('❌ API Error Response:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: err
                });
                throw new Error(`API Error (${response.status}): ${err || response.statusText}`);
            }

            onStart && onStart();

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let done = false;

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                const chunk = decoder.decode(value || new Uint8Array(), { stream: true });
                buffer += chunk;

                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const evt of events) {
                    const line = evt.trim();
                    if (!line.startsWith('data:')) continue;
                    const data = line.replace(/^data:\s*/, '');
                    if (data === '[DONE]') {
                        done = true;
                        break;
                    }
                    try {
                        const json = JSON.parse(data);
                        // Handle proxy API response structure for streaming
                        const responseData = json.data || json;
                        const delta = responseData.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullText += delta;
                            onDelta && onDelta(delta);
                        }
                    } catch (_) {
                        // ignore JSON parse errors on partial frames
                    }
                }
            }

            onDone && onDone(fullText);
            return { success: true, content: fullText };

        } catch (error) {
            console.error('❌ Stream Chat Request Error:', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                baseURL: this.baseURL,
                apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'none'
            });
            onError && onError(error);
            return { success: false, error: error.message };
        }
    }

    // NEW: Streaming model-specific helper (streams sanitized text so final == incremental)
    async streamModelRequest(modelName, prompt, context = {}, options = {}) {
        const systemContent = this.buildSystemPrompt(modelName, prompt, context.systemPrompt || '');
        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: prompt }
        ];

        // Simplified - sanitization now handled in backend
        return this.streamChatRequest(messages, {
            model: modelName || this.config.proxy.model,
            ...options
        });
    }

    // NEW: Streaming helper for vision with base64/data URL image
    async streamModelRequestWithImage(modelName, prompt, imageDataUrl, context = {}, options = {}) {
        const systemContent = this.buildSystemPrompt(modelName, prompt || '', context.systemPrompt || '');
        const userContent = [];
        if (prompt && String(prompt).trim().length) {
            userContent.push({ type: 'text', text: String(prompt) });
        } else {
            userContent.push({ type: 'text', text: '' });
        }
        if (imageDataUrl) {
            userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } });
        }
        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
        ];

        // Simplified - sanitization now handled in backend
        return this.streamChatRequest(messages, {
            model: modelName || this.config.proxy.model,
            ...options
        });
    }

    // NEW: Streaming helper for multiple images (array of data URLs)
    async streamModelRequestWithImages(modelName, prompt, imageDataUrls, context = {}, options = {}) {
        const systemContent = this.buildSystemPrompt(modelName, prompt || '', context.systemPrompt || '');
        const userContent = [];
        if (prompt && String(prompt).trim().length) {
            userContent.push({ type: 'text', text: String(prompt) });
        } else {
            userContent.push({ type: 'text', text: '' });
        }
        (Array.isArray(imageDataUrls) ? imageDataUrls : []).forEach((u) => {
            if (u) userContent.push({ type: 'image_url', image_url: { url: u } });
        });
        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
        ];

        // Simplified - sanitization now handled in backend
        return this.streamChatRequest(messages, {
            ...options
        });
    }

    
    // 获取 API Key
    getAPIKey() {
        // Try to get from config first
        let apiKey = this.config.proxy?.apiKey;
        
        // If not found, try localStorage
        if (!apiKey) {
            apiKey = localStorage.getItem('proxyApiKey');
        }
        
        // If still not found, use default
        if (!apiKey) {
            apiKey = 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
        }
        
        console.log('🔑 Getting API Key:', {
            config: this.config,
            proxy: this.config.proxy,
            apiKey: apiKey,
            fromLocalStorage: localStorage.getItem('proxyApiKey')
        });
        
        return apiKey;
    }
    
    // 获取文本嵌入向量
    async getEmbedding(text, model = 'i3-embedding') {
        if (!this.isInitialized) throw new Error('API Manager not initialized');
        const apiKey = this.getAPIKey();
        if (!apiKey) throw new Error('API Key not found');

        // Use local proxy instead of direct external API to avoid CORS issues
        const response = await fetch('/api/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'I3-API-Key': apiKey
            },
            body: JSON.stringify({ model, input: text })
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`Embeddings API Error: ${err || response.statusText}`);
        }
        const json = await response.json();
        
        // Debug: Log the embeddings API response structure
        console.log('🔍 Embeddings API response:', {
            hasData: !!json?.data,
            dataType: typeof json?.data,
            dataLength: Array.isArray(json?.data) ? json?.data.length : 'not array',
            firstItem: json?.data?.[0] ? {
                hasEmbedding: !!json.data[0].embedding,
                embeddingLength: json.data[0].embedding?.length,
                embeddingType: typeof json.data[0].embedding
            } : 'no first item',
            fullResponse: json
        });
        
        // Handle i3 proxy response format: { success: true, data: { data: [{"embedding": [...]}] } }
        if (json.success && json.data && json.data.data && json.data.data[0]) {
            return json.data.data[0].embedding || [];
        }
        
        // Fallback to old format
        return json?.data?.[0]?.embedding || [];
    }
    
    // 设置 API Key
    setAPIKey(apiKey) {
        this.config.proxy.apiKey = apiKey;
        localStorage.setItem('proxyApiKey', apiKey);
        console.log('✅ API Key updated');
    }
    
    // 发送聊天请求
    async sendChatRequest(messages, model = null) {
        if (!this.isInitialized) {
            throw new Error('API Manager not initialized');
        }
        
        const apiKey = this.getAPIKey();
        if (!apiKey) {
            throw new Error('API Key not found');
        }
        
        const requestBody = {
            model: model || this.config.proxy.model,
            messages: messages,
            max_tokens: this.config.proxy.maxTokens,
            temperature: this.config.proxy.temperature
        };
        
        try {
            console.log('🚀 Sending chat request to I3 Proxy API...');
            
            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'I3-API-Key': apiKey
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ Chat request successful');
            
            // Handle proxy API response structure
            const responseData = data.data || data;
            
            return {
                success: true,
                content: responseData.choices[0].message.content,
                usage: responseData.usage,
                model: responseData.model
            };
            
        } catch (error) {
            console.error('❌ Chat request failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // 发送模型特定请求
    async sendModelRequest(modelName, prompt, context = {}) {
        // Build a hardened system message. Keep baseURL unchanged.
        const systemContent = this.buildSystemPrompt(modelName, prompt, context.systemPrompt || '');

        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: prompt }
        ];

        const result = await this.sendChatRequest(messages);
        return result;
    }
    
    // 测试 API 连接
    async testConnection() {
        try {
            const result = await this.sendChatRequest([
                {
                    role: 'user',
                    content: 'Hello, this is a test message.'
                }
            ]);
            
            if (result.success) {
                console.log('✅ API connection test successful');
                return true;
            } else {
                console.log('❌ API connection test failed:', result.error);
                return false;
            }
        } catch (error) {
            console.error('❌ API connection test error:', error);
            return false;
        }
    }
    
    // 获取模型信息
    async getModels() {
        const apiKey = this.getAPIKey();
        if (!apiKey) {
            throw new Error('API Key not found');
        }
        
        try {
            const response = await fetch(`${this.baseURL}/models`, {
                headers: {
                    'I3-API-Key': apiKey
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }
            
            const data = await response.json();
            // Handle proxy API response structure
            return data.data || data;
            
        } catch (error) {
            console.error('❌ Failed to get models:', error);
            throw error;
        }
    }
    
    // 获取使用情况
    async getUsage() {
        const apiKey = this.getAPIKey();
        if (!apiKey) {
            throw new Error('API Key not found');
        }
        
        try {
            const response = await fetch(`${this.baseURL}/usage`, {
                headers: {
                    'I3-API-Key': apiKey
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch usage: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('❌ Failed to get usage:', error);
            throw error;
        }
    }
}

// 创建全局实例
window.apiManager = new APIManager();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}

console.log('✅ API Manager loaded successfully');

// ========== TRANSACTION RECORDING ==========

// Record a transaction
APIManager.prototype.recordTransaction = async function(transactionData) {
    try {
        // Generate transaction ID if not provided
        if (!transactionData.id) {
            transactionData.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // Add timestamp if not provided
        if (!transactionData.timestamp) {
            transactionData.timestamp = Date.now();
        }
        
        // Add wallet address if connected
        if (window.walletManager && window.walletManager.isConnected) {
            transactionData.walletAddress = window.walletManager.walletAddress;
        }
        
        // Set default status
        if (!transactionData.status) {
            transactionData.status = 'completed';
        }
        
        console.log('📝 Recording transaction:', transactionData);
        
        // Save to localStorage
        const myAssets = JSON.parse(localStorage.getItem('myAssets')) || { tokens: [], shares: [], history: [] };
        if (!myAssets.history) {
            myAssets.history = [];
        }
        myAssets.history.push(transactionData);
        localStorage.setItem('myAssets', JSON.stringify(myAssets));
        console.log('✅ Transaction saved to localStorage');
        
        // Save to Firestore if available
        if (window.firebaseDb) {
            try {
                const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
                const transactionRef = doc(window.firebaseDb, 'transactions', transactionData.id);
                await setDoc(transactionRef, transactionData);
                console.log('✅ Transaction saved to Firestore');
            } catch (error) {
                console.warn('⚠️ Failed to save transaction to Firestore:', error);
            }
        }
        
        return { success: true, transaction: transactionData };
    } catch (error) {
        console.error('❌ Error recording transaction:', error);
        return { success: false, error: error.message };
    }
};

// Get transaction history
APIManager.prototype.getTransactionHistory = async function(walletAddress, options = {}) {
    try {
        const { limit = 100, offset = 0, type = null, startDate = null, endDate = null } = options;
        
        // Get from localStorage
        const myAssets = JSON.parse(localStorage.getItem('myAssets')) || { history: [] };
        let transactions = myAssets.history || [];
        
        // Get from Firestore if available
        if (window.firebaseDb && walletAddress) {
            try {
                const { collection, query, where, getDocs, orderBy, limit: firestoreLimit } = 
                    await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
                
                const transactionsRef = collection(window.firebaseDb, 'transactions');
                let q = query(
                    transactionsRef,
                    where('walletAddress', '==', walletAddress.toLowerCase()),
                    orderBy('timestamp', 'desc')
                );
                
                if (limit) {
                    q = query(q, firestoreLimit(limit));
                }
                
                const querySnapshot = await getDocs(q);
                const firestoreTransactions = [];
                
                querySnapshot.forEach((doc) => {
                    firestoreTransactions.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // Merge transactions (Firestore is authoritative)
                const localIds = new Set(transactions.map(t => t.id));
                firestoreTransactions.forEach(tx => {
                    if (!localIds.has(tx.id)) {
                        transactions.push(tx);
                    }
                });
                
                console.log('✅ Fetched transactions from Firestore:', firestoreTransactions.length);
            } catch (error) {
                console.warn('⚠️ Failed to fetch from Firestore:', error);
            }
        }
        
        // Apply filters
        if (type) {
            transactions = transactions.filter(tx => tx.type === type);
        }
        
        if (startDate) {
            transactions = transactions.filter(tx => tx.timestamp >= startDate);
        }
        
        if (endDate) {
            transactions = transactions.filter(tx => tx.timestamp <= endDate);
        }
        
        // Sort by timestamp (newest first)
        transactions.sort((a, b) => b.timestamp - a.timestamp);
        
        // Apply pagination
        const paginatedTransactions = transactions.slice(offset, offset + limit);
        
        return {
            success: true,
            transactions: paginatedTransactions,
            total: transactions.length
        };
    } catch (error) {
        console.error('❌ Error getting transaction history:', error);
        return { success: false, error: error.message, transactions: [] };
    }
};

console.log('✅ Transaction recording methods added to API Manager'); 