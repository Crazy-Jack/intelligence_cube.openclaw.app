// 🤖 Agent Chat - Gemini-powered chat interface for user-created agents
// Supports text + image inputs with embedding generation

class AgentChat {
    constructor() {
        this.agentName = null;
        this.agentData = null;
        this.chatHistory = [];
        this.attachments = [];
        
        this.init();
    }

    async init() {
        // Get agent name from URL
        const params = new URLSearchParams(window.location.search);
        const agentName = params.get('agent');
        
        if (!agentName) {
            this.showError('No agent specified. Please select an agent from the modelverse page.');
            return;
        }

        this.agentName = agentName;
        
        // Load agent data
        await this.loadAgentData();
        
        // Update UI
        this.updateHeader();
        
        // Load chat history
        this.loadChatHistory();
        
        // Initialize file input
        this.initFileInput();
        
        console.log('✅ Agent Chat initialized for:', this.agentName);
    }

    async loadAgentData() {
        try {
            // Try to get from localStorage (user agents storage)
            const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
            if (userAgents[this.agentName]) {
                this.agentData = userAgents[this.agentName];
                return;
            }
            
            // Try to get from MODEL_DATA (if it's marked as user agent)
            if (typeof getModelData === 'function') {
                const modelData = getModelData(this.agentName);
                if (modelData && modelData.isUserAgent) {
                    this.agentData = modelData;
                    return;
                }
            }
            
            // Default agent data
            this.agentData = {
                name: this.agentName,
                purpose: 'A custom AI agent created by the user',
                useCase: 'General purpose chat and assistance',
                isUserAgent: true
            };
        } catch (error) {
            console.error('Error loading agent data:', error);
            this.agentData = {
                name: this.agentName,
                purpose: 'A custom AI agent',
                useCase: 'General purpose chat',
                isUserAgent: true
            };
        }
    }

    updateHeader() {
        const nameEl = document.getElementById('agentName');
        const descEl = document.getElementById('agentDescription');
        const headerEl = document.getElementById('chatHeaderText');
        
        if (nameEl) nameEl.textContent = this.agentName;
        if (descEl) descEl.textContent = this.agentData?.purpose || 'Chat with your custom agent';
        if (headerEl) headerEl.textContent = this.agentName;
    }

    initFileInput() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e.target.files);
            });
        }
    }

    triggerFileInput() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    handleFileSelect(files) {
        if (!files || files.length === 0) return;
        
        const file = files[0];
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Convert to data URL
        const reader = new FileReader();
        reader.onload = (e) => {
            this.attachments.push({
                file: file,
                dataUrl: e.target.result,
                type: 'image'
            });
            this.updateAttachmentPreview();
        };
        reader.readAsDataURL(file);
    }

    updateAttachmentPreview() {
        const preview = document.getElementById('attachmentPreview');
        if (!preview) return;

        if (this.attachments.length === 0) {
            preview.style.display = 'none';
            preview.innerHTML = '';
            return;
        }

        preview.style.display = 'flex';
        preview.innerHTML = '';
        
        this.attachments.forEach((att, index) => {
            if (att.type === 'image') {
                const img = document.createElement('img');
                img.src = att.dataUrl;
                img.style.width = '60px';
                img.style.height = '60px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.marginRight = '8px';
                
                const removeBtn = document.createElement('button');
                removeBtn.textContent = '×';
                removeBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; background:#ef4444; color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:14px;';
                removeBtn.onclick = () => {
                    this.attachments.splice(index, 1);
                    this.updateAttachmentPreview();
                };
                
                const container = document.createElement('div');
                container.style.position = 'relative';
                container.style.display = 'inline-block';
                container.appendChild(img);
                container.appendChild(removeBtn);
                preview.appendChild(container);
            }
        });
    }

    handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSend();
        }
    }

    async handleSend() {
        const input = document.getElementById('chatInput');
        const message = input?.value.trim();
        
        if (!message && this.attachments.length === 0) {
            return;
        }

        // Store attachments before clearing
        const currentAttachments = [...this.attachments];
        const imageDataUrls = currentAttachments.map(a => a.dataUrl);
        
        // Add user message to chat
        this.appendMessage('user', message, imageDataUrls);
        
        // Clear input and attachments
        if (input) input.value = '';
        this.attachments = [];
        this.updateAttachmentPreview();

        // Show loading message (will be updated with streaming response)
        const loadingId = this.appendMessage('assistant', '', []);

        try {
            // Generate embeddings for text and images (for data structure)
            const textEmbedding = message ? await this.generateTextEmbedding(message) : null;
            const imageEmbeddings = await Promise.all(
                imageDataUrls.map(dataUrl => this.generateImageEmbedding(dataUrl))
            );

            // Use the same API infrastructure as regular chat
            // The backend will handle which model to use (could be Gemini, I3 models, etc.)
            // This supports streaming updates
            const response = await this.callAgentAPI(message, imageDataUrls, loadingId);
            
            // Response is already updated via streaming, but ensure final state
            this.updateMessage(loadingId, 'assistant', response, []);
            
            // Store in chat history with embeddings
            this.chatHistory.push({
                role: 'user',
                content: message,
                images: imageDataUrls,
                textEmbedding: textEmbedding,
                imageEmbeddings: imageEmbeddings,
                timestamp: new Date().toISOString()
            });
            
            this.chatHistory.push({
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString()
            });

            // Save to localStorage
            this.saveChatHistory();
        } catch (error) {
            console.error('Error sending message:', error);
            this.updateMessage(loadingId, 'assistant', `Error: ${error.message}`, []);
        }
    }

    async generateTextEmbedding(text) {
        try {
            if (!window.apiManager) {
                console.warn('API Manager not available, skipping text embedding');
                return null;
            }
            
            const embedding = await window.apiManager.getEmbedding(text, 'i3-embedding');
            console.log('✅ Generated text embedding, length:', embedding?.length);
            return embedding;
        } catch (error) {
            console.error('Error generating text embedding:', error);
            return null;
        }
    }

    async generateImageEmbedding(imageDataUrl) {
        try {
            // For images, we can use a vision embedding model or convert to text description first
            // For now, we'll use the image data URL as a placeholder
            // In production, you'd call a vision embedding API
            
            // Option 1: Use Gemini to generate a description, then embed that
            // Option 2: Use a vision embedding model directly
            // For now, return null and implement later if needed
            
            console.log('📸 Image embedding generation (placeholder)');
            return null;
        } catch (error) {
            console.error('Error generating image embedding:', error);
            return null;
        }
    }

    async callAgentAPI(text, images = [], messageId = null) {
        // Use the same API infrastructure as regular chat
        // This goes through the I3 proxy API (/api/chat/completions)
        // The backend can route to Gemini, I3 models, or other providers
        // based on agent configuration
        
        if (!window.apiManager) {
            throw new Error('API Manager not available. Please ensure api-manager.js is loaded.');
        }

        // Build system prompt from agent data
        const systemPrompt = this.agentData?.purpose 
            ? `You are ${this.agentName}. ${this.agentData.purpose}\n\nUse Case: ${this.agentData.useCase || 'General assistance'}`
            : `You are ${this.agentName}, a helpful AI assistant.`;

        // Build user content
        let userContent = text || '';
        
        // If we have images, use the image API flow (same as regular chat)
        if (images.length > 0) {
            // Use streamModelRequestWithImage (same as regular chat)
            return new Promise((resolve, reject) => {
                let fullResponse = '';
                
                window.apiManager.streamModelRequestWithImage(
                    this.agentName, // Model name (agent name) - backend decides which actual model to use
                    userContent,
                    images[0], // First image (can extend to multiple)
                    { systemPrompt: systemPrompt },
                    {
                        onStart() {
                            console.log('🚀 Starting agent chat request...');
                        },
                        onDelta(delta) {
                            fullResponse += delta;
                            // Update UI in real-time (streaming)
                            if (messageId) {
                                this.updateMessage(messageId, 'assistant', fullResponse, []);
                            }
                        },
                        onDone(finalText) {
                            resolve(finalText || fullResponse);
                        },
                        onError(error) {
                            reject(error);
                        }
                    }
                );
            });
        } else {
            // Text-only: use regular streaming API (same as regular chat)
            return new Promise((resolve, reject) => {
                let fullResponse = '';
                
                window.apiManager.streamModelRequest(
                    this.agentName, // Model name (agent name) - backend decides which actual model to use
                    userContent,
                    { systemPrompt: systemPrompt },
                    {
                        onStart() {
                            console.log('🚀 Starting agent chat request...');
                        },
                        onDelta(delta) {
                            fullResponse += delta;
                            // Update UI in real-time (streaming)
                            if (messageId) {
                                this.updateMessage(messageId, 'assistant', fullResponse, []);
                            }
                        },
                        onDone(finalText) {
                            resolve(finalText || fullResponse);
                        },
                        onError(error) {
                            reject(error);
                        }
                    }
                );
            });
        }
    }

    appendMessage(role, content, images = []) {
        const messagesEl = document.getElementById('chatMessages');
        if (!messagesEl) return null;

        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const messageEl = document.createElement('div');
        messageEl.id = messageId;
        messageEl.className = `message ${role}`;
        
        if (content) {
            const textEl = document.createElement('div');
            textEl.textContent = content;
            messageEl.appendChild(textEl);
        }
        
        // Add images
        images.forEach(imageDataUrl => {
            const imgEl = document.createElement('img');
            imgEl.src = imageDataUrl;
            imgEl.className = 'message-image';
            messageEl.appendChild(imgEl);
        });

        messagesEl.appendChild(messageEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        return messageId;
    }

    updateMessage(messageId, role, content, images = []) {
        const messageEl = document.getElementById(messageId);
        if (!messageEl) return;

        messageEl.innerHTML = '';
        messageEl.className = `message ${role}`;
        
        if (content) {
            const textEl = document.createElement('div');
            textEl.textContent = content;
            messageEl.appendChild(textEl);
        }
        
        images.forEach(imageDataUrl => {
            const imgEl = document.createElement('img');
            imgEl.src = imageDataUrl;
            imgEl.className = 'message-image';
            messageEl.appendChild(imgEl);
        });

        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    }

    loadChatHistory() {
        try {
            const stored = localStorage.getItem(`agentChatHistory_${this.agentName}`);
            if (stored) {
                this.chatHistory = JSON.parse(stored);
                
                // Render messages
                this.chatHistory.forEach(msg => {
                    this.appendMessage(msg.role, msg.content, msg.images || []);
                });
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    saveChatHistory() {
        try {
            localStorage.setItem(`agentChatHistory_${this.agentName}`, JSON.stringify(this.chatHistory));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    showError(message) {
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            messagesEl.innerHTML = `<div class="message assistant" style="color:#ef4444;">${message}</div>`;
        }
    }
}

// Initialize on page load
let agentChat;
document.addEventListener('DOMContentLoaded', () => {
    agentChat = new AgentChat();
    
    // Expose globally for onclick handlers
    window.triggerFileInput = () => agentChat.triggerFileInput();
    window.handleSend = () => agentChat.handleSend();
    window.handleKeyPress = (e) => agentChat.handleKeyPress(e);
});

