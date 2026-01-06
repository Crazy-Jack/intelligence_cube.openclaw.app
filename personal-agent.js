// Personal Agent - Model Creator and RAG Infrastructure

// Global state
let currentWalletAddress = null;
let currentModelId = null;
let selectedFiles = [];
let models = [];

// Wait for wallet to be ready (Firebase is only needed for file operations)
document.addEventListener('DOMContentLoaded', async function() {
    await waitForWallet();
    await loadModels();
    setupEventListeners();
});

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

// Wait for wallet to be ready
async function waitForWallet() {
    if (window.walletManager && window.walletManager.isConnected) {
        currentWalletAddress = window.walletManager.walletAddress;
        return;
    }
    
    return new Promise((resolve) => {
        const checkWallet = () => {
            if (window.walletManager && window.walletManager.isConnected) {
                currentWalletAddress = window.walletManager.walletAddress;
                resolve();
            } else {
                setTimeout(checkWallet, 100);
            }
        };
        window.addEventListener('walletConnected', () => {
            if (window.walletManager && window.walletManager.isConnected) {
                currentWalletAddress = window.walletManager.walletAddress;
                resolve();
            }
        });
        checkWallet();
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

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.pa-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Update tab content
    document.querySelectorAll('.pa-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
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
            const errorData = await response.json().catch(() => ({ error: 'Failed to load models' }));
            throw new Error(errorData.error || 'Failed to load models');
        }
        const data = await response.json();
        models = data.models || [];
        console.log(`✅ Loaded ${models.length} model(s):`, models.map(m => m.name));
        renderModelList();
    } catch (error) {
        console.error('❌ Error loading models:', error);
        showNotification('Failed to load models: ' + error.message, 'error');
    }
}

// Render model list
function renderModelList() {
    const modelList = document.getElementById('model-list');
    if (!modelList) return;
    
    if (models.length === 0) {
        modelList.innerHTML = '<div class="pa-empty-state"><p>No models yet. Create your first model!</p></div>';
        return;
    }
    
    modelList.innerHTML = models.map(model => `
        <div class="pa-model-item ${model.id === currentModelId ? 'selected' : ''}" 
             onclick="selectModel('${model.id}')">
            <div class="pa-model-item-header">
                <h3 class="pa-model-item-name">${escapeHtml(model.name || 'Unnamed')}</h3>
                <div class="pa-model-item-actions" onclick="event.stopPropagation()">
                    <button class="pa-model-item-action" onclick="toggleModelVisibility('${model.id}', ${!model.isPublic})" 
                            title="${model.isPublic ? 'Make private' : 'Make public'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${model.isPublic 
                                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
                        </svg>
                    </button>
                    <button class="pa-model-item-action" onclick="deleteModel('${model.id}')" title="Delete model">
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
                    showNotification('Model not found', 'error');
                }
            } else {
                showNotification('Failed to load model details', 'error');
            }
        }
    } catch (error) {
        console.error('Error loading model details:', error);
        showNotification('Failed to load model details', 'error');
    }
}

// Render model details
function renderModelDetails(model) {
    const detailsPanel = document.getElementById('model-details');
    if (!detailsPanel) return;
    
    detailsPanel.innerHTML = `
        <div class="pa-model-details-header">
            <div>
                <h2 class="pa-model-details-title">${escapeHtml(model.name || 'Unnamed Model')}</h2>
                <div class="pa-model-details-meta">
                    <span class="pa-model-item-badge ${model.isPublic ? 'public' : 'private'}">
                        ${model.isPublic ? 'Public' : 'Private'}
                    </span>
                    ${model.createdAt && formatDate(model.createdAt) ? `<span>Created: ${formatDate(model.createdAt)}</span>` : ''}
                </div>
            </div>
            <div class="pa-model-details-actions">
                <button class="pa-btn-secondary" onclick="openEditModelModal('${model.id}')" style="margin-right: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit
                </button>
                <label class="pa-toggle">
                    <input type="checkbox" ${model.isPublic ? 'checked' : ''} 
                           onchange="toggleModelVisibility('${model.id}', this.checked)">
                    <span class="pa-toggle-slider"></span>
                </label>
            </div>
        </div>
        
        ${model.category ? `
            <div style="margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Category</h3>
                <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">${escapeHtml(model.category)}</p>
            </div>
        ` : ''}
        
        ${model.industry ? `
            <div style="margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Industry</h3>
                <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">${escapeHtml(model.industry)}</p>
            </div>
        ` : ''}
        
        ${model.tokenPrice !== null && model.tokenPrice !== undefined ? `
            <div style="margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Token Price</h3>
                <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">${escapeHtml(model.tokenPrice)}</p>
            </div>
        ` : ''}
        
        ${model.purpose ? `
            <div style="margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Purpose</h3>
                <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">${escapeHtml(model.purpose)}</p>
            </div>
        ` : ''}
        
        ${model.useCase ? `
            <div style="margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Use Case</h3>
                <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">${escapeHtml(model.useCase)}</p>
            </div>
        ` : ''}
        
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
    `;
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
                    <p class="pa-file-item-name">${escapeHtml(file.filename || 'Unknown')}</p>
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
    if (!currentWalletAddress) {
        showNotification('Please connect your wallet first', 'error');
        return;
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
        document.getElementById('modelIsPublicInput').checked = false;
        
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
}

// Update default prompt preview for Create Model modal
function updateCreateModelDefaultPromptPreview() {
    const preview = document.getElementById('createModelDefaultPromptPreview');
    if (!preview) return;
    
    const name = document.getElementById('modelNameInput')?.value.trim() || '{Model Name}';
    const purpose = document.getElementById('modelPurposeInput')?.value.trim() || '{Purpose}';
    const useCase = document.getElementById('modelUseCaseInput')?.value.trim() || '{Use Case}';
    
    preview.textContent = `You are ${name}. ${purpose}\n\nUse Case: ${useCase}\n\nAnswer the user's question as this specialized model would.`;
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
    
    preview.textContent = `You are ${name}. ${purpose}\n\nUse Case: ${useCase}\n\nAnswer the user's question as this specialized model would.`;
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
        showNotification('Please enter a model name', 'error');
        return;
    }
    
    try {
        const tokenPriceInput = document.getElementById('modelTokenPriceInput').value.trim();
        const tokenPrice = tokenPriceInput ? parseFloat(tokenPriceInput) : 2; // Default to 2 if empty
        
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
                tokenPrice: tokenPrice
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to create model' }));
            const errorMessage = errorData.error || errorData.details || 'Failed to create model';
            console.error('❌ Backend error:', errorData);
            throw new Error(errorMessage);
        }
        
        const model = await response.json();
        console.log('✅ Model created successfully:', model);
        showNotification('Model created successfully', 'success');
        closeCreateModelModal();
        
        // Reload models list to include the new model
        await loadModels();
        
        // Select the newly created model
        if (model.id) {
            await selectModel(model.id);
        }
    } catch (error) {
        console.error('Error creating model:', error);
        showNotification('Failed to create model: ' + error.message, 'error');
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
            const errorData = await response.json().catch(() => ({ error: 'Failed to update model' }));
            throw new Error(errorData.error || 'Failed to update model');
        }
        
        showNotification(`Model set to ${isPublic ? 'public' : 'private'}`, 'success');
        await loadModels();
        if (currentModelId === modelId) {
            await loadModelDetails(modelId);
        }
    } catch (error) {
        console.error('Error updating model visibility:', error);
        showNotification('Failed to update model visibility: ' + error.message, 'error');
    }
}

// Delete model
async function deleteModel(modelId) {
    if (!confirm('Are you sure you want to delete this model? This will also delete all associated files.')) {
        return;
    }
    
    if (!currentWalletAddress) return;
    
    try {
        const response = await fetch(`/api/personal-agent/models/${modelId}?ownerAddress=${encodeURIComponent(currentWalletAddress.toLowerCase())}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete model' }));
            throw new Error(errorData.error || 'Failed to delete model');
        }
        
        showNotification('Model deleted successfully', 'success');
        currentModelId = null;
        await loadModels();
        document.getElementById('model-details').innerHTML = '<div class="pa-empty-state"><p>Select a model to view details and manage files</p></div>';
    } catch (error) {
        console.error('Error deleting model:', error);
        showNotification('Failed to delete model: ' + error.message, 'error');
    }
}

// Open edit model modal
function openEditModelModal(modelId) {
    if (!currentWalletAddress) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    // Find the model data
    const model = models.find(m => m.id === modelId);
    if (!model) {
        showNotification('Model not found', 'error');
        return;
    }
    
    // Check ownership
    if (model.ownerAddress && model.ownerAddress.toLowerCase() !== currentWalletAddress.toLowerCase()) {
        showNotification('You do not have permission to edit this model', 'error');
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
        showNotification('Model ID not found', 'error');
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
            const errorData = await response.json().catch(() => ({ error: 'Failed to update model' }));
            throw new Error(errorData.error || 'Failed to update model');
        }
        
        const updatedModel = await response.json();
        console.log('✅ Model updated successfully:', updatedModel);
        showNotification('Model updated successfully', 'success');
        closeEditModelModal();
        
        // Reload models list and refresh details
        await loadModels();
        if (currentModelId === modelId) {
            await loadModelDetails(modelId);
        }
    } catch (error) {
        console.error('Error updating model:', error);
        showNotification('Failed to update model: ' + error.message, 'error');
    }
}

// ========== File Management ==========

// Open upload file modal
function openUploadFileModal() {
    if (!currentModelId) {
        showNotification('Please select a model first', 'error');
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
        showNotification('Please select a model first', 'error');
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

// Load agents into dropdown when User Chats tab is opened
async function loadAgentsForChat() {
    const selector = document.getElementById('agentSelector');
    if (!selector) return;
    
    try {
        // Load models from the same source as the model list
        await loadModels();
        
        // Clear existing options (except the placeholder)
        selector.innerHTML = '<option value="">-- Select an agent to chat with --</option>';
        
        // Add each model as an option
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            selector.appendChild(option);
        });
        
        console.log(`✅ Loaded ${models.length} agents for chat`);
    } catch (error) {
        console.error('Error loading agents for chat:', error);
    }
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
    
    // Find the selected model
    const model = models.find(m => m.name === agentName);
    if (!model) {
        console.error('Selected agent not found:', agentName);
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
    
    // Load chat history for this agent
    loadUserChatHistory(agentName);
    
    // Focus input
    if (input) input.focus();
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
    
    // Clear input
    if (input) input.value = '';
    
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
        
        await window.apiManager.streamModelRequest(
            selectedAgentForChat.name, // Agent name - backend will detect it's a user agent and do RAG
            message,
            { systemPrompt: systemPrompt },
            {
                onStart() {
                    console.log('🚀 Starting chat with agent:', selectedAgentForChat.name);
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
                    
                    // Save history
                    saveUserChatHistory(selectedAgentForChat.name);
                    
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
    messageEl.style.cssText = `
        margin-bottom: 16px;
        padding: 12px 16px;
        max-width: 75%;
        width: fit-content;
        word-wrap: break-word;
        ${role === 'user' 
            ? 'background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; margin-left: auto; margin-right: 0; border-radius: 18px 18px 4px 18px;' 
            : 'background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; margin-right: auto; margin-left: 0; border-radius: 18px 18px 18px 4px;'}
    `;
    
    if (content) {
        messageEl.innerHTML = renderMarkdownSafe(content, false);
    }
    
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageId;
}

// Load chat history for an agent
function loadUserChatHistory(agentName) {
    try {
        const stored = localStorage.getItem(`userChatHistory_${agentName}`);
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
                messagesDiv.innerHTML = '<div style="text-align: center; color: #9ca3af; margin-top: 40px;"><p>Start a conversation with your agent</p></div>';
            }
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        userChatHistory = [];
    }
}

// Save chat history for an agent
function saveUserChatHistory(agentName) {
    try {
        localStorage.setItem(`userChatHistory_${agentName}`, JSON.stringify(userChatHistory));
    } catch (error) {
        console.error('Error saving chat history:', error);
    }
}

// Helper: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper: Render markdown (simple version, similar to autorouter)
function renderMarkdownSafe(text, isStreaming = false) {
    let s = escapeHtml(text || '');
    
    // Process markdown
    // Bold: **text**
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    
    // Code blocks: ```code```
    s = s.replace(/```([^`]+?)```/g, '<pre style="background:#f3f4f6;padding:8px;border-radius:4px;overflow-x:auto;"><code>$1</code></pre>');
    
    // Inline code: `code`
    s = s.replace(/`([^`]+?)`/g, '<code style="background:#f3f4f6;padding:2px 4px;border-radius:3px;font-family:monospace;">$1</code>');
    
    // Line breaks
    s = s.replace(/\n/g, '<br>');
    
    return s;
}

// Wrap switchTab to load agents when User Chats tab is opened
const originalSwitchTab = switchTab;
function switchTabWithAgentLoad(tabName) {
    originalSwitchTab(tabName);
    
    // If switching to User Chats tab, load agents
    const userChatsTab = document.getElementById('user-chats-tab');
    if (userChatsTab && userChatsTab.classList.contains('active')) {
        loadAgentsForChat();
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
window.deleteModel = deleteModel;
window.openUploadFileModal = openUploadFileModal;
window.handleAgentSelection = handleAgentSelection;
window.handleUserChatSend = handleUserChatSend;
window.closeUploadFileModal = closeUploadFileModal;
window.handleFileSelect = handleFileSelect;
window.removeFileFromPreview = removeFileFromPreview;
window.uploadFiles = uploadFiles;
window.deleteFile = deleteFile;
