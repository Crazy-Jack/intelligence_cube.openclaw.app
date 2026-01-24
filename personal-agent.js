// ========== Mobile User Chats UI State ==========
let isMobileChatMode = false;

function isMobileView() {
    return window.innerWidth <= 768;
}

function showAgentSidebarMobile() {
    // 返回到 agent 列表
    isMobileChatMode = false;
    const sidebar = document.getElementById('agentSidebar');
    const chatArea = document.getElementById('userChatArea');
    
    if (sidebar && chatArea) {
        sidebar.classList.remove('mobile-hide-sidebar');
        sidebar.classList.add('mobile-show-sidebar');
        chatArea.classList.remove('mobile-show-chat');
        chatArea.classList.add('mobile-hide-chat');
    }
    
    // 隐藏返回按钮
    const backBtn = document.getElementById('userChatsBackBtn');
    if (backBtn) backBtn.style.display = 'none';
}

function showChatAreaMobile() {
    isMobileChatMode = true;
    const sidebar = document.getElementById('agentSidebar');
    const chatArea = document.getElementById('userChatArea');
    
    if (sidebar && chatArea) {
        sidebar.classList.remove('mobile-show-sidebar');
        sidebar.classList.add('mobile-hide-sidebar');
        chatArea.classList.remove('mobile-hide-chat');
        chatArea.classList.add('mobile-show-chat');
    }
    
    // 显示返回按钮
    const backBtn = document.getElementById('userChatsBackBtn');
    if (backBtn) backBtn.style.display = 'block';
}

// 初始化移动端状态
function initMobileUserChatsState() {
    if (isMobileView()) {
        // 默认显示agent列表
        showAgentSidebarMobile();
    }
}

// 响应窗口变化
window.addEventListener('resize', () => {
    if (!isMobileView()) {
        // 桌面端：移除所有移动端class，恢复默认布局
        const sidebar = document.getElementById('agentSidebar');
        const chatArea = document.getElementById('userChatArea');
        if (sidebar) {
            sidebar.classList.remove('mobile-show-sidebar', 'mobile-hide-sidebar');
        }
        if (chatArea) {
            chatArea.classList.remove('mobile-show-chat', 'mobile-hide-chat');
        }
        const backBtn = document.getElementById('userChatsBackBtn');
        if (backBtn) backBtn.style.display = 'none';
    } else {
        // 移动端根据状态切换
        if (isMobileChatMode) {
            showChatAreaMobile();
        } else {
            showAgentSidebarMobile();
        }
    }
});
// Personal Agent - Agent Creator and RAG Infrastructure

// Global state
let currentWalletAddress = null;
let currentModelId = null;
let selectedFiles = [];
let createModalSelectedFiles = []; // Files selected in create agent modal
let models = [];
let modelsLoaded = false; // Track if models have been loaded

// Listen for wallet connection IMMEDIATELY (before DOMContentLoaded)
// This ensures we catch the event even if wallet auto-connects early
window.addEventListener('walletConnected', async () => {
    const newAddress = getWalletAddress();
    if (newAddress && newAddress !== currentWalletAddress) {
        currentWalletAddress = newAddress;
        console.log('🔗 Wallet connected, loading models...');
        await loadModels();
        renderAgentSidebar();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Handle URL parameters FIRST - doesn't need wallet
    handleUrlParameters();
    
    // Try to get wallet address synchronously (no waiting/polling)
    currentWalletAddress = getWalletAddress();
    
    // Load models (will gracefully handle if wallet isn't connected)
    await loadModels();
    setupEventListeners();
    
    // 初始化移动端user chats状态
    initMobileUserChatsState();
    
    // If wallet wasn't ready yet, check again after wallet manager initializes (1s delay in wallet-manager.js)
    if (!currentWalletAddress) {
        setTimeout(async () => {
            const newAddress = getWalletAddress();
            if (newAddress && !modelsLoaded) {
                currentWalletAddress = newAddress;
                console.log('🔗 Wallet detected after delay, loading models...');
                await loadModels();
                renderAgentSidebar();
            }
        }, 1200); // Slightly after wallet-manager's 1s updateUI delay
    }
});

// Get wallet address synchronously from wallet manager
function getWalletAddress() {
    // Only source is walletManager - localStorage is no longer used for wallet address
    return window.walletManager?.walletAddress || null;
}

// Handle URL parameters for deep linking
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const agentId = urlParams.get('agentId');
    const action = urlParams.get('action');
    const agentName = urlParams.get('agentName');
    
    if (tab) {
        // Map URL param to tab name
        const tabMap = {
            'user-chats': 'user-chats',
            'agent-creator': 'model-creator',
            'agentverse': 'public-agents',
            'public-agents': 'public-agents'
        };
        const tabName = tabMap[tab] || tab;
        
        // Switch to the specified tab
        setTimeout(() => {
            switchTab(tabName);
            
            // If agentId is provided and we're on user-chats, select that agent
            if (agentId && tabName === 'user-chats') {
                setTimeout(async () => {
                    // Ensure agents are loaded
                    await loadAgentsForChat();
                    
                    // Track this agent as interacted (so it shows in sidebar)
                    addInteractedPublicAgent(agentId);
                    
                    // Re-render sidebar to include the new agent
                    renderAgentSidebar();
                    
                    // Select the agent
                    const isPublic = publicAgents.some(a => a.id === agentId);
                    selectAgentFromSidebar(agentId, isPublic ? 'public' : 'my');
                }, 200);
            }
            
            // Handle fork action from Modelverse
            if (action === 'fork' && agentId && tabName === 'public-agents') {
                setTimeout(async () => {
                    // Load public agents first
                    await loadPublicAgents();
                    
                    // Find the agent and show fork modal
                    const agent = publicAgents.find(a => a.id === agentId || a.modelId === agentId);
                    if (agent) {
                        showForkConfirmModal(agent.id || agent.modelId, agent.name || agentName || 'Unknown Agent');
                    } else if (agentName) {
                        // Fallback if agent not found in list
                        showForkConfirmModal(agentId, agentName);
                    }
                }, 300);
            }
        }, 100);
        
        // Clean up URL (remove params without page reload)
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Wait for Firebase to be ready
async function waitForFirebase() {
    if (window.firebaseDb) return;
    
    return new Promise((resolve) => {
        const checkFirebase = () => {
            if (window.firebaseDb) {
                resolve();
            } else {
                setTimeout(checkFirebase, 100);
            }
        };
        window.addEventListener('firebaseReady', resolve);
        checkFirebase();
    });
}


// Setup event listeners
function setupEventListeners() {
    // Agent selector for User Chats tab
    const agentSelector = document.getElementById('agentSelector');
    if (agentSelector) {
        agentSelector.addEventListener('change', handleAgentSelection);
    }
    
    // Upload area drag and drop - SIMPLE VERSION
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadArea || !fileInput) {
        console.error('❌ Upload area or file input not found');
        return;
    }
    
    // Flag to prevent multiple file dialogs
    let isFileDialogOpen = false;
    
    // Simple: Click upload area to trigger file input
    uploadArea.addEventListener('click', function(e) {
        // Don't trigger if clicking a button
        if (e.target.closest('button')) {
            return;
        }
        
        // Don't trigger if file dialog is already open
        if (isFileDialogOpen) {
            console.log('⚠️ File dialog already open, ignoring click');
            return;
        }
        
        // Set flag and trigger file input click
        isFileDialogOpen = true;
        fileInput.click();
        
        // Reset flag after a delay (file dialog will block, so this is safe)
        setTimeout(() => {
            isFileDialogOpen = false;
        }, 1000);
    });
    
    // Simple: Handle file selection
    fileInput.addEventListener('change', function(e) {
        // Reset flag immediately when files are selected
        isFileDialogOpen = false;
        
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e);
        }
    });
    
    // Simple: Drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        if (!uploadArea.contains(e.relatedTarget)) {
            uploadArea.classList.remove('dragover');
        }
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleFileSelect({ target: { files } });
        }
    });
}

// Setup upload listeners for Create Agent modal
function setupCreateModalUploadListeners() {
    const uploadArea = document.getElementById('createModalUploadArea');
    const fileInput = document.getElementById('createModalFileInput');
    
    if (!uploadArea || !fileInput) {
        console.log('⚠️ Create modal upload elements not found yet');
        return;
    }
    
    let isFileDialogOpen = false;
    
    // Click to upload
    uploadArea.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        if (isFileDialogOpen) return;
        
        isFileDialogOpen = true;
        fileInput.click();
        setTimeout(() => { isFileDialogOpen = false; }, 1000);
    });
    
    // Handle file selection
    fileInput.addEventListener('change', function(e) {
        isFileDialogOpen = false;
        if (e.target.files && e.target.files.length > 0) {
            handleCreateModalFileSelect(e);
        }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#8b5cf6';
        uploadArea.style.background = '#f5f3ff';
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        if (!uploadArea.contains(e.relatedTarget)) {
            uploadArea.style.borderColor = '#d1d5db';
            uploadArea.style.background = '#f9fafb';
        }
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#d1d5db';
        uploadArea.style.background = '#f9fafb';
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleCreateModalFileSelect({ target: { files } });
        }
    });
}

// Handle file selection in Create Agent modal
function handleCreateModalFileSelect(e) {
    const files = Array.from(e.target.files || e.target);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['.pdf', '.txt', '.md', '.doc', '.docx'];
    
    files.forEach(file => {
        // Check file size
        if (file.size > maxSize) {
            showNotification(`File "${file.name}" exceeds 10MB limit`, 'error');
            return;
        }
        
        // Check file type
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedTypes.includes(ext)) {
            showNotification(`File type "${ext}" not supported`, 'error');
            return;
        }
        
        // Check for duplicates
        if (createModalSelectedFiles.some(f => f.name === file.name)) {
            showNotification(`File "${file.name}" already added`, 'info');
            return;
        }
        
        createModalSelectedFiles.push(file);
    });
    
    renderCreateModalFilePreview();
}

// Render file preview in Create Agent modal
function renderCreateModalFilePreview() {
    const previewContainer = document.getElementById('createModalFilePreview');
    if (!previewContainer) return;
    
    if (createModalSelectedFiles.length === 0) {
        previewContainer.innerHTML = '';
        return;
    }
    
    previewContainer.innerHTML = createModalSelectedFiles.map((file, index) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f3f4f6; border-radius: 6px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span style="font-size: 13px; color: #374151;">${escapeHtml(file.name)}</span>
                <span style="font-size: 11px; color: #9ca3af;">(${(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button onclick="removeCreateModalFile(${index})" style="background: none; border: none; cursor: pointer; color: #ef4444; padding: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

// Remove file from Create Agent modal preview
function removeCreateModalFile(index) {
    createModalSelectedFiles.splice(index, 1);
    renderCreateModalFilePreview();
}

// Upload and process files for a newly created agent
async function uploadFilesForNewAgent(modelId, ownerAddress) {
    if (createModalSelectedFiles.length === 0) return;
    
    console.log(`📤 Uploading ${createModalSelectedFiles.length} files for new agent: ${modelId}`);
    
    for (const file of createModalSelectedFiles) {
        try {
            // Generate file ID
            const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
            
            // Create FormData for upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('fileId', fileId);
            formData.append('modelId', modelId);
            formData.append('ownerAddress', ownerAddress);
            formData.append('filename', file.name);
            formData.append('mimeType', file.type || 'application/octet-stream');
            
            // Upload to GCS + Firestore
            console.log(`⬆️ Uploading: ${file.name}`);
            const uploadResponse = await fetch('/api/personal-agent/files/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'Upload failed');
            }
            
            const uploadResult = await uploadResponse.json();
            console.log(`✅ Uploaded: ${file.name}`);
            
            // Trigger RAG processing
            console.log(`🔄 Processing: ${file.name}`);
            const processResponse = await fetch('/api/process-rag-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: fileId,
                    modelId: modelId,
                    storagePath: uploadResult.storagePath,
                    filename: file.name,
                    ownerAddress: ownerAddress
                })
            });
            
            if (processResponse.ok) {
                console.log(`✅ RAG processing started: ${file.name}`);
            } else {
                console.warn(`⚠️ RAG processing may have issues: ${file.name}`);
            }
            
        } catch (error) {
            console.error(`❌ Error uploading ${file.name}:`, error);
            showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
        }
    }
    
    // Clear the selected files
    createModalSelectedFiles = [];
    renderCreateModalFilePreview();
    
    showNotification('Files uploaded and processing started', 'success');
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons - find the correct button by checking onclick attribute
    document.querySelectorAll('.pa-tab').forEach(tab => {
        tab.classList.remove('active');
        // Check if this button's onclick contains the tabName
        const onclick = tab.getAttribute('onclick') || '';
        if (onclick.includes(`'${tabName}'`) || onclick.includes(`"${tabName}"`)) {
            tab.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.pa-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const tabElement = document.getElementById(`${tabName}-tab`);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // 如果切换到 user-chats 且是移动端，初始化移动端状态
    if (tabName === 'user-chats' && isMobileView()) {
        // 延迟执行，让DOM更新完成
        setTimeout(() => {
            initMobileUserChatsState();
        }, 50);
    }
}

// ========== Model Management ==========

// Load models from backend API
async function loadModels() {
    if (!currentWalletAddress) {
        console.warn('⚠️ Wallet not connected, cannot load models');
        return;
    }
    
    try {
        console.log(`📋 Loading models for wallet: ${currentWalletAddress}`);
        const response = await fetch(`/api/personal-agent/models?ownerAddress=${encodeURIComponent(currentWalletAddress.toLowerCase())}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load agents' }));
            throw new Error(errorData.error || 'Failed to load agents');
        }
        const data = await response.json();
        models = data.models || [];
        modelsLoaded = true; // Mark that models have been loaded
        console.log(`✅ Loaded ${models.length} model(s):`, models.map(m => m.name));
        renderModelList();
    } catch (error) {
        console.error('❌ Error loading models:', error);
        showNotification('Failed to load agents: ' + error.message, 'error');
    }
}

// Render model list
function renderModelList() {
    const modelList = document.getElementById('model-list');
    if (!modelList) return;
    
    if (models.length === 0) {
        modelList.innerHTML = '<div class="pa-empty-state"><p>No agents yet. Create your first agent!</p></div>';
        return;
    }
    
    modelList.innerHTML = models.map(model => `
        <div class="pa-model-item ${model.id === currentModelId ? 'selected' : ''}" 
             onclick="selectModel('${model.id}')">
            <div class="pa-model-item-header">
                <h3 class="pa-model-item-name" style="display: flex; align-items: center; gap: 8px;">
                    ${model.forkedFrom ? '<span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; min-width: 22px; flex-shrink: 0; background: linear-gradient(135deg, #10b981, #059669); border-radius: 4px;" title="Forked agent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path><path d="M12 12v3"></path></svg></span>' : ''}
                    <span style="flex: 1; min-width: 0;">${escapeHtml(model.name || 'Unnamed')}</span>
                </h3>
                <div class="pa-model-item-actions" onclick="event.stopPropagation()">
                    <button class="pa-model-item-action" onclick="toggleModelVisibility('${model.id}', ${!model.isPublic})" 
                            title="${model.isPublic ? 'Make private' : 'Make public'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${model.isPublic 
                                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
                        </svg>
                    </button>
                    <button class="pa-model-item-action" onclick="deleteModel('${model.id}')" title="Delete agent">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="pa-model-item-meta">
                <span class="pa-model-item-badge ${model.isPublic ? 'public' : 'private'}">
                    ${model.isPublic ? 'Public' : 'Private'}
                </span>
                ${model.forkedFrom ? '<span class="pa-model-item-badge forked" style="background: #d1fae5; color: #065f46;">Forked</span>' : ''}
                ${model.createdAt ? `<span>${formatDate(model.createdAt) || ''}</span>` : ''}
            </div>
        </div>
    `).join('');
}

// Select a model
async function selectModel(modelId) {
    currentModelId = modelId;
    renderModelList();
    await loadModelDetails(modelId);
}

// Load model details
async function loadModelDetails(modelId) {
    if (!currentWalletAddress) return;
    
    try {
        // Find model in already loaded models list
        const model = models.find(m => m.id === modelId);
        if (model) {
            renderModelDetails(model);
            await loadModelFiles(modelId);
        } else {
            // If not found in list, try to load from API
            const response = await fetch(`/api/personal-agent/models?ownerAddress=${encodeURIComponent(currentWalletAddress.toLowerCase())}`);
            if (response.ok) {
                const data = await response.json();
                const foundModel = data.models.find(m => m.id === modelId);
                if (foundModel) {
                    renderModelDetails(foundModel);
                    await loadModelFiles(modelId);
                } else {
                    showNotification('Agent not found', 'error');
                }
            } else {
                showNotification('Failed to load agent details', 'error');
            }
        }
    } catch (error) {
        console.error('Error loading model details:', error);
        showNotification('Failed to load agent details', 'error');
    }
}

// Render model details with inline editing
function renderModelDetails(model) {
    const detailsPanel = document.getElementById('model-details');
    if (!detailsPanel) return;
    
    // Store current model ID for inline save
    window.currentInlineEditModelId = model.id;
    
    // Build default system prompt for preview
    const defaultSystemPrompt = `You are ${model.name || 'this agent'}. ${model.purpose || ''}\n\nUse Case: ${model.useCase || ''}\n\nIMPORTANT: When "Relevant Knowledge Base Context" is provided below, prioritize information from those knowledge chunks to answer the user's question. Cite or reference the relevant chunks when applicable. If the knowledge base doesn't contain relevant information, use your general knowledge to provide a helpful response.\n\nAnswer the user's question as this specialized model would.`;
    
    detailsPanel.innerHTML = `
        <div class="pa-model-details-header">
            <div style="flex: 1;">
                <input type="text" id="inlineName" value="${escapeHtml(model.name || '')}" 
                       style="font-size: 24px; font-weight: 700; color: #111827; border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; width: 100%; background: transparent; transition: all 0.2s;"
                       onfocus="this.style.border='1px solid #8b5cf6'; this.style.background='#fff';"
                       onblur="this.style.border='1px solid transparent'; this.style.background='transparent';"
                       placeholder="Agent Name">
                <div class="pa-model-details-meta" style="margin-top: 4px;">
                    <span class="pa-model-item-badge ${model.isPublic ? 'public' : 'private'}">
                        ${model.isPublic ? 'Public' : 'Private'}
                    </span>
                    ${model.forkedFrom ? '<span class="pa-model-item-badge forked" style="background: #d1fae5; color: #065f46;">Forked</span>' : ''}
                    ${model.createdAt && formatDate(model.createdAt) ? `<span>Created: ${formatDate(model.createdAt)}</span>` : ''}
                </div>
                ${model.forkedFrom ? `
                <div style="margin-top: 8px; padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; color: #166534;">
                    <span style="display: flex; align-items: center; gap: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="18" r="3"></circle>
                            <circle cx="6" cy="6" r="3"></circle>
                            <circle cx="18" cy="6" r="3"></circle>
                            <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
                            <path d="M12 12v3"></path>
                        </svg>
                        Forked from <strong style="margin-left: 4px;">${escapeHtml(model.forkedFromName || 'Unknown Agent')}</strong>
                        <span style="color: #6b7280; margin-left: 4px;">by ${model.forkedFromOwner ? model.forkedFromOwner.slice(0, 6) + '...' + model.forkedFromOwner.slice(-4) : 'Unknown'}</span>
                    </span>
                    <a href="#" onclick="showForkHistory('${model.id}'); return false;" 
                       style="display: block; margin-top: 6px; font-size: 12px; font-weight: 600; color: #059669; text-decoration: underline; cursor: pointer;">
                        Show full fork history
                    </a>
                </div>
                ` : ''}
            </div>
            <div class="pa-model-details-actions">
                <button class="pa-btn-success" onclick="showForkConfirmModal('${model.id}', '${escapeHtml(model.name || 'Unnamed')}')" style="margin-right: 8px; background: linear-gradient(135deg, #10b981, #059669); border: none; color: #fff;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="18" r="3"></circle>
                        <circle cx="6" cy="6" r="3"></circle>
                        <circle cx="18" cy="6" r="3"></circle>
                        <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
                        <path d="M12 12v3"></path>
                    </svg>
                    Fork
                </button>
                <button class="pa-btn-success" onclick="tryAgentFromDashboard('${model.id}', '${escapeHtml(model.name || '')}')" style="margin-right: 8px; background: linear-gradient(135deg, #10b981, #059669); border: none; color: #fff;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Try
                </button>
                <button class="pa-btn-primary" onclick="saveInlineModelChanges()" style="margin-right: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Save
                </button>
                <button class="pa-btn-secondary" disabled style="margin-right: 8px; opacity: 0.5; cursor: not-allowed; background: #9ca3af; border-color: #9ca3af; color: #fff;" title="Coming soon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Finetune
                </button>
                <span style="font-size: 13px; color: #6b7280; margin-right: 6px;">Public?</span>
                <label class="pa-toggle">
                    <input type="checkbox" ${model.isPublic ? 'checked' : ''} 
                           onchange="toggleModelVisibility('${model.id}', this.checked)">
                    <span class="pa-toggle-slider"></span>
                </label>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
                <label style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;">Category</label>
                <input type="text" id="inlineCategory" value="${escapeHtml(model.category || '')}" 
                       placeholder="e.g., Finance, Healthcare..."
                       style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
                       onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'">
            </div>
            <div>
                <label style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;">Industry</label>
                <input type="text" id="inlineIndustry" value="${escapeHtml(model.industry || '')}" 
                       placeholder="e.g., Technology, Education..."
                       style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
                       onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'">
            </div>
        </div>
        
            <div style="margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: end;">
                <div>
                    <label style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;">Token Price</label>
                    <input type="number" id="inlineTokenPrice" value="${model.tokenPrice !== null && model.tokenPrice !== undefined ? model.tokenPrice : ''}" 
                           placeholder="Price per interaction"
                           style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
                           onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'">
                </div>
                <div>
                    <label style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">Fork Price
                        <span style="position: relative; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #eef2ff; color: #4f46e5; font-size: 12px; cursor: help;" onmouseenter="this.querySelector('.tooltip-text').style.opacity='1'; this.querySelector('.tooltip-text').style.visibility='visible';" onmouseleave="this.querySelector('.tooltip-text').style.opacity='0'; this.querySelector('.tooltip-text').style.visibility='hidden';">i
                            <span class="tooltip-text" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; padding: 8px 12px; background: #1f2937; color: white; font-size: 12px; font-weight: normal; border-radius: 6px; white-space: normal; width: 280px; text-align: left; opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; pointer-events: none; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">When other people fork your agent, a forked revenue will be routed back to you per their agent usage to value your original creation to the ecosystem.
                                <span style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 6px solid transparent; border-top-color: #1f2937;"></span>
                            </span>
                        </span>
                    </label>
                    <input type="number" id="inlineForkedUsagePrice" value="${model.forkedUsagePrice !== null && model.forkedUsagePrice !== undefined ? model.forkedUsagePrice : 1}" 
                           placeholder="Price per forked usage"
                           style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
                           onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'">
                </div>
            </div>
        
            <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label style="font-size: 13px; font-weight: 600; color: #374151;">Purpose</label>
                <button class="pa-btn-secondary" onclick="autoGeneratePurpose('${model.id}')" style="padding: 4px 12px; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Auto Generate
                </button>
            </div>
            <textarea id="inlinePurpose" rows="2" placeholder="What does this agent do?"
                      style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; resize: vertical; transition: border-color 0.2s;"
                      onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'">${escapeHtml(model.purpose || '')}</textarea>
            </div>
        
            <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label style="font-size: 13px; font-weight: 600; color: #374151;">Use Case</label>
                <button class="pa-btn-secondary" onclick="autoGenerateUseCase('${model.id}')" style="padding: 4px 12px; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Auto Generate
                </button>
            </div>
            <textarea id="inlineUseCase" rows="2" placeholder="How should users interact with this agent?"
                      style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; resize: vertical; transition: border-color 0.2s;"
                      onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'">${escapeHtml(model.useCase || '')}</textarea>
            </div>
        
            <div style="margin-bottom: 16px;">
            <label style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;">System Prompt (Optional)</label>
            <textarea id="inlineSystemPrompt" rows="4" placeholder="Custom system prompt. Leave empty to use the default prompt shown below."
                      style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; font-family: monospace; resize: vertical; transition: border-color 0.2s;"
                      onfocus="this.style.borderColor='#8b5cf6'" onblur="this.style.borderColor='#e5e7eb'"
                      oninput="updateInlineDefaultPromptPreview()">${escapeHtml(model.systemPrompt || '')}</textarea>
            <details style="margin-top: 8px;">
                <summary style="font-size: 12px; color: #6b7280; cursor: pointer;">Preview default prompt (if left empty)</summary>
                <pre id="inlineDefaultPromptPreview" style="margin-top: 8px; padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; color: #6b7280; white-space: pre-wrap; word-break: break-word;">${escapeHtml(defaultSystemPrompt)}</pre>
            </details>
            </div>
        
        <div class="pa-files-section">
            <div class="pa-files-header">
                <h3>Files</h3>
                <button class="pa-btn-primary" onclick="openUploadFileModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Upload Files
                </button>
            </div>
            <div id="file-list" class="pa-file-list">
                <div class="pa-empty-state">
                    <p>No files uploaded yet</p>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 24px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Direct Usage</div>
                    <div style="font-size: 18px; font-weight: 600; color: #8b5cf6;">
                        ${model.accessCount !== null && model.accessCount !== undefined ? model.accessCount : 0}
                    </div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Forked Usage</div>
                    <div style="font-size: 18px; font-weight: 600; color: #10b981;">
                        ${model.forkedUsage !== null && model.forkedUsage !== undefined ? model.forkedUsage : 0}
                    </div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Forked Count</div>
                    <div style="font-size: 18px; font-weight: 600; color: #f59e0b;">
                        ${model.forkedCount !== null && model.forkedCount !== undefined ? model.forkedCount : 0}
                    </div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px; font-weight: 600;\">Total Usage</div>
                    <div style="font-size: 18px; font-weight: 600; color: #8b5cf6;\">
                        ${(model.accessCount || 0) + (model.forkedUsage || 0)}
                    </div>
                </div>
            </div>
            </div>
            <div style="padding: 12px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 6px; margin-top: 16px;">
                <div style="font-size: 12px; color: rgba(255,255,255,0.9); margin-bottom: 2px;">Total Usage</div>
                <div style="font-size: 22px; font-weight: 700; color: #ffffff;">
                    ${(model.forkedCount || 0) + (model.accessCount || 0)}
                </div>
            </div>
        </div>
    `;
    
    // Setup live preview update for default prompt
    setupInlinePromptPreviewListeners();
}

// Update the default prompt preview based on inline fields
function updateInlineDefaultPromptPreview() {
    const name = document.getElementById('inlineName')?.value || 'this agent';
    const purpose = document.getElementById('inlinePurpose')?.value || '';
    const useCase = document.getElementById('inlineUseCase')?.value || '';
    const previewEl = document.getElementById('inlineDefaultPromptPreview');
    
    if (previewEl) {
        const defaultPrompt = `You are ${name}. ${purpose}\n\nUse Case: ${useCase}\n\nIMPORTANT: When "Relevant Knowledge Base Context" is provided below, prioritize information from those knowledge chunks to answer the user's question. Cite or reference the relevant chunks when applicable. If the knowledge base doesn't contain relevant information, use your general knowledge to provide a helpful response.\n\nAnswer the user's question as this specialized model would.`;
        previewEl.textContent = defaultPrompt;
    }
}

// Setup listeners for live preview updates
function setupInlinePromptPreviewListeners() {
    const nameInput = document.getElementById('inlineName');
    const purposeInput = document.getElementById('inlinePurpose');
    const useCaseInput = document.getElementById('inlineUseCase');
    
    [nameInput, purposeInput, useCaseInput].forEach(el => {
        if (el) {
            el.addEventListener('input', updateInlineDefaultPromptPreview);
        }
    });
}

// Save inline model changes
async function saveInlineModelChanges() {
    const modelId = window.currentInlineEditModelId;
    if (!modelId) {
        alert('No agent selected');
        return;
    }
    
    // Get wallet address synchronously
    const walletAddress = getWalletAddress();
    
    if (!walletAddress) {
        alert('Wallet not connected. Please connect your wallet first.');
        return;
    }
    
    // Update the global variable if we found it
    if (!currentWalletAddress && walletAddress) {
        currentWalletAddress = walletAddress;
    }
    
    console.log('💾 Saving model with wallet:', walletAddress);
    
    const name = document.getElementById('inlineName')?.value?.trim();
    const category = document.getElementById('inlineCategory')?.value?.trim();
    const industry = document.getElementById('inlineIndustry')?.value?.trim();
    const tokenPrice = document.getElementById('inlineTokenPrice')?.value;
    const forkedUsagePrice = document.getElementById('inlineForkedUsagePrice')?.value;
    const purpose = document.getElementById('inlinePurpose')?.value?.trim();
    const useCase = document.getElementById('inlineUseCase')?.value?.trim();
    const systemPrompt = document.getElementById('inlineSystemPrompt')?.value?.trim();
    
    if (!name) {
        alert('Agent name is required');
        return;
    }
    
    const updateData = {
        ownerAddress: walletAddress.toLowerCase(),
        name,
        category: category || null,
        industry: industry || null,
        tokenPrice: tokenPrice ? parseFloat(tokenPrice) : null,
        forkedUsagePrice: forkedUsagePrice ? parseFloat(forkedUsagePrice) : 1,
        purpose: purpose || null,
        useCase: useCase || null,
        systemPrompt: systemPrompt || null
    };
    
    try {
        const response = await fetch(`/api/personal-agent/models/${modelId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update agent');
        }
        
        console.log('✅ Model updated successfully:', await response.json());
        
        // Show success feedback
        const saveBtn = document.querySelector('.pa-model-details-actions .pa-btn-primary');
        if (saveBtn) {
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Saved!`;
            saveBtn.style.background = '#10b981';
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.style.background = '';
            }, 2000);
        }
        
        showNotification('Agent updated successfully', 'success');
        
        // Reload models list to reflect changes in sidebar
        await loadModels();
        
        // Refresh current model details if this model is selected
        if (currentModelId === modelId) {
            await loadModelDetails(modelId);
        }
        
        // Update User Chats header if this agent is currently selected there
        if (selectedAgentForChat && selectedAgentForChat.id === modelId) {
            // Get updated model from the refreshed models array
            const updatedModel = models.find(m => m.id === modelId);
            if (updatedModel) {
                // Update the selectedAgentForChat object
                selectedAgentForChat = updatedModel;
                
                // Update the chat header UI
                const nameEl = document.getElementById('selectedAgentName');
                const purposeEl = document.getElementById('selectedAgentPurpose');
                if (nameEl) nameEl.textContent = updatedModel.name || 'Unnamed Agent';
                if (purposeEl) purposeEl.textContent = updatedModel.purpose || 'No description';
                
                console.log('📝 Updated User Chats header for agent:', updatedModel.name);
            }
        }
        
    } catch (error) {
        console.error('Error saving model:', error);
        showNotification('Failed to save changes: ' + error.message, 'error');
    }
}

// Auto-generate Purpose using I3 API based on uploaded files
async function autoGeneratePurpose(modelId) {
    if (!modelId) {
        showNotification('No agent selected', 'error');
        return;
    }
    
    try {
        // Get uploaded files for this model
        const filesResponse = await fetch(`/api/personal-agent/files?modelId=${encodeURIComponent(modelId)}`);
        if (!filesResponse.ok) {
            throw new Error('Failed to load files');
        }
        const filesData = await filesResponse.json();
        const files = filesData.files || [];
        
        // Check if files are uploaded
        if (files.length === 0) {
            showNotification('Please upload files first before auto-generating', 'info');
            return;
        }
        
        // Show loading state
        const purposeTextarea = document.getElementById('inlinePurpose');
        if (!purposeTextarea) return;
        
        const originalValue = purposeTextarea.value;
        purposeTextarea.disabled = true;
        purposeTextarea.value = 'Generating purpose from uploaded files...';
        purposeTextarea.style.opacity = '0.6';
        
        // Extract text from files
        let fileContents = '';
        for (const file of files.slice(0, 3)) { // Limit to first 3 files to avoid token limit
            try {
                const textResponse = await fetch(`/api/personal-agent/files/${file.fileId}/text?maxLength=2000`);
                if (textResponse.ok) {
                    const textData = await textResponse.json();
                    if (textData.success && textData.text) {
                        fileContents += `\n\n--- ${file.filename} ---\n${textData.text}`;
                    }
                }
            } catch (err) {
                console.warn(`Failed to load file ${file.filename}:`, err);
            }
        }
        
        if (!fileContents.trim()) {
            throw new Error('Could not extract text from uploaded files. Please ensure files are PDF or text format.');
        }
        
        // Call I3 API to generate purpose
        const apiManager = window.apiManager;
        if (!apiManager) {
            throw new Error('API Manager not initialized');
        }
        
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant that analyzes documents and generates concise, clear descriptions.'
            },
            {
                role: 'user',
                content: `Based on the following file contents, generate a clear and concise "Purpose" description (2-3 sentences) for an AI agent. The purpose should explain what this agent does and its main functionality.\\n\\nFile Contents:\\n${fileContents}\\n\\nGenerate only the purpose description, nothing else:`
            }
        ];
        
        let generatedPurpose = '';
        
        await apiManager.streamChatRequest(messages, {
            model: 'i3-model',
            onDelta: (delta) => {
                generatedPurpose += delta;
                purposeTextarea.value = generatedPurpose;
            },
            onError: (error) => {
                console.error('API error:', error);
                purposeTextarea.value = originalValue;
                purposeTextarea.disabled = false;
                purposeTextarea.style.opacity = '1';
                showNotification('Failed to generate purpose: ' + error.message, 'error');
            },
            onDone: () => {
                purposeTextarea.disabled = false;
                purposeTextarea.style.opacity = '1';
                showNotification('Purpose generated successfully! Review and click Save if satisfied.', 'success');
            }
        });
        
    } catch (error) {
        console.error('Error generating purpose:', error);
        const purposeTextarea = document.getElementById('inlinePurpose');
        if (purposeTextarea) {
            purposeTextarea.disabled = false;
            purposeTextarea.style.opacity = '1';
        }
        showNotification('Failed to generate purpose: ' + error.message, 'error');
    }
}

// Auto-generate Use Case using I3 API based on uploaded files
async function autoGenerateUseCase(modelId) {
    if (!modelId) {
        showNotification('No agent selected', 'error');
        return;
    }
    
    try {
        // Get uploaded files for this model
        const filesResponse = await fetch(`/api/personal-agent/files?modelId=${encodeURIComponent(modelId)}`);
        if (!filesResponse.ok) {
            throw new Error('Failed to load files');
        }
        const filesData = await filesResponse.json();
        const files = filesData.files || [];
        
        // Check if files are uploaded
        if (files.length === 0) {
            showNotification('Please upload files first before auto-generating', 'info');
            return;
        }
        
        // Show loading state
        const useCaseTextarea = document.getElementById('inlineUseCase');
        if (!useCaseTextarea) return;
        
        const originalValue = useCaseTextarea.value;
        useCaseTextarea.disabled = true;
        useCaseTextarea.value = 'Generating use case from uploaded files...';
        useCaseTextarea.style.opacity = '0.6';
        
        // Extract text from files
        let fileContents = '';
        for (const file of files.slice(0, 3)) { // Limit to first 3 files to avoid token limit
            try {
                const textResponse = await fetch(`/api/personal-agent/files/${file.fileId}/text?maxLength=2000`);
                if (textResponse.ok) {
                    const textData = await textResponse.json();
                    if (textData.success && textData.text) {
                        fileContents += `\n\n--- ${file.filename} ---\n${textData.text}`;
                    }
                }
            } catch (err) {
                console.warn(`Failed to load file ${file.filename}:`, err);
            }
        }
        
        if (!fileContents.trim()) {
            throw new Error('Could not extract text from uploaded files. Please ensure files are PDF or text format.');
        }
        
        // Call I3 API to generate use case
        const apiManager = window.apiManager;
        if (!apiManager) {
            throw new Error('API Manager not initialized');
        }
        
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant that analyzes documents and generates clear use case descriptions.'
            },
            {
                role: 'user',
                content: `Based on the following file contents, generate a clear and concise "Use Case" description (2-3 sentences) for an AI agent. The use case should explain how users should interact with this agent and what scenarios it is best suited for.\\n\\nFile Contents:\\n${fileContents}\\n\\nGenerate only the use case description, nothing else:`
            }
        ];
        
        let generatedUseCase = '';
        
        await apiManager.streamChatRequest(messages, {
            model: 'i3-model',
            onDelta: (delta) => {
                generatedUseCase += delta;
                useCaseTextarea.value = generatedUseCase;
            },
            onError: (error) => {
                console.error('API error:', error);
                useCaseTextarea.value = originalValue;
                useCaseTextarea.disabled = false;
                useCaseTextarea.style.opacity = '1';
                showNotification('Failed to generate use case: ' + error.message, 'error');
            },
            onDone: () => {
                useCaseTextarea.disabled = false;
                useCaseTextarea.style.opacity = '1';
                showNotification('Use case generated successfully! Review and click Save if satisfied.', 'success');
            }
        });
        
    } catch (error) {
        console.error('Error generating use case:', error);
        const useCaseTextarea = document.getElementById('inlineUseCase');
        if (useCaseTextarea) {
            useCaseTextarea.disabled = false;
            useCaseTextarea.style.opacity = '1';
        }
        showNotification('Failed to generate use case: ' + error.message, 'error');
    }
}


// Load model files from backend API
async function loadModelFiles(modelId) {
    if (!modelId) return;
    
    try {
        const response = await fetch(`/api/personal-agent/files?modelId=${encodeURIComponent(modelId)}`);
        if (!response.ok) {
            throw new Error('Failed to load files');
        }
        const data = await response.json();
        renderFileList(data.files || []);
    } catch (error) {
        console.error('Error loading files:', error);
        showNotification('Failed to load files', 'error');
    }
}

// Render file list
function renderFileList(files) {
    const fileList = document.getElementById('file-list');
    if (!fileList) return;
    
    if (files.length === 0) {
        fileList.innerHTML = '<div class="pa-empty-state"><p>No files uploaded yet</p></div>';
        return;
    }
    
    fileList.innerHTML = files.map(file => `
        <div class="pa-file-item">
            <div class="pa-file-item-info">
                <div class="pa-file-item-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="pa-file-item-details">
                    <p class="pa-file-item-name">
                        <a href="#" onclick="downloadFile('${file.fileId || file.id}', '${escapeHtml(file.filename || 'Unknown')}'); return false;" 
                           style="color: #6366f1; text-decoration: none; cursor: pointer;" 
                           onmouseover="this.style.textDecoration='underline'" 
                           onmouseout="this.style.textDecoration='none'"
                           title="Click to view/download">
                            ${escapeHtml(file.filename || 'Unknown')}
                        </a>
                    </p>
                    <div class="pa-file-item-meta">
                        ${file.createdAt && formatDate(file.createdAt) ? `<span>Uploaded: ${formatDate(file.createdAt)}</span>` : ''}
                        <span class="pa-file-item-status ${file.status || 'uploaded'}">${(file.status || 'uploaded').toUpperCase()}</span>
                    </div>
                </div>
            </div>
            <div class="pa-file-item-actions">
                <button class="pa-btn-danger" onclick="deleteFile('${file.fileId || file.id}', '${escapeHtml(file.filename)}')">
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

// ========== Model CRUD ==========

// Open create model modal
function openCreateModelModal() {
    // Get wallet address synchronously
    const walletAddress = getWalletAddress();
    
    if (!walletAddress) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    // Update global variable if we found it elsewhere
    if (!currentWalletAddress && walletAddress) {
        currentWalletAddress = walletAddress;
    }
    
    const modal = document.getElementById('createModelModal');
    if (modal) {
        modal.classList.add('show');
        // Reset form
        document.getElementById('modelNameInput').value = '';
        document.getElementById('modelPurposeInput').value = '';
        document.getElementById('modelUseCaseInput').value = '';
        document.getElementById('modelSystemPromptInput').value = '';
        document.getElementById('modelCategoryInput').value = '';
        document.getElementById('modelIndustryInput').value = '';
        document.getElementById('modelTokenPriceInput').value = '2'; // Default value
        document.getElementById('modelForkedUsagePriceInput').value = '1'; // Default value
        document.getElementById('modelIsPublicInput').checked = false;
        
        // Clear and reset file upload
        createModalSelectedFiles = [];
        renderCreateModalFilePreview();
        const fileInput = document.getElementById('createModalFileInput');
        if (fileInput) fileInput.value = '';
        
        // Setup upload listeners (safe to call multiple times)
        setupCreateModalUploadListeners();
        
        // Update default prompt preview
        updateCreateModelDefaultPromptPreview();
    }
}

// Close create model modal
function closeCreateModelModal() {
    const modal = document.getElementById('createModelModal');
    if (modal) {
        modal.classList.remove('show');
    }
    // Clear selected files
    createModalSelectedFiles = [];
    renderCreateModalFilePreview();
}

// Update default prompt preview for Create Model modal
function updateCreateModelDefaultPromptPreview() {
    const preview = document.getElementById('createModelDefaultPromptPreview');
    if (!preview) return;
    
    const name = document.getElementById('modelNameInput')?.value.trim() || '{Model Name}';
    const purpose = document.getElementById('modelPurposeInput')?.value.trim() || '{Purpose}';
    const useCase = document.getElementById('modelUseCaseInput')?.value.trim() || '{Use Case}';
    
    preview.textContent = `You are ${name}. ${purpose}\n\nUse Case: ${useCase}\n\nIMPORTANT: When "Relevant Knowledge Base Context" is provided below, prioritize information from those knowledge chunks to answer the user's question. Cite or reference the relevant chunks when applicable. If the knowledge base doesn't contain relevant information, use your general knowledge to provide a helpful response.\n\nAnswer the user's question as this specialized model would.`;
}

// Update default prompt preview for Edit Model modal
function updateEditModelDefaultPromptPreview() {
    const preview = document.getElementById('editModelDefaultPromptPreview');
    if (!preview) return;
    
    const modal = document.getElementById('editModelModal');
    const modelId = modal?.dataset.modelId;
    const model = models.find(m => m.id === modelId);
    const name = model?.name || '{Model Name}';
    const purpose = document.getElementById('editModelPurposeInput')?.value.trim() || '{Purpose}';
    const useCase = document.getElementById('editModelUseCaseInput')?.value.trim() || '{Use Case}';
    
    preview.textContent = `You are ${name}. ${purpose}\n\nUse Case: ${useCase}\n\nIMPORTANT: When "Relevant Knowledge Base Context" is provided below, prioritize information from those knowledge chunks to answer the user's question. Cite or reference the relevant chunks when applicable. If the knowledge base doesn't contain relevant information, use your general knowledge to provide a helpful response.\n\nAnswer the user's question as this specialized model would.`;
}

// Set up event listeners for dynamic preview updates
function setupPromptPreviewListeners() {
    // Create Model modal listeners
    const createFields = ['modelNameInput', 'modelPurposeInput', 'modelUseCaseInput'];
    createFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateCreateModelDefaultPromptPreview);
        }
    });
    
    // Edit Model modal listeners
    const editFields = ['editModelPurposeInput', 'editModelUseCaseInput'];
    editFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateEditModelDefaultPromptPreview);
        }
    });
}

// Initialize listeners when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPromptPreviewListeners);
} else {
    setupPromptPreviewListeners();
}

// Create model
async function createModel() {
    if (!currentWalletAddress) {
        showNotification('Wallet not connected', 'error');
        return;
    }
    
    const name = document.getElementById('modelNameInput').value.trim();
    if (!name) {
        showNotification('Please enter an agent name', 'error');
        return;
    }
    
    try {
        const tokenPriceInput = document.getElementById('modelTokenPriceInput').value.trim();
        const tokenPrice = tokenPriceInput ? parseFloat(tokenPriceInput) : 2; // Default to 2 if empty
        
        const forkedUsagePriceInput = document.getElementById('modelForkedUsagePriceInput').value.trim();
        const forkedUsagePrice = forkedUsagePriceInput ? parseFloat(forkedUsagePriceInput) : 1; // Default to 1 if empty
        
        const response = await fetch('/api/personal-agent/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                ownerAddress: currentWalletAddress.toLowerCase(),
                isPublic: document.getElementById('modelIsPublicInput').checked,
                purpose: document.getElementById('modelPurposeInput').value.trim() || null,
                useCase: document.getElementById('modelUseCaseInput').value.trim() || null,
                systemPrompt: document.getElementById('modelSystemPromptInput').value.trim() || null,
                category: document.getElementById('modelCategoryInput').value.trim() || null,
                industry: document.getElementById('modelIndustryInput').value.trim() || null,
                tokenPrice: tokenPrice,
                forkedUsagePrice: forkedUsagePrice
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to create agent' }));
            const errorMessage = errorData.error || errorData.details || 'Failed to create agent';
            console.error('❌ Backend error:', errorData);
            throw new Error(errorMessage);
        }
        
        const model = await response.json();
        console.log('✅ Agent created successfully:', model);
        showNotification('Agent created successfully', 'success');
        
        // Capture files BEFORE closing modal (which clears the array)
        const filesToUpload = [...createModalSelectedFiles];
        
        closeCreateModelModal();
        
        // Reload models list to include the new model
        await loadModels();
        
        // Select the newly created model first
        if (model.id) {
            await selectModel(model.id);
        }
        
        // Upload any selected files for the new agent (after model is selected)
        if (filesToUpload.length > 0 && model.id) {
            // Immediately show files with "PROCESSING" status (optimistic UI)
            const pendingFiles = filesToUpload.map((file, idx) => ({
                fileId: `pending_${idx}`,
                filename: file.name,
                status: 'processing',
                createdAt: new Date().toISOString()
            }));
            renderFileList(pendingFiles);
            
            showNotification(`Uploading ${filesToUpload.length} file(s)...`, 'info');
            
            // Upload using captured files
            for (const file of filesToUpload) {
                try {
                    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('fileId', fileId);
                    formData.append('modelId', model.id);
                    formData.append('ownerAddress', currentWalletAddress.toLowerCase());
                    formData.append('filename', file.name);
                    formData.append('mimeType', file.type || 'application/octet-stream');
                    
                    const uploadResponse = await fetch('/api/personal-agent/files/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (uploadResponse.ok) {
                        const uploadResult = await uploadResponse.json();
                        
                        // Trigger RAG processing
                        fetch('/api/process-rag-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                fileId: fileId,
                                modelId: model.id,
                                storagePath: uploadResult.storagePath,
                                filename: file.name,
                                ownerAddress: currentWalletAddress.toLowerCase()
                            })
                        });
                    }
                } catch (error) {
                    console.error(`Error uploading ${file.name}:`, error);
                }
            }
            
            // Refresh file list to get actual status from Firestore
            await loadModelFiles(model.id);
            showNotification('Files uploaded and processing started', 'success');
            
            // Poll for status updates until all files are ready/failed
            const modelIdForPolling = model.id;
            const pollInterval = setInterval(async () => {
                try {
                    const response = await fetch(`/api/personal-agent/files?modelId=${encodeURIComponent(modelIdForPolling)}`);
                    if (response.ok) {
                        const data = await response.json();
                        const files = data.files || [];
                        const processingFiles = files.filter(f => f.status === 'processing');
                        
                        // Update UI
                        if (currentModelId === modelIdForPolling) {
                            renderFileList(files);
                        }
                        
                        // Stop polling when no files are processing
                        if (processingFiles.length === 0) {
                            clearInterval(pollInterval);
                            const readyFiles = files.filter(f => f.status === 'ready');
                            const failedFiles = files.filter(f => f.status === 'failed');
                            if (failedFiles.length > 0) {
                                showNotification(`${failedFiles.length} file(s) failed to process`, 'error');
                            } else if (readyFiles.length > 0) {
                                showNotification(`${readyFiles.length} file(s) ready!`, 'success');
                            }
                        }
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                }
            }, 3000); // Poll every 3 seconds
            
            // Auto-stop polling after 5 minutes
            setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
        }
    } catch (error) {
        console.error('Error creating model:', error);
        showNotification('Failed to create agent: ' + error.message, 'error');
    }
}

// Toggle model visibility
async function toggleModelVisibility(modelId, isPublic) {
    if (!currentWalletAddress) return;
    
    try {
        const response = await fetch(`/api/personal-agent/models/${modelId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ownerAddress: currentWalletAddress.toLowerCase(),
                isPublic
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to update agent' }));
            throw new Error(errorData.error || 'Failed to update agent');
        }
        
        showNotification(`Agent set to ${isPublic ? 'public' : 'private'}`, 'success');
        await loadModels();
        if (currentModelId === modelId) {
            await loadModelDetails(modelId);
        }
    } catch (error) {
        console.error('Error updating model visibility:', error);
        showNotification('Failed to update agent visibility: ' + error.message, 'error');
    }
}

// Delete agent
async function deleteModel(modelId) {
    if (!confirm('Are you sure you want to delete this agent? This will also delete all associated files.')) {
        return;
    }
    
    if (!currentWalletAddress) return;
    
    try {
        const response = await fetch(`/api/personal-agent/models/${modelId}?ownerAddress=${encodeURIComponent(currentWalletAddress.toLowerCase())}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete agent' }));
            throw new Error(errorData.error || 'Failed to delete agent');
        }
        
        showNotification('Agent deleted successfully', 'success');
        currentModelId = null;
        await loadModels();
        document.getElementById('model-details').innerHTML = '<div class="pa-empty-state"><p>Select an agent to view details and manage files</p></div>';
    } catch (error) {
        console.error('Error deleting agent:', error);
        showNotification('Failed to delete agent: ' + error.message, 'error');
    }
}

// Open edit model modal
function openEditModelModal(modelId) {
    // Get wallet address synchronously
    const walletAddress = getWalletAddress();
    
    if (!walletAddress) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    // Update global variable if we found it elsewhere
    if (!currentWalletAddress && walletAddress) {
        currentWalletAddress = walletAddress;
    }
    
    // Find the model data
    const model = models.find(m => m.id === modelId);
    if (!model) {
        showNotification('Agent not found', 'error');
        return;
    }
    
    // Check ownership
    if (model.ownerAddress && model.ownerAddress.toLowerCase() !== currentWalletAddress.toLowerCase()) {
        showNotification('You do not have permission to edit this agent', 'error');
        return;
    }
    
    const modal = document.getElementById('editModelModal');
    if (modal) {
        // Populate form with current model data
        document.getElementById('editModelPurposeInput').value = model.purpose || '';
        document.getElementById('editModelUseCaseInput').value = model.useCase || '';
        document.getElementById('editModelSystemPromptInput').value = model.systemPrompt || '';
        document.getElementById('editModelCategoryInput').value = model.category || '';
        document.getElementById('editModelIndustryInput').value = model.industry || '';
        document.getElementById('editModelTokenPriceInput').value = model.tokenPrice !== null && model.tokenPrice !== undefined ? model.tokenPrice : '2';
        
        // Store modelId for update function
        modal.dataset.modelId = modelId;
        modal.classList.add('show');
        
        // Update default prompt preview with actual model name
        updateEditModelDefaultPromptPreview();
    }
}

// Close edit model modal
function closeEditModelModal() {
    const modal = document.getElementById('editModelModal');
    if (modal) {
        modal.classList.remove('show');
        delete modal.dataset.modelId;
    }
}

// Update model
async function updateModel() {
    if (!currentWalletAddress) {
        showNotification('Wallet not connected', 'error');
        return;
    }
    
    const modal = document.getElementById('editModelModal');
    if (!modal || !modal.dataset.modelId) {
        showNotification('Agent ID not found', 'error');
        return;
    }
    
    const modelId = modal.dataset.modelId;
    
    try {
        const tokenPriceInput = document.getElementById('editModelTokenPriceInput').value.trim();
        const tokenPrice = tokenPriceInput ? parseFloat(tokenPriceInput) : null;
        
        const response = await fetch(`/api/personal-agent/models/${modelId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ownerAddress: currentWalletAddress.toLowerCase(),
                purpose: document.getElementById('editModelPurposeInput').value.trim() || null,
                useCase: document.getElementById('editModelUseCaseInput').value.trim() || null,
                systemPrompt: document.getElementById('editModelSystemPromptInput').value.trim() || null,
                category: document.getElementById('editModelCategoryInput').value.trim() || null,
                industry: document.getElementById('editModelIndustryInput').value.trim() || null,
                tokenPrice: tokenPrice
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to update agent' }));
            throw new Error(errorData.error || 'Failed to update agent');
        }
        
        const updatedModel = await response.json();
        console.log('✅ Model updated successfully:', updatedModel);
        showNotification('Agent updated successfully', 'success');
        closeEditModelModal();
        
        // Reload models list and refresh details
        await loadModels();
        if (currentModelId === modelId) {
            await loadModelDetails(modelId);
        }
    } catch (error) {
        console.error('Error updating model:', error);
        showNotification('Failed to update agent: ' + error.message, 'error');
    }
}

// ========== File Management ==========

// Open upload file modal
function openUploadFileModal() {
    if (!currentModelId) {
        showNotification('Please select an agent first', 'error');
        return;
    }
    
    const modal = document.getElementById('uploadFileModal');
    if (modal) {
        modal.classList.add('show');
        selectedFiles = [];
        renderFilePreview();
        document.getElementById('uploadBtn').disabled = true;
    }
}

// Close upload file modal
function closeUploadFileModal() {
    const modal = document.getElementById('uploadFileModal');
    if (modal) {
        modal.classList.remove('show');
        selectedFiles = [];
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
        // Fix: Use correct ID (filePreview, not file-preview)
        const preview = document.getElementById('filePreview');
        if (preview) {
            preview.innerHTML = '';
        }
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Upload';
        }
    }
}

// Handle file select
async function handleFileSelect(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
        console.log('⚠️ No files selected');
        return;
    }
    
    console.log(`📁 Selected ${files.length} file(s):`, files.map(f => f.name));
    
    // Add new files to selectedFiles array (avoid duplicates)
    const newFiles = files.filter(file => 
        !selectedFiles.some(existing => 
            existing.name === file.name && 
            existing.size === file.size && 
            existing.lastModified === file.lastModified
        )
    );
    
    if (newFiles.length === 0) {
        console.log('⚠️ All selected files are already in the list');
        // Still clear the input even if files are duplicates
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
        return;
    }
    
    selectedFiles = [...selectedFiles, ...newFiles];
    renderFilePreview();
    
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.disabled = selectedFiles.length === 0;
        console.log(`✅ Upload button ${uploadBtn.disabled ? 'disabled' : 'enabled'}`);
    }
    
    // Clear the input AFTER a longer delay to ensure file dialog is fully closed
    // This prevents the file dialog from reopening
    setTimeout(() => {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
            console.log('✅ File input cleared');
        }
    }, 500);
}

// Render file preview
function renderFilePreview() {
    // Fix: Use correct ID (filePreview, not file-preview)
    const preview = document.getElementById('filePreview');
    if (!preview) {
        console.error('❌ File preview element not found (id="filePreview")');
        return;
    }
    
    if (selectedFiles.length === 0) {
        preview.innerHTML = '';
        return;
    }
    
    preview.innerHTML = selectedFiles.map((file, index) => `
        <div class="pa-file-preview-item">
            <span class="pa-file-preview-item-name">${escapeHtml(file.name)}</span>
            <span class="pa-file-preview-item-size">${formatFileSize(file.size)}</span>
            <button class="pa-file-preview-item-remove" onclick="removeFileFromPreview(${index})" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
    
    console.log(`✅ Rendered ${selectedFiles.length} file(s) in preview`);
}

// Remove file from preview
function removeFileFromPreview(index) {
    selectedFiles.splice(index, 1);
    renderFilePreview();
    document.getElementById('uploadBtn').disabled = selectedFiles.length === 0;
}

// Upload files
async function uploadFiles() {
    if (!currentModelId) {
        showNotification('Please select an agent first', 'error');
        return;
    }
    
    if (selectedFiles.length === 0) {
        showNotification('Please select files to upload', 'error');
        return;
    }
    
    if (!window.firebaseStorage) {
        console.error('❌ Firebase Storage not initialized');
        showNotification('Firebase Storage not initialized. Please refresh the page.', 'error');
        return;
    }
    
    console.log('✅ Firebase Storage is initialized');
    
    const uploadBtn = document.getElementById('uploadBtn');
    if (!uploadBtn) {
        showNotification('Upload button not found', 'error');
        return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="pa-spinner"></span> Uploading...';
    
    try {
        const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
        
        console.log(`📤 Starting upload of ${selectedFiles.length} file(s) for model ${currentModelId}`);
        
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            console.log(`📄 Uploading file ${i + 1}/${selectedFiles.length}: ${file.name}`);
            // Generate unique file ID
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 15);
            const fileId = `file_${timestamp}_${random}`;
            
            try {
                // Step 1: Upload file via backend API (which uploads to GCS)
                console.log(`📤 [${file.name}] Step 1: Uploading file via backend API...`);
                console.log(`   File ID: ${fileId}`);
                console.log(`   Model ID: ${currentModelId}`);
                console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
                console.log(`   Type: ${file.type || 'unknown'}`);
                
                // Create FormData to send file
                const formData = new FormData();
                formData.append('file', file);
                formData.append('fileId', fileId);
                formData.append('modelId', currentModelId);
                formData.append('ownerAddress', currentWalletAddress.toLowerCase());
                formData.append('filename', file.name);
                formData.append('mimeType', file.type || 'application/octet-stream');
                
                console.log(`   Sending request to /api/personal-agent/files/upload...`);
                const uploadResponse = await fetch('/api/personal-agent/files/upload', {
                    method: 'POST',
                    body: formData
                    // Note: Don't set Content-Type header, browser will set it with boundary
                });
                
                if (!uploadResponse.ok) {
                    const errorData = await uploadResponse.json().catch(() => ({ 
                        error: `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}` 
                    }));
                    const errorMsg = errorData.error || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
                    console.error(`❌ [${file.name}] Step 1 failed:`, errorMsg);
                    console.error(`   Response status: ${uploadResponse.status}`);
                    console.error(`   Response text:`, await uploadResponse.text().catch(() => 'Could not read response'));
                    throw new Error(errorMsg);
                }
                
                const uploadResult = await uploadResponse.json();
                console.log(`✅ [${file.name}] Step 1 complete: File uploaded to GCS`);
                console.log(`   Storage Path: ${uploadResult.storagePath}`);
                console.log(`   File Record ID: ${uploadResult.fileRecordId}`);
                console.log(`   File Record:`, uploadResult);
                
                // Immediately refresh file list to show 'processing' status
                // This ensures the file appears with 'processing' status right away
                await loadModelFiles(currentModelId);
                
                // Step 2: Call backend API for chunking and embedding (async, don't wait)
                console.log(`🔄 [${file.name}] Step 2: Starting RAG processing (async)...`);
                processFileForRAG(fileId, currentModelId, uploadResult.storagePath, file.name)
                    .then(result => {
                        console.log(`✅ [${file.name}] Step 2 complete: RAG processing finished`);
                        console.log(`   Result:`, result);
                        // Refresh file list to show updated status
                        if (currentModelId) {
                            loadModelFiles(currentModelId);
                        }
                    })
                    .catch(error => {
                        console.error(`❌ [${file.name}] Step 2 failed: RAG processing error`, error);
                        // Error is already handled in processFileForRAG function
                        // Refresh file list to show failed status
                        if (currentModelId) {
                            loadModelFiles(currentModelId);
                        }
                    });
            } catch (fileError) {
                console.error(`❌ [${file.name}] Upload failed:`, fileError);
                console.error(`   Error details:`, {
                    message: fileError.message,
                    stack: fileError.stack,
                    name: fileError.name
                });
                showNotification(`Failed to upload ${file.name}: ${fileError.message}`, 'error');
                // Continue with next file instead of stopping
            }
        }
        
        showNotification('Files uploaded successfully. Processing will begin shortly.', 'success');
        closeUploadFileModal();
        // Refresh file list to show all files with 'processing' status
        await loadModelFiles(currentModelId);
        
        // Set up smart polling to check file status updates
        // Poll every 5 seconds, but stop when no processing files remain
        const modelIdForPolling = currentModelId; // Capture current model ID
        let pollCount = 0;
        let lastProcessingCount = -1; // Track number of processing files
        const maxPolls = 120; // 10 minutes (120 * 5 seconds)
        const pollInterval = setInterval(async () => {
            pollCount++;
            
            // Stop polling if we've exceeded max polls
            if (pollCount > maxPolls) {
                clearInterval(pollInterval);
                console.log('⏹️  Stopped polling: Max polls reached');
                return;
            }
            
            // Stop polling if user switched to a different model
            if (currentModelId !== modelIdForPolling) {
                clearInterval(pollInterval);
                console.log('⏹️  Stopped polling: User switched to different model');
                return;
            }
            
            // Refresh file list to check for status updates
            try {
                const response = await fetch(`/api/personal-agent/files?modelId=${encodeURIComponent(currentModelId)}`, {
                    headers: {
                        'X-Polling-Request': 'true' // Mark as polling request
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    const files = data.files || [];
                    
                    // Check if there are any files still processing
                    const processingFiles = files.filter(f => f.status === 'processing');
                    const hasProcessingFiles = processingFiles.length > 0;
                    
                    // Only update UI if status changed (reduces unnecessary DOM updates)
                    if (processingFiles.length !== lastProcessingCount) {
                        renderFileList(files);
                        lastProcessingCount = processingFiles.length;
                    }
                    
                    // Stop polling if no files are processing
                    if (!hasProcessingFiles) {
                        clearInterval(pollInterval);
                        console.log('⏹️  Stopped polling: No processing files remaining');
                        // Final UI update
                        renderFileList(files);
                        return;
                    }
                }
            } catch (error) {
                console.error('Error during polling:', error);
            }
        }, 5000); // Poll every 5 seconds
    } catch (error) {
        console.error('❌ Error in uploadFiles:', error);
        showNotification('Failed to upload files: ' + error.message, 'error');
    } finally {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload';
        }
    }
}

// Process file for RAG (chunking and embedding)
async function processFileForRAG(fileId, modelId, storagePath, filename) {
    try {
        console.log(`🔄 [${filename}] Starting RAG processing...`);
        console.log(`   File ID: ${fileId}`);
        console.log(`   Model ID: ${modelId}`);
        console.log(`   Storage Path: ${storagePath}`);
        
        // Call backend API endpoint
        const response = await fetch('/api/process-rag-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fileId,
                modelId,
                storagePath,
                filename,
                ownerAddress: currentWalletAddress.toLowerCase()
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ 
                error: `HTTP ${response.status}: ${response.statusText}` 
            }));
            const errorMsg = errorData.error || `Failed to process file (HTTP ${response.status})`;
            console.error(`❌ [${filename}] RAG processing failed:`, errorMsg);
            throw new Error(errorMsg);
        }
        
        const result = await response.json();
        console.log(`✅ [${filename}] RAG processing completed successfully`);
        console.log(`   Chunks processed: ${result.chunksProcessed}/${result.totalChunks}`);
        console.log(`   Duration: ${result.duration}`);
        console.log(`   Status: ${result.status}`);
        
        if (result.errors && result.errors.length > 0) {
            console.warn(`⚠️ [${filename}] Some chunks had errors:`, result.errors);
        }
        
        // Refresh file list if viewing this model
        if (currentModelId === modelId) {
            await loadModelFiles(modelId);
        }
        
        return result;
    } catch (error) {
        console.error(`❌ [${filename}] RAG processing error:`, error);
        console.error(`   Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Update file status to failed via backend API
        try {
            console.log(`📝 [${filename}] Updating file status to 'failed'...`);
            const updateResponse = await fetch(`/api/personal-agent/files/${fileId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'failed',
                    error: error.message,
                    ownerAddress: currentWalletAddress.toLowerCase()
                })
            });
            
            if (updateResponse.ok) {
                console.log(`✅ [${filename}] File status updated to 'failed'`);
            } else {
                console.warn(`⚠️ [${filename}] Failed to update file status via API:`, updateResponse.status);
            }
            
            // Refresh file list to show error
            if (currentModelId === modelId) {
                await loadModelFiles(modelId);
            }
        } catch (updateError) {
            console.error(`❌ [${filename}] Error updating file status:`, updateError);
        }
        
        throw error;
    }
}

// Download/view file - generates signed URL and opens in new tab
async function downloadFile(fileId, filename) {
    try {
        showNotification('Opening file...', 'info');
        
        const response = await fetch(`/api/personal-agent/files/${fileId}/download`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get download URL');
        }
        
        const data = await response.json();
        
        if (data.downloadUrl) {
            // Open the signed URL in a new tab
            window.open(data.downloadUrl, '_blank');
            showNotification(`Opening ${filename}`, 'success');
        } else {
            throw new Error('No download URL returned');
        }
    } catch (error) {
        console.error('Error downloading file:', error);
        showNotification(`Failed to open file: ${error.message}`, 'error');
    }
}

// Delete file
async function deleteFile(fileId, filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    if (!currentWalletAddress) return;
    
    // Optimistically remove file from UI immediately
    const fileList = document.getElementById('file-list');
    if (fileList) {
        const fileItems = fileList.querySelectorAll('.pa-file-item');
        fileItems.forEach(item => {
            const deleteBtn = item.querySelector('button[onclick*="deleteFile"]');
            if (deleteBtn && deleteBtn.getAttribute('onclick').includes(`'${fileId}'`)) {
                // Add fade-out animation
                item.style.transition = 'opacity 0.3s ease-out';
                item.style.opacity = '0';
                setTimeout(() => {
                    item.remove();
                    // If no files left, show empty state
                    if (fileList.querySelectorAll('.pa-file-item').length === 0) {
                        fileList.innerHTML = '<div class="pa-empty-state"><p>No files uploaded yet</p></div>';
                    }
                }, 300);
            }
        });
    }
    
    try {
        const response = await fetch(`/api/personal-agent/files/${fileId}?ownerAddress=${encodeURIComponent(currentWalletAddress.toLowerCase())}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete file' }));
            throw new Error(errorData.error || 'Failed to delete file');
        }
        
        showNotification('File deleted successfully', 'success');
        // Note: File is already removed from UI above, no need to reload
        // Background cleanup is happening on the server
    } catch (error) {
        console.error('Error deleting file:', error);
        showNotification('Failed to delete file: ' + error.message, 'error');
        // Reload files to restore UI state if deletion failed
        await loadModelFiles(currentModelId);
    }
}

// ========== Utility Functions ==========

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format date
function formatDate(timestamp) {
    if (!timestamp) return '';
    
    let date;
    
    // Handle Firestore Timestamp object (from API response)
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } 
    // Handle Firestore Timestamp object (serialized as {seconds, nanoseconds})
    else if (timestamp.seconds !== undefined) {
        date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    // Handle Timestamp object with _seconds and _nanoseconds (Firestore serialized format)
    else if (timestamp._seconds !== undefined) {
        date = new Date(timestamp._seconds * 1000 + (timestamp._nanoseconds || 0) / 1000000);
    }
    // Handle string or number
    else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
    }
    // Handle Date object
    else if (timestamp instanceof Date) {
        date = timestamp;
    }
    // Fallback: try to create Date from the value
    else {
        date = new Date(timestamp);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return ''; // Return empty string instead of "Invalid Date"
    }
    
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Show notification
function showNotification(message, type = 'info') {
    // Simple alert for now - can be replaced with a toast notification system
    alert(message);
}

// Expose functions to global scope
// ========== User Chats Functionality ==========

let selectedAgentForChat = null;
let userChatHistory = [];

// Track which public agents the user has interacted with
function getInteractedPublicAgents() {
    try {
        return JSON.parse(localStorage.getItem('interactedPublicAgents') || '[]');
    } catch {
        return [];
    }
}

function addInteractedPublicAgent(agentId) {
    const interacted = getInteractedPublicAgents();
    if (!interacted.includes(agentId)) {
        interacted.push(agentId);
        localStorage.setItem('interactedPublicAgents', JSON.stringify(interacted));
    }
}

// Load agents into dropdown when User Chats tab is opened
async function loadAgentsForChat() {
    try {
        // Load models from the same source as the model list
        await loadModels();
        
        // Also load public agents if not already loaded
        if (publicAgents.length === 0) {
            try {
                const response = await fetch('/api/user-agents?publicOnly=true');
                if (response.ok) {
                    const data = await response.json();
                    // Normalize: add `id` property (same as modelId) for consistency
                    publicAgents = (data.agents || []).map(a => ({ ...a, id: a.modelId }));
                }
            } catch (e) {
                console.warn('Could not load public agents:', e);
            }
        }
        
        // Render sidebar
        renderAgentSidebar();
        
        console.log(`✅ Loaded ${models.length} own agents + ${publicAgents.length} public agents for chat`);
    } catch (error) {
        console.error('Error loading agents for chat:', error);
    }
}

// Render agent sidebar
function renderAgentSidebar() {
    const myAgentsList = document.getElementById('myAgentsSidebarList');
    const publicAgentsList = document.getElementById('publicAgentsSidebarList');
    const myAgentsSection = document.getElementById('myAgentsSidebarSection');
    const publicAgentsSection = document.getElementById('publicAgentsSidebarSection');
    
    if (!myAgentsList || !publicAgentsList) return;
    
    // Render my agents
    if (models.length > 0) {
        myAgentsSection.style.display = 'block';
        const selectedId = selectedAgentForChat?.id;
        myAgentsList.innerHTML = models.map(model => `
            <div class="agent-sidebar-item ${selectedId === model.id ? 'active' : ''}" 
                 onclick="selectAgentFromSidebar('${model.id}', 'my')"
                 data-agent-id="${model.id}">
                <div class="agent-sidebar-avatar${model.forkedFrom ? ' forked' : ''}">${model.forkedFrom 
                    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path><path d="M12 12v3"></path></svg>'
                    : escapeHtml((model.name || 'A')[0].toUpperCase())}</div>
                <div class="agent-sidebar-info">
                    <div class="agent-sidebar-name">${escapeHtml(model.name || 'Unnamed')}</div>
                    <div class="agent-sidebar-purpose">${escapeHtml(model.purpose?.slice(0, 40) || 'No description')}${model.purpose?.length > 40 ? '...' : ''}</div>
                </div>
            </div>
        `).join('');
    } else {
        myAgentsSection.style.display = 'block';
        myAgentsList.innerHTML = '<div style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">No agents yet</div>';
    }
    
    // Filter public agents: only show ones the user has interacted with (clicked "Chat with this agent")
    const interactedAgentIds = getInteractedPublicAgents();
    const interactedPublicAgents = publicAgents.filter(agent => {
        // Must be in the interacted list
        if (!interactedAgentIds.includes(agent.id)) return false;
        // Exclude own agents
        if (currentWalletAddress && agent.ownerAddress?.toLowerCase() === currentWalletAddress.toLowerCase()) return false;
        return true;
    });
    
    // Render public agents (only interacted ones)
    if (interactedPublicAgents.length > 0) {
        publicAgentsSection.style.display = 'block';
        const selectedId = selectedAgentForChat?.id;
        publicAgentsList.innerHTML = interactedPublicAgents.map(agent => `
            <div class="agent-sidebar-item ${selectedId === agent.id ? 'active' : ''}" 
                 onclick="selectAgentFromSidebar('${agent.id}', 'public')"
                 data-agent-id="${agent.id}">
                <div class="agent-sidebar-avatar public">${escapeHtml((agent.name || 'A')[0].toUpperCase())}</div>
                <div class="agent-sidebar-info">
                    <div class="agent-sidebar-name">${escapeHtml(agent.name || 'Unnamed')}</div>
                    <div class="agent-sidebar-purpose">${escapeHtml(agent.purpose?.slice(0, 40) || 'No description')}${agent.purpose?.length > 40 ? '...' : ''}</div>
                </div>
            </div>
        `).join('');
    } else {
        publicAgentsSection.style.display = 'block';
        publicAgentsList.innerHTML = '<div style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">Chat with agents from Agentverse to see them here</div>';
    }
}

// Select agent from sidebar
function selectAgentFromSidebar(agentId, type) {
    // Find the agent by ID (unique, not by name which can collide)
    let agent = null;
    if (type === 'my') {
        agent = models.find(m => m.id === agentId);
    } else {
        agent = publicAgents.find(a => a.id === agentId);
    }
    
    if (!agent) {
        // Fallback: check both arrays by ID
        agent = models.find(m => m.id === agentId) || publicAgents.find(a => a.id === agentId);
    }
    
    if (!agent) {
        showNotification('Agent not found', 'error');
        return;
    }
    
    selectedAgentForChat = agent;
    
    // 移动端：切换到聊天区
    if (isMobileView()) {
        showChatAreaMobile();
    }
    
    // Update sidebar active state (by ID, not name)
    document.querySelectorAll('.agent-sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.agentId === agentId) {
            item.classList.add('active');
        }
    });
    
    // Update header
    const header = document.getElementById('selectedAgentHeader');
    const avatar = document.getElementById('selectedAgentAvatar');
    const nameEl = document.getElementById('selectedAgentName');
    const purposeEl = document.getElementById('selectedAgentPurpose');
    
    if (header) header.style.display = 'block';
    if (avatar) {
        if (agent.forkedFrom) {
            // Show fork icon for forked agents
            avatar.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path><path d="M12 12v3"></path></svg>';
            avatar.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        } else {
            // Show first letter for regular agents
            avatar.textContent = (agent.name || 'A')[0].toUpperCase();
            avatar.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
        }
    }
    if (nameEl) nameEl.textContent = agent.name;
    if (purposeEl) purposeEl.textContent = agent.purpose || 'No description available';
    
    // Enable chat input
    const input = document.getElementById('userChatInput');
    const sendBtn = document.getElementById('userChatSendBtn');
    const forkBtn = document.getElementById('userChatForkBtn');
    if (input) {
        input.disabled = false;
        input.placeholder = `Message ${agent.name}...`;
        input.focus();
    }
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        // 在移动端显示纸飞机图标
        if (isMobileView()) {
            sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
        } else {
            sendBtn.textContent = 'Send';
        }
    }
    
    // Check if agent belongs to current user
    const currentWallet = getWalletAddress();
    const isOwnAgent = type === 'my' || (currentWallet && agent.ownerAddress?.toLowerCase() === currentWallet.toLowerCase());
    
    // Show/hide fork button based on ownership and device type
    if (forkBtn) {
        if (isOwnAgent || isMobileView()) {
            // Hide fork button for own agents or on mobile
            forkBtn.style.display = 'none';
        } else {
            // Show fork button for public agents on desktop
            forkBtn.style.display = 'flex';
            forkBtn.disabled = false;
            forkBtn.style.opacity = '1';
        }
    }
    
    // Load chat history (use id for unique storage)
    loadUserChatHistory(agent.id);
    
    console.log(`✅ Selected agent: ${agent.name} (id: ${uniqueAgentId})`);
}

// ========== Public Agents Functionality ==========

let publicAgents = [];

// Load public agents
async function loadPublicAgents() {
    const listDiv = document.getElementById('public-agents-list');
    if (!listDiv) return;
    
    listDiv.innerHTML = '<div class="pa-empty-state"><p>Loading Agentverse...</p></div>';
    
    try {
        const response = await fetch('/api/user-agents?publicOnly=true');
        if (!response.ok) {
            throw new Error('Failed to load public agents');
        }
        
        const data = await response.json();
        // Normalize: add `id` property (same as modelId) for consistency
        // Calculate total usage as accessCount (direct) + forkedUsage
        publicAgents = (data.agents || []).map(a => ({
            ...a,
            id: a.modelId,
            directUsage: a.accessCount || 0,
            forkedUsageCount: a.forkedUsage || 0,
            totalUsage: (a.accessCount || 0) + (a.forkedUsage || 0)
        }));
        
        // Sort by total usage descending (most used first)
        publicAgents.sort((a, b) => (b.totalUsage || 0) - (a.totalUsage || 0));
        
        renderPublicAgentsList(publicAgents);
        console.log(`✅ Loaded ${publicAgents.length} public agents (sorted by uses)`);
    } catch (error) {
        console.error('Error loading public agents:', error);
        listDiv.innerHTML = '<div class="pa-empty-state"><p>Failed to load Agentverse</p></div>';
    }
}

// Filter public agents based on search input
function filterPublicAgents() {
    const searchInput = document.getElementById('agentverseSearchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase().trim();
    
    if (!query) {
        // If search is empty, show all agents
        renderPublicAgentsList(publicAgents);
        return;
    }
    
    // Filter agents by name, purpose, category, or industry
    const filteredAgents = publicAgents.filter(agent => {
        const name = (agent.name || '').toLowerCase();
        const purpose = (agent.purpose || '').toLowerCase();
        const category = (agent.category || '').toLowerCase();
        const industry = (agent.industry || '').toLowerCase();
        const useCase = (agent.useCase || '').toLowerCase();
        
        return name.includes(query) || 
               purpose.includes(query) || 
               category.includes(query) || 
               industry.includes(query) ||
               useCase.includes(query);
    });
    
    renderPublicAgentsList(filteredAgents);
    
    // Show a message if no results
    if (filteredAgents.length === 0) {
        const listDiv = document.getElementById('public-agents-list');
        if (listDiv) {
            listDiv.innerHTML = `<div class="pa-empty-state"><p>No agents found matching "${escapeHtml(query)}"</p></div>`;
        }
    }
}

// Render public agents list
function renderPublicAgentsList(agents) {
    const listDiv = document.getElementById('public-agents-list');
    if (!listDiv) return;
    
    if (agents.length === 0) {
        listDiv.innerHTML = '<div class="pa-empty-state"><p>No agents in the Agentverse yet. Be the first to share an agent!</p></div>';
        return;
    }
    
    listDiv.innerHTML = agents.map(agent => `
        <div class="pa-model-item" onclick="viewPublicAgentDetails('${agent.id}')" style="cursor: pointer;">
            <div class="pa-model-item-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 class="pa-model-item-name">${escapeHtml(agent.name || 'Unnamed Agent')}</h3>
                <span style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                    </svg>
                    ${agent.totalUsage || 0}
                </span>
            </div>
            <div class="pa-model-item-meta" style="margin-bottom: 8px;">
                <span class="pa-model-item-badge public">Public</span>
                <span style="font-size: 12px; color: #9ca3af;">by ${escapeHtml(agent.ownerAddress ? agent.ownerAddress.slice(0, 6) + '...' + agent.ownerAddress.slice(-4) : 'Unknown')}</span>
            </div>
            ${agent.purpose ? `<p style="font-size: 13px; color: #6b7280; margin-bottom: 8px; line-height: 1.4;">${escapeHtml(agent.purpose)}</p>` : ''}
            ${agent.category ? `<span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-right: 4px;">${escapeHtml(agent.category)}</span>` : ''}
            ${agent.industry ? `<span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 11px; padding: 2px 8px; border-radius: 4px;">${escapeHtml(agent.industry)}</span>` : ''}
        </div>
    `).join('');
}

// View public agent details (read-only dashboard)
function viewPublicAgentDetails(agentId) {
    const agent = publicAgents.find(a => a.id === agentId);
    if (!agent) {
        showNotification('Agent not found', 'error');
        return;
    }
    
    // Check if this is the user's own agent
    const isOwner = currentWalletAddress && 
                    agent.ownerAddress?.toLowerCase() === currentWalletAddress.toLowerCase();
    
    // Show the agent details modal/panel
    showPublicAgentDetailsPanel(agent, isOwner);
}

// Show public agent details panel
function showPublicAgentDetailsPanel(agent, isOwner) {
    // Create or get the modal
    let modal = document.getElementById('publicAgentDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'publicAgentDetailsModal';
        modal.className = 'pa-modal-overlay';
        document.body.appendChild(modal);
    }
    
    const ownerDisplay = agent.ownerAddress 
        ? agent.ownerAddress.slice(0, 6) + '...' + agent.ownerAddress.slice(-4) 
        : 'Unknown';
    
    modal.innerHTML = `
        <div class="pa-modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <div class="pa-modal-header" style="margin-bottom: 8px;">
                <h2>${escapeHtml(agent.name || 'Unnamed Agent')}</h2>
                <button class="pa-modal-close" onclick="closePublicAgentDetailsModal()">&times;</button>
            </div>
            
            <div style="padding: 0 24px 24px;">
                <div style="display: flex; gap: 8px; margin-top: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;">
                    <span class="pa-model-item-badge public">Public</span>
                    <span style="font-size: 13px; color: #6b7280;">Created by ${ownerDisplay}</span>
                    ${isOwner ? '<span style="background: #dbeafe; color: #1d4ed8; font-size: 11px; padding: 2px 8px; border-radius: 4px;">You own this agent</span>' : ''}
                </div>
                
                ${agent.category || agent.industry ? `
                    <div style="margin-bottom: 16px;">
                        ${agent.category ? `<span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 12px; padding: 4px 10px; border-radius: 4px; margin-right: 6px;">${escapeHtml(agent.category)}</span>` : ''}
                        ${agent.industry ? `<span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 12px; padding: 4px 10px; border-radius: 4px;">${escapeHtml(agent.industry)}</span>` : ''}
                    </div>
                ` : ''}
                
                ${agent.purpose ? `
                    <div style="margin-bottom: 16px;">
                        <h4 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Purpose</h4>
                        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">${escapeHtml(agent.purpose)}</p>
                    </div>
                ` : ''}
                
                ${agent.useCase ? `
                    <div style="margin-bottom: 16px;">
                        <h4 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Use Case</h4>
                        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">${escapeHtml(agent.useCase)}</p>
                    </div>
                ` : ''}
                
                <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px;">
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Token Price</div>
                        <div style="font-size: 18px; font-weight: 600; color: #111827;">${agent.tokenPrice ?? 'N/A'}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Fork Price</div>
                        <div style="font-size: 18px; font-weight: 600; color: #111827;">${agent.forkedUsagePrice ?? 1}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Direct Usage</div>
                        <div style="font-size: 18px; font-weight: 600; color: #8b5cf6;">${agent.accessCount ?? 0}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Forked Usage</div>
                        <div style="font-size: 18px; font-weight: 600; color: #10b981;">${agent.forkedUsage ?? 0}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Forked Count</div>
                        <div style="font-size: 18px; font-weight: 600; color: #f59e0b;">${agent.forkedCount ?? 0}</div>
                    </div>
                </div>
                
                <div style="padding: 16px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 8px; margin-bottom: 16px;">
                    <div style="font-size: 13px; color: rgba(255,255,255,0.9); margin-bottom: 4px;">Total Usage</div>
                    <div style="font-size: 24px; font-weight: 700; color: #ffffff;">${(agent.accessCount || 0) + (agent.forkedUsage || 0)}</div>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: 24px;">
                    <button class="pa-btn-primary" onclick="chatWithPublicAgent('${agent.id}'); closePublicAgentDetailsModal();" style="flex: 1;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Chat with this Agent
                    </button>
                    ${/* Allow owners to fork their own agents, remove true to disable */ true || !isOwner ? `
                        <button class="pa-btn-success" onclick="showForkConfirmModal('${agent.id}', '${escapeHtml(agent.name)}');" style="flex: 1;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                                <circle cx="12" cy="18" r="3"></circle>
                                <circle cx="6" cy="6" r="3"></circle>
                                <circle cx="18" cy="6" r="3"></circle>
                                <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
                                <path d="M12 12v3"></path>
                            </svg>
                            Fork Agent
                        </button>
                    ` : ''}
                    ${isOwner ? `
                        <button class="pa-btn-secondary" onclick="closePublicAgentDetailsModal(); switchTab('agent-creator'); setTimeout(() => selectModel('${agent.id}'), 100);">
                            Edit
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

// Close public agent details modal
function closePublicAgentDetailsModal() {
    const modal = document.getElementById('publicAgentDetailsModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Show agent info panel (for User Chats header - no action buttons)
function showAgentInfoPanel(agent) {
    if (!agent) return;
    
    let modal = document.getElementById('agentInfoModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'agentInfoModal';
        modal.className = 'pa-modal-overlay';
        document.body.appendChild(modal);
    }
    
    const ownerDisplay = agent.ownerAddress 
        ? agent.ownerAddress.slice(0, 6) + '...' + agent.ownerAddress.slice(-4) 
        : 'Unknown';
    
    const isPublic = agent.isPublic !== false;
    const isForked = !!agent.forkedFrom;
    
    // Check if agent belongs to current user
    const currentWallet = getWalletAddress();
    const isOwnAgent = currentWallet && agent.ownerAddress?.toLowerCase() === currentWallet.toLowerCase();
    
    modal.innerHTML = `
        <div class="pa-modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <div class="pa-modal-header" style="margin-bottom: 8px;">
                <h2>${escapeHtml(agent.name || 'Unnamed Agent')}</h2>
                <button class="pa-modal-close" onclick="closeAgentInfoModal()">&times;</button>
            </div>
            
            <div style="padding: 0 24px 24px;">
                <div style="display: flex; gap: 8px; margin-top: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;">
                    ${isPublic ? '<span class="pa-model-item-badge public">Public</span>' : '<span class="pa-model-item-badge private">Private</span>'}
                    ${isForked ? '<span style="background: #d1fae5; color: #059669; font-size: 11px; padding: 2px 8px; border-radius: 4px;">Forked</span>' : ''}
                    <span style="font-size: 13px; color: #6b7280;">Created by ${ownerDisplay}</span>
                </div>
                
                ${agent.forkedFrom ? `
                    <div style="margin-bottom: 16px; padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                        <span style="font-size: 13px; color: #166534;">🔀 Forked from: <strong>${escapeHtml(agent.forkedFromName || 'Unknown Agent')}</strong>${agent.forkedFromOwner ? ` <span style="color: #6b7280;">by ${agent.forkedFromOwner.slice(0, 6) + '...' + agent.forkedFromOwner.slice(-4)}</span>` : ''}</span>
                    </div>
                ` : ''}
                
                ${agent.category || agent.industry ? `
                    <div style="margin-bottom: 16px;">
                        ${agent.category ? `<span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 12px; padding: 4px 10px; border-radius: 4px; margin-right: 6px;">${escapeHtml(agent.category)}</span>` : ''}
                        ${agent.industry ? `<span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 12px; padding: 4px 10px; border-radius: 4px;">${escapeHtml(agent.industry)}</span>` : ''}
                    </div>
                ` : ''}
                
                ${agent.purpose ? `
                    <div style="margin-bottom: 16px;">
                        <h4 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Purpose</h4>
                        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">${escapeHtml(agent.purpose)}</p>
                    </div>
                ` : ''}
                
                ${agent.useCase ? `
                    <div style="margin-bottom: 16px;">
                        <h4 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Use Case</h4>
                        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">${escapeHtml(agent.useCase)}</p>
                    </div>
                ` : ''}
                
                <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px;">
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Token Price</div>
                        <div style="font-size: 18px; font-weight: 600; color: #111827;">${agent.tokenPrice ?? 'N/A'}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Fork Price</div>
                        <div style="font-size: 18px; font-weight: 600; color: #111827;">${agent.forkedUsagePrice ?? 1}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Direct Usage</div>
                        <div style="font-size: 18px; font-weight: 600; color: #8b5cf6;">${agent.accessCount ?? 0}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Forked Usage</div>
                        <div style="font-size: 18px; font-weight: 600; color: #10b981;">${agent.forkedUsage ?? 0}</div>
                    </div>
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Forked Count</div>
                        <div style="font-size: 18px; font-weight: 600; color: #f59e0b;">${agent.forkedCount ?? 0}</div>
                    </div>
                </div>
                
                <div style="padding: 16px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 8px; margin-bottom: 16px;">
                    <div style="font-size: 13px; color: rgba(255,255,255,0.9); margin-bottom: 4px;">Total Usage</div>
                    <div style="font-size: 24px; font-weight: 700; color: #ffffff;">${(agent.accessCount || 0) + (agent.forkedUsage || 0)}</div>
                </div>
                
                ${!isOwnAgent ? `
                <button 
                    id="agentInfoForkBtn"
                    onclick="forkAgentFromInfoPanel('${agent.id}', '${(agent.name || 'Unnamed').replace(/'/g, "\\'")}');" 
                    style="width: 100%; padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px;"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path><path d="M12 12v3"></path></svg>
                    Fork this Agent
                </button>
                ` : ''}
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

// Close agent info modal
function closeAgentInfoModal() {
    const modal = document.getElementById('agentInfoModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Fork agent from User Chats
function forkCurrentChatAgent() {
    if (!selectedAgentForChat) {
        showNotification('No agent selected', 'error');
        return;
    }
    showForkConfirmModal(selectedAgentForChat.id, selectedAgentForChat.name);
}

// Fork agent from info panel
function forkAgentFromInfoPanel(agentId, agentName) {
    showForkConfirmModal(agentId, agentName);
}

// ========== Fork Agent Functionality ==========

let forkTargetModelId = null;
let forkTargetAgentName = null;

// Show fork confirmation modal
function showForkConfirmModal(modelId, agentName) {
    forkTargetModelId = modelId;
    forkTargetAgentName = agentName;
    
    const modal = document.getElementById('forkAgentModal');
    const nameSpan = document.getElementById('forkAgentName');
    
    if (nameSpan) {
        nameSpan.textContent = agentName;
    }
    
    if (modal) {
        modal.classList.add('show');
    }
    
    // Close the public agent details modal
    closePublicAgentDetailsModal();
}

// Close fork modal
function closeForkModal() {
    const modal = document.getElementById('forkAgentModal');
    if (modal) {
        modal.classList.remove('show');
    }
    forkTargetModelId = null;
    forkTargetAgentName = null;
}

// Fork the agent
async function forkAgent() {
    if (!forkTargetModelId) {
        showNotification('No agent selected to fork', 'error');
        return;
    }
    
    // Get wallet address synchronously
    const walletAddress = getWalletAddress();
    
    if (!walletAddress) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    console.log(`🔀 Forking agent ${forkTargetModelId} for wallet ${walletAddress}`);
    
    const forkBtn = document.getElementById('forkBtn');
    const originalBtnText = forkBtn?.innerHTML;
    
    try {
        // Show loading state
        if (forkBtn) {
            forkBtn.disabled = true;
            forkBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"></circle>
                </svg>
                Forking...
            `;
        }
        
        showNotification('Forking agent...', 'info');
        
        const response = await fetch('/api/personal-agent/fork', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sourceModelId: forkTargetModelId,
                ownerAddress: walletAddress.toLowerCase()
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fork agent');
        }
        
        showNotification(`Successfully forked "${forkTargetAgentName}"!`, 'success');
        
        // Close modals
        closeForkModal();
        closeAgentInfoModal();
        
        // Refresh my agents list
        await loadModels();
        
        // Switch to Agent Creator tab and select the new forked agent
        switchTab('model-creator');
        setTimeout(() => {
            if (data.newModelId) {
                selectModel(data.newModelId);
            }
        }, 200);
        
    } catch (error) {
        console.error('Fork error:', error);
        showNotification(`Failed to fork: ${error.message}`, 'error');
    } finally {
        // Restore button state
        if (forkBtn && originalBtnText) {
            forkBtn.disabled = false;
            forkBtn.innerHTML = originalBtnText;
        }
    }
}

// Chat with a public agent
function chatWithPublicAgent(agentId) {
    // Track this public agent as interacted
    addInteractedPublicAgent(agentId);
    
    // Switch to User Chats tab
    switchTab('user-chats');
    
    // Wait for tab to load, then select the agent from sidebar
    setTimeout(() => {
        // Find agent type by ID (check if it's in publicAgents)
        const isPublic = publicAgents.some(a => a.id === agentId);
        selectAgentFromSidebar(agentId, isPublic ? 'public' : 'my');
    }, 150);
}

// Try agent from dashboard - opens User Chats with the agent selected
function tryAgentFromDashboard(modelId, agentName) {
    console.log(`🚀 Trying agent: ${agentName} (${modelId})`);
    
    // Switch to User Chats tab
    switchTab('user-chats');
    
    // Wait for tab to load, then select the agent from sidebar
    setTimeout(() => {
        // For agents in "My Agents", they won't be in publicAgents
        const isPublic = publicAgents.some(a => a.id === modelId);
        selectAgentFromSidebar(modelId, isPublic ? 'public' : 'my');
        
        // Focus the chat input
        const input = document.getElementById('userChatInput');
        if (input) {
            input.focus();
        }
    }, 150);
}

// Handle agent selection
function handleAgentSelection() {
    const selector = document.getElementById('agentSelector');
    const agentName = selector?.value;
    const input = document.getElementById('userChatInput');
    const sendBtn = document.getElementById('userChatSendBtn');
    const infoDiv = document.getElementById('selectedAgentInfo');
    const nameDiv = document.getElementById('selectedAgentName');
    const purposeDiv = document.getElementById('selectedAgentPurpose');
    const messagesDiv = document.getElementById('userChatMessages');
    
    if (!agentName) {
        selectedAgentForChat = null;
        if (input) input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (infoDiv) infoDiv.style.display = 'none';
        if (messagesDiv) {
            messagesDiv.innerHTML = '<div style="text-align: center; color: #9ca3af; margin-top: 40px;"><p>Select an agent from the dropdown above to start chatting</p></div>';
        }
        return;
    }
    
    // Find the selected model (check both user's models and public agents)
    let model = models.find(m => m.name === agentName);
    if (!model) {
        // Also check public agents array for access with public agents
        model = publicAgents.find(a => a.name === agentName);
    }
    if (!model) {
        console.error('Selected agent not found:', agentName);
        showNotification('Agent not found. Try refreshing the page.', 'error');
        return;
    }
    
    selectedAgentForChat = model;
    
    // Enable input and button
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    
    // Show agent info
    if (infoDiv) infoDiv.style.display = 'block';
    if (nameDiv) nameDiv.textContent = model.name;
    if (purposeDiv) purposeDiv.textContent = model.purpose || 'No description available';
    
    // Load chat history for this agent (use id for unique storage)
    loadUserChatHistory(model.id);
    
    // Focus input
    if (input) input.focus();
}

// Auto-resize chat input textarea
function autoResizeChatInput(textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height (min 44px, max 240px for ~10 lines)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 44), 240);
    textarea.style.height = newHeight + 'px';
}

// Handle chat input key down events (Enter to send, Shift+Enter for new line)
function handleChatInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleUserChatSend();
    }
}

// Handle sending a chat message
async function handleUserChatSend() {
    if (!selectedAgentForChat) {
        alert('Please select an agent first');
        return;
    }
    
    const input = document.getElementById('userChatInput');
    const message = input?.value.trim();
    
    if (!message) return;
    
    // Clear input and reset height
    if (input) {
        input.value = '';
        input.style.height = 'auto';
        input.style.height = '44px';
    }
    
    // Disable input while sending
    const sendBtn = document.getElementById('userChatSendBtn');
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    
    // Add user message to chat
    appendUserChatMessage('user', message);
    
    // Add to history
    userChatHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // Show loading message
    const loadingId = appendUserChatMessage('assistant', '');
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) {
        loadingEl.innerHTML = '<span style="opacity:0.6;">Generating...</span>';
    }
    
    try {
        // Ensure API Manager is available
        if (!window.apiManager) {
            throw new Error('API Manager not available. Please ensure api-manager.js is loaded.');
        }
        
        // Build system prompt from agent data
        const systemPrompt = selectedAgentForChat.purpose 
            ? `You are ${selectedAgentForChat.name}. ${selectedAgentForChat.purpose}\n\nUse Case: ${selectedAgentForChat.useCase || 'General assistance'}`
            : `You are ${selectedAgentForChat.name}, a helpful AI assistant.`;
        
        // Call the backend API (backend will handle RAG automatically)
        let fullResponse = '';
        
        // Get agent id for unique identification
        const agentModelId = selectedAgentForChat.id;
        
        await window.apiManager.streamModelRequest(
            selectedAgentForChat.name, // Agent name for display/logging
            message,
            { systemPrompt: systemPrompt, modelId: agentModelId }, // Pass modelId for Firestore lookup
            {
                onStart() {
                    console.log('🚀 Starting chat with agent:', selectedAgentForChat.name, '| modelId:', agentModelId);
                },
                onDelta(delta) {
                    fullResponse += delta;
                    // Update UI in real-time (streaming)
                    if (loadingEl) {
                        loadingEl.innerHTML = renderMarkdownSafe(fullResponse, true) || '<span style="opacity:0.6;">Generating...</span>';
                        // Auto-scroll
                        const messagesDiv = document.getElementById('userChatMessages');
                        if (messagesDiv) {
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        }
                    }
                },
                onDone(finalText) {
                    fullResponse = finalText || fullResponse;
                    if (loadingEl) {
                        loadingEl.innerHTML = renderMarkdownSafe(fullResponse, false);
                    }
                    
                    // Add to history
                    userChatHistory.push({
                        role: 'assistant',
                        content: fullResponse,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Save history (use id for unique storage)
                    saveUserChatHistory(selectedAgentForChat.id);
                    
                    // Re-enable input
                    if (input) input.disabled = false;
                    if (sendBtn) sendBtn.disabled = false;
                    if (input) input.focus();
                },
                onError(error) {
                    console.error('Chat error:', error);
                    if (loadingEl) {
                        loadingEl.innerHTML = `<span style="color: #ef4444;">Error: ${escapeHtml(error.message || 'Failed to get response')}</span>`;
                    }
                    
                    // Re-enable input
                    if (input) input.disabled = false;
                    if (sendBtn) sendBtn.disabled = false;
                }
            }
        );
    } catch (error) {
        console.error('Error sending message:', error);
        if (loadingEl) {
            loadingEl.innerHTML = `<span style="color: #ef4444;">Error: ${escapeHtml(error.message || 'Failed to send message')}</span>`;
        }
        
        // Re-enable input
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

// Append message to chat
function appendUserChatMessage(role, content) {
    const messagesDiv = document.getElementById('userChatMessages');
    if (!messagesDiv) return null;
    
    // Clear placeholder if it exists
    if (messagesDiv.querySelector('div[style*="text-align: center"]')) {
        messagesDiv.innerHTML = '';
    }
    
    const messageId = 'userChatMsg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = role === 'user' ? 'user-chat-message user' : 'user-chat-message assistant';
    
    // 移动端消息占满宽度，桌面端最宽 75%
    const maxWidth = isMobileView() ? '100%' : '75%';
    const marginStyle = role === 'user' 
        ? `margin-left: auto; margin-right: 0;`
        : `margin-right: auto; margin-left: 0;`;
    
    messageEl.style.cssText = `
        margin-bottom: 16px;
        padding: ${role === 'user' ? '12px 16px' : '16px 20px 16px 28px'};
        max-width: ${maxWidth};
        width: fit-content;
        word-wrap: break-word;
        ${role === 'user' 
            ? `background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border-radius: 18px 18px 4px 18px; ${marginStyle}` 
            : `background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 18px 18px 18px 4px; ${marginStyle}`}
    `;
    
    if (content) {
        messageEl.innerHTML = renderMarkdownSafe(content, false);
    }
    
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageId;
}

// Load chat history for an agent (by modelId for uniqueness)
function loadUserChatHistory(agentId) {
    try {
        const stored = localStorage.getItem(`userChatHistory_${agentId}`);
        if (stored) {
            userChatHistory = JSON.parse(stored);
            
            // Clear messages
            const messagesDiv = document.getElementById('userChatMessages');
            if (messagesDiv) messagesDiv.innerHTML = '';
            
            // Render messages
            userChatHistory.forEach(msg => {
                appendUserChatMessage(msg.role, msg.content);
            });
        } else {
            userChatHistory = [];
            const messagesDiv = document.getElementById('userChatMessages');
            if (messagesDiv) {
                // Show empty state with predefined prompt buttons
                messagesDiv.innerHTML = `
                    <div id="predefinedPromptsContainer" style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 40px 20px;">
                        <p style="color: #9ca3af; margin-bottom: 24px; font-size: 15px;">Start a conversation with your agent</p>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: 500px;">
                            <button onclick="sendPredefinedPrompt('Summarize the key concepts from your knowledge base')" 
                                    style="padding: 12px 16px; border: none; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); cursor: pointer; font-size: 13px; color: #fff; transition: all 0.15s; text-align: center; min-width: 140px; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);"
                                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)';"
                                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(139, 92, 246, 0.3)';">
                                Summarize key<br>concepts
                            </button>
                            <button onclick="sendExplainPrompt()"
                                    style="padding: 12px 16px; border: none; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); cursor: pointer; font-size: 13px; color: #fff; transition: all 0.15s; text-align: center; min-width: 140px; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);"
                                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)';"
                                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(139, 92, 246, 0.3)';">
                                Explain a difficult<br>topic
                            </button>
                            <button onclick="sendPredefinedPrompt('Generate 5 Q&A pairs to test my understanding')" 
                                    style="padding: 12px 16px; border: none; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); cursor: pointer; font-size: 13px; color: #fff; transition: all 0.15s; text-align: center; min-width: 140px; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);"
                                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)';"
                                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(139, 92, 246, 0.3)';">
                                Generate Q&A<br>pairs
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        userChatHistory = [];
    }
}

// Send a predefined prompt
function sendPredefinedPrompt(message) {
    if (!selectedAgentForChat) {
        alert('Please select an agent first');
        return;
    }

    // Set the input value and trigger send
    const input = document.getElementById('userChatInput');
    if (input) {
        input.value = message;
        handleUserChatSend();
    }
}

// Send explain prompt - conditional based on agent purpose/use case
function sendExplainPrompt() {
    if (!selectedAgentForChat) {
        alert('Please select an agent first');
        return;
    }

    // Check if agent has a purpose or use case defined
    const hasPurposeOrUseCase = selectedAgentForChat.purpose || selectedAgentForChat.useCase;

    // Default to decentralized AI if no purpose/use case
    const message = hasPurposeOrUseCase
        ? 'Explain something that users typically found confusing.'
        : 'Explain something unknown about decentralized AI that users typically find confusing.';

    const input = document.getElementById('userChatInput');
    if (input) {
        input.value = message;
        handleUserChatSend();
    }
}

// Save chat history for an agent (by modelId for uniqueness)
function saveUserChatHistory(agentId) {
    try {
        localStorage.setItem(`userChatHistory_${agentId}`, JSON.stringify(userChatHistory));
    } catch (error) {
        console.error('Error saving chat history:', error);
    }
}

// Clear chat history for current agent
function clearCurrentChatHistory() {
    if (!selectedAgentForChat) {
        alert('No agent selected');
        return;
    }

    // Confirm before clearing
    if (!confirm('Are you sure you want to clear all chat history with this agent? This cannot be undone.')) {
        return;
    }

    // Clear from localStorage
    try {
        localStorage.removeItem(`userChatHistory_${selectedAgentForChat.id}`);
        console.log('Cleared chat history for agent:', selectedAgentForChat.id);
    } catch (error) {
        console.error('Error clearing chat history:', error);
        alert('Failed to clear chat history. Please try again.');
        return;
    }

    // Reset in-memory history
    userChatHistory = [];

    // Reload the chat UI to show empty state with predefined prompts
    loadUserChatHistory(selectedAgentForChat.id);
}

// Helper: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper: Render markdown with LaTeX support (using marked + KaTeX)
function renderMarkdownSafe(text, isStreaming = false) {
    if (!text) return '';
    
    // During streaming, show raw text for performance
    if (isStreaming) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
    
    // Full render with markdown + LaTeX
    return renderMarkdownWithLatex(text);
}

// Full markdown + LaTeX renderer (only used on complete)
function renderMarkdownWithLatex(text) {
    if (!text) return '';
    
    // Check if libraries are loaded
    const hasMarked = typeof marked !== 'undefined';
    const hasKatex = typeof katex !== 'undefined';
    
    // Fallback if libraries not loaded
    if (!hasMarked) {
        console.warn('marked.js not loaded, using basic rendering');
        let s = escapeHtml(text);
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/```([^`]+?)```/g, '<pre style="background:#f3f4f6;padding:8px;border-radius:4px;overflow-x:auto;"><code>$1</code></pre>');
    s = s.replace(/`([^`]+?)`/g, '<code style="background:#f3f4f6;padding:2px 4px;border-radius:3px;font-family:monospace;">$1</code>');
    s = s.replace(/\n/g, '<br>');
    return s;
}

    let processedText = text;
    const latexBlocks = [];
    
    // Protect LaTeX from markdown parser
    // Block LaTeX: $$...$$ or \[...\]
    processedText = processedText.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
        latexBlocks.push({ type: 'block', latex: latex.trim() });
        return `%%LATEX_BLOCK_${latexBlocks.length - 1}%%`;
    });
    processedText = processedText.replace(/\\\[([\s\S]+?)\\\]/g, (_, latex) => {
        latexBlocks.push({ type: 'block', latex: latex.trim() });
        return `%%LATEX_BLOCK_${latexBlocks.length - 1}%%`;
    });
    
    // Inline LaTeX: $...$ or \(...\)
    processedText = processedText.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
        latexBlocks.push({ type: 'inline', latex: latex.trim() });
        return `%%LATEX_INLINE_${latexBlocks.length - 1}%%`;
    });
    processedText = processedText.replace(/\\\(([\s\S]+?)\\\)/g, (_, latex) => {
        latexBlocks.push({ type: 'inline', latex: latex.trim() });
        return `%%LATEX_INLINE_${latexBlocks.length - 1}%%`;
    });
    
    // Parse markdown
    let html = marked.parse(processedText);
    
    // Restore LaTeX with KaTeX rendering
    if (hasKatex && latexBlocks.length > 0) {
        latexBlocks.forEach((item, i) => {
            try {
                const rendered = katex.renderToString(item.latex, { 
                    throwOnError: false,
                    displayMode: item.type === 'block'
                });
                const placeholder = item.type === 'block' 
                    ? `%%LATEX_BLOCK_${i}%%` 
                    : `%%LATEX_INLINE_${i}%%`;
                html = html.replace(placeholder, rendered);
            } catch (e) {
                console.warn('KaTeX render error:', e);
                // Show raw LaTeX on error
                const placeholder = item.type === 'block' 
                    ? `%%LATEX_BLOCK_${i}%%` 
                    : `%%LATEX_INLINE_${i}%%`;
                html = html.replace(placeholder, `<code>${escapeHtml(item.latex)}</code>`);
            }
        });
    } else if (latexBlocks.length > 0) {
        // No KaTeX, show raw LaTeX in code blocks
        latexBlocks.forEach((item, i) => {
            const placeholder = item.type === 'block' 
                ? `%%LATEX_BLOCK_${i}%%` 
                : `%%LATEX_INLINE_${i}%%`;
            html = html.replace(placeholder, `<code>${escapeHtml(item.latex)}</code>`);
        });
    }
    
    return html;
}

// Wrap switchTab to load agents when User Chats or Public Agents tab is opened
const originalSwitchTab = switchTab;
function switchTabWithAgentLoad(tabName) {
    originalSwitchTab(tabName);
    
    // If switching to User Chats tab, load agents
    const userChatsTab = document.getElementById('user-chats-tab');
    if (userChatsTab && userChatsTab.classList.contains('active')) {
        loadAgentsForChat();
    }
    
    // If switching to Public Agents tab, load public agents
    const publicAgentsTab = document.getElementById('public-agents-tab');
    if (publicAgentsTab && publicAgentsTab.classList.contains('active')) {
        loadPublicAgents();
    }
}
switchTab = switchTabWithAgentLoad;

window.switchTab = switchTab;
window.openCreateModelModal = openCreateModelModal;
window.closeCreateModelModal = closeCreateModelModal;
window.createModel = createModel;
window.openEditModelModal = openEditModelModal;
window.closeEditModelModal = closeEditModelModal;
window.updateModel = updateModel;
window.selectModel = selectModel;
window.toggleModelVisibility = toggleModelVisibility;
// Show fork history popup
async function showForkHistory(modelId) {
    // Create or get the modal
    let modal = document.getElementById('forkHistoryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'forkHistoryModal';
        modal.className = 'pa-modal-overlay';
        document.body.appendChild(modal);
    }
    
    // Show loading state
    modal.innerHTML = `
        <div style="background: #fff; border-radius: 16px; max-width: 500px; width: 90%; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Fork History</h3>
                <button onclick="closeForkHistoryModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
            </div>
            <div style="text-align: center; padding: 20px;">
                <div class="pa-spinner" style="margin: 0 auto;"></div>
                <p style="margin-top: 12px; color: #6b7280;">Loading fork history...</p>
            </div>
        </div>
    `;
    modal.classList.add('show');
    
    try {
        // Recursively fetch fork chain
        const forkChain = await fetchForkChain(modelId);
        
        // Render the chain
        const chainHtml = forkChain.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === forkChain.length - 1;
            const ownerDisplay = item.ownerAddress 
                ? item.ownerAddress.slice(0, 6) + '...' + item.ownerAddress.slice(-4) 
                : 'Unknown';
            const isClickable = !isFirst && item.isPublic; // Can click non-current public agents
            
            return `
                <div style="display: flex; align-items: stretch; gap: 12px;">
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isFirst ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : isLast ? 'linear-gradient(135deg, #10b981, #059669)' : '#e5e7eb'}; display: flex; align-items: center; justify-content: center;">
                            ${isFirst 
                                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>'
                                : isLast 
                                    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                                    : `<span style="color: #6b7280; font-size: 12px; font-weight: 600;">${forkChain.length - index}</span>`
                            }
                        </div>
                        ${!isLast ? '<div style="width: 2px; flex: 1; min-height: 24px; background: #d1d5db;"></div>' : ''}
                    </div>
                    <div style="flex: 1; padding-bottom: ${isLast ? '0' : '16px'};">
                        ${isClickable
                            ? `<a href="#" onclick="openAgentFromForkHistory('${item.id}'); return false;"
                                  style="font-weight: 600; color: #8b5cf6; font-size: 14px; text-decoration: underline; cursor: pointer;"
                                  title="Click to chat with this agent">${escapeHtml(item.name || 'Unknown Agent')}</a>`
                            : `<div style="font-weight: 600; color: ${!isFirst && !item.isPublic ? '#9ca3af' : '#111827'}; font-size: 14px;">${escapeHtml(item.name || 'Unknown Agent')}${!isFirst && !item.isPublic ? ' <span style="font-size: 10px; color: #9ca3af;">(private)</span>' : ''}</div>`
                        }
                        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">by ${ownerDisplay}</div>
                        ${item.isPublic && item.purpose ? `<div style="font-size: 11px; color: #6b7280; margin-top: 4px; font-style: italic; line-height: 1.4;">${escapeHtml(item.purpose)}</div>` : ''}
                        ${isFirst ? '<span style="display: inline-block; margin-top: 4px; background: #ede9fe; color: #7c3aed; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Current</span>' : ''}
                        ${isLast ? '<span style="display: inline-block; margin-top: 4px; background: #d1fae5; color: #059669; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Original</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        modal.innerHTML = `
            <div style="background: #fff; border-radius: 16px; max-width: 500px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Fork History</h3>
                        <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${forkChain.length} generation${forkChain.length > 1 ? 's' : ''} in chain</p>
                    </div>
                    <button onclick="closeForkHistoryModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; padding: 0; line-height: 1;">&times;</button>
                </div>
                <div style="padding: 24px; max-height: 400px; overflow-y: auto;">
                    ${chainHtml}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error fetching fork history:', error);
        modal.innerHTML = `
            <div style="background: #fff; border-radius: 16px; max-width: 500px; width: 90%; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Fork History</h3>
                    <button onclick="closeForkHistoryModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <p style="color: #ef4444;">Failed to load fork history: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

// Recursively fetch fork chain
async function fetchForkChain(modelId, chain = [], depth = 0) {
    if (depth > 10) return chain; // Safety limit
    
    try {
        const response = await fetch(`/api/personal-agent/models/${modelId}`);
        if (!response.ok) throw new Error('Failed to fetch model');
        
        const data = await response.json();
        const model = data.model || data;
        
        chain.push({
            id: model.id || modelId,
            name: model.name,
            ownerAddress: model.ownerAddress,
            forkedFrom: model.forkedFrom,
            isPublic: model.isPublic || false,
            purpose: model.purpose || ''
        });
        
        // If this model was forked from another, continue up the chain
        if (model.forkedFrom) {
            return fetchForkChain(model.forkedFrom, chain, depth + 1);
        }
        
        return chain;
    } catch (error) {
        console.error(`Error fetching model ${modelId}:`, error);
        return chain;
    }
}

// Open chat with agent from fork history
async function openAgentFromForkHistory(modelId) {
    // Close the fork history modal
    closeForkHistoryModal();
    
    try {
        // Fetch the agent details
        const response = await fetch(`/api/personal-agent/models/${modelId}`);
        if (!response.ok) throw new Error('Failed to fetch agent');
        
        const data = await response.json();
        const agent = data.model || data;
        
        if (!agent.isPublic) {
            showNotification('This agent is not public and cannot be accessed', 'error');
            return;
        }
        
        // Add to interacted public agents list
        addInteractedPublicAgent(modelId);
        
        // Add to publicAgents array if not already there
        const existingAgent = publicAgents.find(a => a.id === modelId);
        if (!existingAgent) {
            publicAgents.push({ ...agent, id: modelId });
        }
        
        // Switch to User Chats tab
        const userChatsTab = document.querySelector('[onclick*="user-chats"]');
        if (userChatsTab) {
            userChatsTab.click();
        }
        
        // Small delay to ensure tab switch completes, then select the agent
        setTimeout(() => {
            selectAgentFromSidebar(modelId, 'public');
        }, 100);
        
        console.log('📖 Opening chat with agent from fork history:', agent.name);
    } catch (error) {
        console.error('Error opening agent from fork history:', error);
        showNotification('Failed to open agent: ' + error.message, 'error');
    }
}

// Close fork history modal
function closeForkHistoryModal() {
    const modal = document.getElementById('forkHistoryModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

window.showForkHistory = showForkHistory;
window.closeForkHistoryModal = closeForkHistoryModal;
window.openAgentFromForkHistory = openAgentFromForkHistory;
window.deleteModel = deleteModel;
window.saveInlineModelChanges = saveInlineModelChanges;
window.autoGeneratePurpose = autoGeneratePurpose;
window.autoGenerateUseCase = autoGenerateUseCase;
window.openUploadFileModal = openUploadFileModal;
window.handleAgentSelection = handleAgentSelection;
window.handleUserChatSend = handleUserChatSend;
window.sendPredefinedPrompt = sendPredefinedPrompt;
window.sendExplainPrompt = sendExplainPrompt;
window.clearCurrentChatHistory = clearCurrentChatHistory;
window.autoResizeChatInput = autoResizeChatInput;
window.handleChatInputKeyDown = handleChatInputKeyDown;
window.loadPublicAgents = loadPublicAgents;
window.filterPublicAgents = filterPublicAgents;
window.chatWithPublicAgent = chatWithPublicAgent;
window.selectAgentFromSidebar = selectAgentFromSidebar;
window.viewPublicAgentDetails = viewPublicAgentDetails;
window.closePublicAgentDetailsModal = closePublicAgentDetailsModal;
window.showAgentInfoPanel = showAgentInfoPanel;
window.closeAgentInfoModal = closeAgentInfoModal;
window.forkCurrentChatAgent = forkCurrentChatAgent;
window.forkAgentFromInfoPanel = forkAgentFromInfoPanel;
window.showForkConfirmModal = showForkConfirmModal;
window.closeForkModal = closeForkModal;
window.forkAgent = forkAgent;
window.closeUploadFileModal = closeUploadFileModal;
window.handleFileSelect = handleFileSelect;
window.removeFileFromPreview = removeFileFromPreview;
window.uploadFiles = uploadFiles;
window.deleteFile = deleteFile;
window.removeCreateModalFile = removeCreateModalFile;
window.removeCreateModalFile = removeCreateModalFile;