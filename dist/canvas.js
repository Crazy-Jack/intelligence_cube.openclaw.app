// Canvas Workflow JavaScript
console.log('🎨 Loading Canvas Workflow...');

// Global variables
let workflowNodes = [];
let connections = [];
let nodeIdCounter = 0;
let connectionIdCounter = 0;
let draggedModel = null;
let isConnecting = false;
let connectionStart = null;
let temporaryLine = null;

// Selection variables
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionBox = null;
let selectedNodes = new Set();
let selectedConnections = new Set();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('初始化Canvas工作流...');
    loadModels();
    setupDragAndDrop();
    setupCanvasSelection();
    setupKeyboardShortcuts();
    
    // 恢复保存的工作流
    restoreWorkflow();
    
    // 如果从工作流页点击"Try Now"跳转过来，优先加载预选的工作流
    try {
        const selectedWorkflowRaw = localStorage.getItem('selectedWorkflow');
        if (selectedWorkflowRaw) {
            const selectedWorkflow = JSON.parse(selectedWorkflowRaw);
            if (selectedWorkflow && selectedWorkflow.models && selectedWorkflow.models.length > 0) {
                loadWorkflowToCanvas(selectedWorkflow);
            }
            // 只使用一次，避免刷新后重复加载
            localStorage.removeItem('selectedWorkflow');
        }
    } catch (e) {
        console.error('Failed to load selected workflow:', e);
    }
    
    console.log('Canvas工作流初始化完成');

    if ('ontouchstart' in window) {
        addTouchSupport();
    }
    
    // Setup canvas scroll handler for mobile
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    if (canvasWorkspace) {
        let scrollTimeout;
        canvasWorkspace.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateAllConnections();
            }, 50);
        });
    }
});

// 新增函数：恢复工作流
function restoreWorkflow() {
    // 检查是否有保存的Canvas工作流数据
    const canvasWorkflow = localStorage.getItem('canvasWorkflow');
    
    if (canvasWorkflow) {
        try {
            const workflowData = JSON.parse(canvasWorkflow);
            console.log('恢复工作流:', workflowData.name);
            
            // 恢复节点
            if (workflowData.nodes && workflowData.nodes.length > 0) {
                workflowData.nodes.forEach(nodeData => {
                    // 添加到workflowNodes数组
                    workflowNodes.push(nodeData);
                    
                    // 创建DOM元素
                    createNodeElement(nodeData);
                    
                    // 更新计数器
                    const nodeNumber = parseInt(nodeData.id.split('-')[1]);
                    if (nodeNumber >= nodeIdCounter) {
                        nodeIdCounter = nodeNumber + 1;
                    }
                });
                
                // 延迟恢复连接，确保节点已创建
                setTimeout(() => {
                    if (workflowData.connections && workflowData.connections.length > 0) {
                        workflowData.connections.forEach(connData => {
                            connections.push(connData);
                            drawConnection(connData);
                            
                            const connNumber = parseInt(connData.id.split('-')[1]);
                            if (connNumber >= connectionIdCounter) {
                                connectionIdCounter = connNumber + 1;
                            }
                        });
                    }
                }, 200);
            }

            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    adjustCanvasViewport();
                }, 300);
            }
        } catch (e) {
            console.error('恢复工作流失败:', e);
        }
    }
}

// 新增函数：创建节点DOM元素
function createNodeElement(nodeData, options = {}) {
    const { animate = false } = options;
    
    if (window.innerWidth <= 768 && typeof nodeData.x === 'number' && typeof nodeData.y === 'number') {
        const scale = 0.7;
        const minX = 20;
        const minY = 20;
        nodeData.x = Math.max(minX, nodeData.x * scale);
        nodeData.y = Math.max(minY, nodeData.y * scale);
    }
    
    const nodeElement = document.createElement('div');
    nodeElement.className = animate ? 'workflow-node appear' : 'workflow-node';
    nodeElement.id = nodeData.id;
    nodeElement.style.left = `${nodeData.x}px`;
    nodeElement.style.top = `${nodeData.y}px`;
    
    const displayName = nodeData.modelName.length > 20 ? 
        nodeData.modelName.substring(0, 20) + '...' : nodeData.modelName;
    
    nodeElement.innerHTML = `
        <div class="node-header">
            <div class="node-title" title="${nodeData.modelName}">${displayName}</div>
        </div>
        <div class="node-category">${nodeData.category}</div>
        <div class="node-tokens">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6"/>
                <path d="m21 12-6-3-6 3-6-3"/>
            </svg>
            ${nodeData.quantity}K tokens
        </div>
    `;
    
    // 添加连接点 (left, right, top, bottom)
    const leftPoint = document.createElement('div');
    leftPoint.className = 'connection-point left';
    leftPoint.dataset.node = nodeData.id;
    leftPoint.dataset.type = 'left';
    
    const rightPoint = document.createElement('div');
    rightPoint.className = 'connection-point right';
    rightPoint.dataset.node = nodeData.id;
    rightPoint.dataset.type = 'right';
    
    const topPoint = document.createElement('div');
    topPoint.className = 'connection-point top';
    topPoint.dataset.node = nodeData.id;
    topPoint.dataset.type = 'top';
    
    const bottomPoint = document.createElement('div');
    bottomPoint.className = 'connection-point bottom';
    bottomPoint.dataset.node = nodeData.id;
    bottomPoint.dataset.type = 'bottom';
    
    nodeElement.appendChild(leftPoint);
    nodeElement.appendChild(rightPoint);
    nodeElement.appendChild(topPoint);
    nodeElement.appendChild(bottomPoint);
    
    setupNodeDragging(nodeElement, nodeData);
    setupConnectionPoints(nodeElement, nodeData);
    
    document.getElementById('workflowNodes').appendChild(nodeElement);
}

// 新增函数：恢复保存的工作流
function restoreSavedWorkflow() {
    // 检查多个可能的存储位置
    const savedWorkflow = localStorage.getItem('savedWorkflow');
    const canvasWorkflow = localStorage.getItem('canvasWorkflow');
    
    let workflowToRestore = null;
    
    if (savedWorkflow) {
        try {
            workflowToRestore = JSON.parse(savedWorkflow);
        } catch (e) {
            console.error('Error parsing saved workflow:', e);
        }
    } else if (canvasWorkflow) {
        try {
            workflowToRestore = JSON.parse(canvasWorkflow);
        } catch (e) {
            console.error('Error parsing canvas workflow:', e);
        }
    }
    
    if (workflowToRestore && workflowToRestore.nodes && workflowToRestore.nodes.length > 0) {
        console.log('Restoring workflow with', workflowToRestore.nodes.length, 'nodes');
        restoreWorkflowFromData(workflowToRestore);
    }
}

// 新增函数：从数据恢复工作流
function restoreWorkflowFromData(workflowData) {
    // 清空现有内容
    workflowNodes = [];
    connections = [];
    nodeIdCounter = 0;
    connectionIdCounter = 0;
    
    // 恢复节点
    workflowData.nodes.forEach(nodeData => {
        const restoredNode = {
            id: nodeData.id,
            modelName: nodeData.modelName,
            modelType: nodeData.modelType || 'token',
            category: nodeData.category,
            quantity: nodeData.quantity || 2,
            x: nodeData.x,
            y: nodeData.y
        };
        
        workflowNodes.push(restoredNode);
        createNodeElement(restoredNode);
        
        // 更新计数器
        const nodeNumber = parseInt(restoredNode.id.split('-')[1]);
        if (nodeNumber > nodeIdCounter) {
            nodeIdCounter = nodeNumber;
        }
    });
    
    // 恢复连接
    if (workflowData.connections) {
        setTimeout(() => {
            workflowData.connections.forEach(connectionData => {
                connections.push(connectionData);
                drawConnection(connectionData);
                
                const connectionNumber = parseInt(connectionData.id.split('-')[1]);
                if (connectionNumber > connectionIdCounter) {
                    connectionIdCounter = connectionNumber;
                }
            });
        }, 100);
    }
    
    console.log('Workflow restored successfully');

    if (window.innerWidth <= 768) {
        setTimeout(() => {
            adjustCanvasViewport();
        }, 300);
    }
}

// Setup canvas selection functionality
function setupCanvasSelection() {
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    let longPressTimer = null;
    
    canvasWorkspace.addEventListener('mousedown', (e) => {
        // Only handle if not clicking on nodes, connection points, or during connection
        if (e.target.closest('.workflow-node') || 
            e.target.closest('.connection-point') || 
            isConnecting || 
            draggedModel) {
        return;
    }
    
        const canvasRect = canvasWorkspace.getBoundingClientRect();
        selectionStart = {
            x: e.clientX - canvasRect.left,
            y: e.clientY - canvasRect.top
        };
        
        // Start long press timer for selection
        longPressTimer = setTimeout(() => {
            // Start selection immediately when long press is detected
            startSelection(e);
        }, 150); // 150ms long press for selection - faster response
        
    e.preventDefault();
    });
    
    canvasWorkspace.addEventListener('mousemove', (e) => {
        // If long press timer is active and we're dragging, start selection immediately
        if (longPressTimer) {
            const canvasRect = canvasWorkspace.getBoundingClientRect();
            const currentX = e.clientX - canvasRect.left;
            const currentY = e.clientY - canvasRect.top;
            const distance = Math.sqrt(
                Math.pow(currentX - selectionStart.x, 2) + 
                Math.pow(currentY - selectionStart.y, 2)
            );
            
            // If dragging while holding down, start selection immediately
            if (distance > 5) { // 5px threshold
                clearTimeout(longPressTimer);
                longPressTimer = null;
                // Start selection immediately when dragging during long press
                if (!isSelecting) {
                    startSelection(e);
                }
            }
        }
        
        // Update selection box if selecting
        if (isSelecting) {
            updateSelectionBox(e);
        }
    });
    
    canvasWorkspace.addEventListener('mouseup', (e) => {
        // Clear long press timer
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // End selection if selecting
        if (isSelecting) {
            endSelection();
        }
    });
}
    
    // Start selection box
function startSelection(event) {
    console.log('📦 Starting selection box');
    
    isSelecting = true;
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    
    // Create selection box element
    selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    selectionBox.style.left = `${selectionStart.x}px`;
    selectionBox.style.top = `${selectionStart.y}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    
    canvasWorkspace.appendChild(selectionBox);
    
    // If we're starting due to drag, immediately update the box size
    if (event) {
        updateSelectionBox(event);
    }
    
    // Add global mouse move and up listeners
    document.addEventListener('mousemove', updateSelectionBox);
    document.addEventListener('mouseup', endSelection);
}

// Update selection box
function updateSelectionBox(event) {
    if (!isSelecting || !selectionBox) return;
    
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    const canvasRect = canvasWorkspace.getBoundingClientRect();
    const currentX = event.clientX - canvasRect.left;
    const currentY = event.clientY - canvasRect.top;
    
    const left = Math.min(selectionStart.x, currentX);
    const top = Math.min(selectionStart.y, currentY);
    const width = Math.abs(currentX - selectionStart.x);
    const height = Math.abs(currentY - selectionStart.y);
    
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
    
    // Preview selection
    previewSelection(left, top, width, height);
}

// Preview selection
function previewSelection(left, top, width, height) {
    const selectionRect = { left, top, right: left + width, bottom: top + height };
    
    // Preview nodes
    workflowNodes.forEach(node => {
        const nodeElement = document.getElementById(node.id);
        if (nodeElement && isNodeInSelection(nodeElement, selectionRect)) {
            nodeElement.classList.add('selection-preview');
        } else if (nodeElement) {
            nodeElement.classList.remove('selection-preview');
        }
    });
    
    // Preview connections
    connections.forEach(connection => {
        const lineElement = document.getElementById(connection.id);
        if (lineElement && isConnectionInSelection(connection, selectionRect)) {
            lineElement.classList.add('selection-preview');
        } else if (lineElement) {
            lineElement.classList.remove('selection-preview');
        }
    });
}

// Check if node is in selection
function isNodeInSelection(nodeElement, selectionRect) {
        const nodeRect = nodeElement.getBoundingClientRect();
    const canvasRect = document.getElementById('canvasWorkspace').getBoundingClientRect();
        
        const nodeRelativeRect = {
            left: nodeRect.left - canvasRect.left,
            top: nodeRect.top - canvasRect.top,
            right: nodeRect.right - canvasRect.left,
            bottom: nodeRect.bottom - canvasRect.top
        };
        
    return !(selectionRect.right < nodeRelativeRect.left || 
             selectionRect.left > nodeRelativeRect.right || 
             selectionRect.bottom < nodeRelativeRect.top || 
             selectionRect.top > nodeRelativeRect.bottom);
}

// Check if connection is in selection
function isConnectionInSelection(connection, selectionRect) {
    const fromNode = document.getElementById(connection.from.nodeId);
    const toNode = document.getElementById(connection.to.nodeId);
    
    if (!fromNode || !toNode) return false;
    
    const fromPoint = fromNode.querySelector(`.connection-point.${connection.from.type}`);
    const toPoint = toNode.querySelector(`.connection-point.${connection.to.type}`);
    
    if (!fromPoint || !toPoint) return false;
    
    const canvasRect = document.getElementById('canvasWorkspace').getBoundingClientRect();
    
    const fromRect = fromPoint.getBoundingClientRect();
    const toRect = toPoint.getBoundingClientRect();
    
    const fromX = fromRect.left + fromRect.width / 2 - canvasRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - canvasRect.top;
    const toX = toRect.left + toRect.width / 2 - canvasRect.left;
    const toY = toRect.top + toRect.height / 2 - canvasRect.top;
    
    // Check if line intersects selection box
    const centerX = (fromX + toX) / 2;
    const centerY = (fromY + toY) / 2;
    
    return centerX >= selectionRect.left && centerX <= selectionRect.right &&
           centerY >= selectionRect.top && centerY <= selectionRect.bottom;
}

// End selection
function endSelection() {
    if (!isSelecting) return;
    
    console.log('📦 Ending selection');
    
    // Clear previous selection
    clearSelection();
    
    // Finalize selection
    document.querySelectorAll('.selection-preview').forEach(element => {
        if (element.classList.contains('workflow-node')) {
            selectedNodes.add(element.id);
            element.classList.remove('selection-preview');
            element.classList.add('selected');
        } else if (element.classList.contains('connection-line')) {
            selectedConnections.add(element.id);
            element.classList.remove('selection-preview');
            element.classList.add('selected');
        }
    });
    
    // Remove selection box
    if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
    }
    
    // Reset state
    isSelecting = false;
    
    // Remove global listeners
    document.removeEventListener('mousemove', updateSelectionBox);
    document.removeEventListener('mouseup', endSelection);
    
    console.log(`✅ Selected ${selectedNodes.size} nodes and ${selectedConnections.size} connections`);
}

// Clear selection
function clearSelection() {
    selectedNodes.forEach(nodeId => {
        const nodeElement = document.getElementById(nodeId);
        if (nodeElement) {
            nodeElement.classList.remove('selected', 'selection-preview');
        }
    });
    selectedNodes.clear();
    
    selectedConnections.forEach(connectionId => {
        const lineElement = document.getElementById(connectionId);
        if (lineElement) {
            lineElement.classList.remove('selected', 'selection-preview');
        }
    });
    selectedConnections.clear();
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (selectedNodes.size > 0 || selectedConnections.size > 0) {
                deleteSelectedElements();
                e.preventDefault();
            }
        }
        
        if (e.key === 'Escape') {
            clearSelection();
            if (isSelecting) {
                endSelection();
            }
            // Cancel connection if connecting
            if (isConnecting) {
                cancelConnection();
            }
        }
    });
}

// Delete selected elements
function deleteSelectedElements() {
    if (selectedNodes.size === 0 && selectedConnections.size === 0) return;
    
    const nodeCount = selectedNodes.size;
    const connectionCount = selectedConnections.size;
    
    console.log(`🗑️ Deleting ${nodeCount} nodes and ${connectionCount} connections`);
    
    // Delete connections
    selectedConnections.forEach(connectionId => {
        const connectionIndex = connections.findIndex(c => c.id === connectionId);
        if (connectionIndex !== -1) {
            const lineElement = document.getElementById(connectionId);
            if (lineElement) lineElement.remove();
            connections.splice(connectionIndex, 1);
        }
    });
    
    // Delete nodes
    selectedNodes.forEach(nodeId => {
        // Remove node's connections
    const nodeConnections = connections.filter(c => 
        c.from.nodeId === nodeId || c.to.nodeId === nodeId
    );
    
        nodeConnections.forEach(connection => {
            const lineElement = document.getElementById(connection.id);
            if (lineElement) lineElement.remove();
            const connectionIndex = connections.findIndex(c => c.id === connection.id);
            if (connectionIndex !== -1) connections.splice(connectionIndex, 1);
        });
        
        // Remove node
    const nodeIndex = workflowNodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) workflowNodes.splice(nodeIndex, 1);
    
    const nodeElement = document.getElementById(nodeId);
        if (nodeElement) nodeElement.remove();
    });
    
    // Clear selection
    clearSelection();
    
    console.log(`✅ Deleted ${nodeCount} nodes and ${connectionCount} connections`);
}

// Load models
function loadModels() {
    const modelsList = document.getElementById('modelsList');
    const modelsCount = document.getElementById('modelsCount');
    
    // Load user's assets from localStorage
    let userModels = [];
    try {
        const myAssets = JSON.parse(localStorage.getItem('myAssets')) || { tokens: [], shares: [] };
        
        // Get models that user owns
        myAssets.tokens.forEach(token => {
            if (token.quantity > 0) {
                const modelData = getModelData(token.modelName);
                if (modelData) {
                    userModels.push({
                        modelName: token.modelName,
                        type: 'token',
                        category: modelData.category,
                        quantity: token.quantity,
                        tokenPrice: modelData.tokenPrice,
                        sharePrice: modelData.sharePrice,
                        rating: modelData.rating,
                        purpose: modelData.purpose,
                        useCase: modelData.useCase
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error loading user models:', error);
    }
    
    // If no models owned, show some sample models
    if (userModels.length === 0) {
        userModels = [];
    }
    
    modelsList.innerHTML = '';
    
    userModels.forEach(model => {
        const modelElement = createModelElement(model);
        modelsList.appendChild(modelElement);
    });
    
    modelsCount.textContent = `${userModels.length} models`;
    console.log(`✅ Loaded ${userModels.length} models`);
}

// Create model element
function createModelElement(model) {
    const modelElement = document.createElement('div');
    modelElement.className = 'model-item';
    modelElement.draggable = true;
    
    modelElement.dataset.modelName = model.modelName;
    modelElement.dataset.modelType = model.type;
    modelElement.dataset.category = model.category;
    modelElement.dataset.quantity = model.quantity;
    
    const displayName = model.modelName.length > 25 ? 
        model.modelName.substring(0, 25) + '...' : model.modelName;
    
    modelElement.innerHTML = `
        <div class="model-header">
            <div class="model-name" title="${model.modelName}">${displayName}</div>
            <div class="model-type">${model.type}</div>
            </div>
            <div class="model-category">${model.category}</div>
        <div class="model-tokens">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6"/>
                <path d="m21 12-6-3-6 3-6-3"/>
                </svg>
            ${model.quantity}K tokens
        </div>
    `;
    
    modelElement.addEventListener('dragstart', handleDragStart);
    modelElement.addEventListener('dragend', handleDragEnd);
    
    // 添加触摸事件支持
    modelElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    modelElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    modelElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    return modelElement;
}

// Setup drag and drop
function setupDragAndDrop() {
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    
    canvasWorkspace.addEventListener('dragover', handleDragOver);
    canvasWorkspace.addEventListener('dragenter', handleDragEnter);
    canvasWorkspace.addEventListener('dragleave', handleDragLeave);
    canvasWorkspace.addEventListener('drop', handleDrop);
    
    console.log('✅ Drag and drop setup complete');
}

// Drag handlers
function handleDragStart(e) {
    console.log('🚀 Drag started:', e.target.dataset.modelName);
    
    draggedModel = {
        name: e.target.dataset.modelName,
        type: e.target.dataset.modelType,
        category: e.target.dataset.category,
        quantity: e.target.dataset.quantity
    };
    
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    hideDropZone();
    draggedModel = null;
}

function handleDragOver(e) {
        e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (draggedModel) {
        showDropZone();
    }
}

function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        hideDropZone();
    }
}

function handleDrop(e) {
    e.preventDefault();
    hideDropZone();
    
    console.log('🎯 Drop event triggered');
    
    if (!draggedModel) return;
    
    const canvasRect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(10, e.clientX - canvasRect.left - 140);
    const y = Math.max(10, e.clientY - canvasRect.top - 100);
    
        createWorkflowNode(draggedModel, x, y);
    
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            adjustCanvasViewport();
        }, 150);
    }

    draggedModel = null;
}

// Show/hide drop zone
function showDropZone() {
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.style.display = 'block';
        dropZone.classList.add('active');
    }
}

function hideDropZone() {
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.style.display = 'none';
        dropZone.classList.remove('active');
    }
}

// Create workflow node
function createWorkflowNode(model, x, y) {
    const nodeId = `node-${++nodeIdCounter}`;
    
    const nodeData = {
        id: nodeId,
        modelName: model.name,
        modelType: model.type,
        category: model.category,
        quantity: model.quantity,
        x: x,
        y: y
    };
    
    workflowNodes.push(nodeData);
    addNodeAndAdjustView(nodeData, { animate: true });
    
    console.log('✅ Created workflow node:', nodeData);
}



// Setup connection points functionality
function setupConnectionPoints(nodeElement, nodeData) {
    const connectionPoints = nodeElement.querySelectorAll('.connection-point');
    
    connectionPoints.forEach(point => {
        // Click to start connection
        point.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (isConnecting) {
                // If already connecting, end the connection
                endConnection(point);
    } else {
                // Start new connection
                startConnection(point, e);
            }
        });
        
        // Mouse enter - highlight as target during connection
        point.addEventListener('mouseenter', () => {
            if (isConnecting && point !== connectionStart.element) {
                point.classList.add('target');
                // Auto-connect when hovering over target point
                setTimeout(() => {
                    if (point.classList.contains('target')) {
                        endConnection(point);
                    }
                }, 200); // 200ms delay for auto-connect
            }
        });
        
        // Mouse leave - remove target highlight
        point.addEventListener('mouseleave', () => {
            point.classList.remove('target');
        });
    });
}

// Start connection from a point
function startConnection(point, event) {
    console.log('🔗 Starting connection from:', point.dataset.node, point.dataset.type);
    
    isConnecting = true;
    connectionStart = {
        element: point,
        nodeId: point.dataset.node,
        type: point.dataset.type
    };
    
    point.classList.add('connecting');
    
    // Show connection mode indicator
    showConnectionModeIndicator();
    
    // Create temporary line
    createTemporaryLine(point, event);
    
    // Add global mouse move listener
    document.addEventListener('mousemove', updateTemporaryLine);
    document.addEventListener('mouseup', cancelConnection);
}

// End connection at a point
function endConnection(targetPoint) {
    if (!isConnecting || !connectionStart) return;
    
    const startNodeId = connectionStart.nodeId;
            const targetNodeId = targetPoint.dataset.node;
    
    // Don't connect to the same node
    if (startNodeId !== targetNodeId) {
        createNodeConnection(connectionStart, {
            element: targetPoint,
                    nodeId: targetNodeId, 
            type: targetPoint.dataset.type
        });
        console.log('✅ Connection created:', startNodeId, '→', targetNodeId);
    }
    
    cancelConnection();
}

// Cancel connection
function cancelConnection() {
    if (!isConnecting) return;
    
    // Remove temporary line
    if (temporaryLine) {
        temporaryLine.remove();
        temporaryLine = null;
    }
    
    // Remove connecting class
    if (connectionStart && connectionStart.element) {
        connectionStart.element.classList.remove('connecting');
    }
    
    // Remove target highlights
    document.querySelectorAll('.connection-point.target').forEach(point => {
        point.classList.remove('target');
    });
    
    // Reset state
    isConnecting = false;
    connectionStart = null;
    
    // Remove global listeners
    document.removeEventListener('mousemove', updateTemporaryLine);
    document.removeEventListener('mouseup', cancelConnection);
    
    console.log('🚫 Connection cancelled');
    
    // Hide connection mode indicator
    hideConnectionModeIndicator();
}

// Show connection mode indicator
function showConnectionModeIndicator() {
    let indicator = document.getElementById('connectionModeIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connectionModeIndicator';
        indicator.className = 'connection-mode-indicator';
        indicator.innerHTML = `
            <div class="indicator-content">
                <span class="indicator-icon">🔗</span>
                <span class="indicator-text">Connection Mode - Click another point or press ESC to cancel</span>
            </div>
        `;
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

// Hide connection mode indicator
function hideConnectionModeIndicator() {
    const indicator = document.getElementById('connectionModeIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Create temporary line during connection
function createTemporaryLine(startPoint, event) {
    const svg = document.getElementById('connectionsSvg');
    const connectionsGroup = document.getElementById('connectionsGroup');
    
    const startRect = startPoint.getBoundingClientRect();
    const canvasRect = svg.getBoundingClientRect();
    
    const startX = startRect.left + startRect.width / 2 - canvasRect.left;
    const startY = startRect.top + startRect.height / 2 - canvasRect.top;
    const endX = event.clientX - canvasRect.left;
    const endY = event.clientY - canvasRect.top;
    
    temporaryLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    temporaryLine.setAttribute('class', 'connection-line temporary');
    temporaryLine.setAttribute('marker-end', 'url(#arrowhead)');
    
    const path = createCurvedPath(startX, startY, endX, endY);
    temporaryLine.setAttribute('d', path);
    
    connectionsGroup.appendChild(temporaryLine);
}

// Update temporary line position
function updateTemporaryLine(event) {
    if (!temporaryLine || !connectionStart) return;
    
    const svg = document.getElementById('connectionsSvg');
    const startPoint = connectionStart.element;
    
    const startRect = startPoint.getBoundingClientRect();
    const canvasRect = svg.getBoundingClientRect();
    
    const startX = startRect.left + startRect.width / 2 - canvasRect.left;
    const startY = startRect.top + startRect.height / 2 - canvasRect.top;
    const endX = event.clientX - canvasRect.left;
    const endY = event.clientY - canvasRect.top;
    
    const path = createCurvedPath(startX, startY, endX, endY);
    temporaryLine.setAttribute('d', path);
}

// Create curved path for connections
function createCurvedPath(startX, startY, endX, endY) {
    const midX = (startX + endX) / 2;
    const controlOffset = Math.abs(endX - startX) * 0.3;
    
    return `M ${startX} ${startY} Q ${startX + controlOffset} ${startY} ${midX} ${(startY + endY) / 2} Q ${endX - controlOffset} ${endY} ${endX} ${endY}`;
}

// Create actual connection between nodes
function createNodeConnection(start, end) {
    const connectionId = `connection-${++connectionIdCounter}`;
    
    // Check for duplicate connections
    const exists = connections.find(conn => 
        (conn.from.nodeId === start.nodeId && conn.to.nodeId === end.nodeId) ||
        (conn.from.nodeId === end.nodeId && conn.to.nodeId === start.nodeId)
    );
    
    if (exists) {
        console.log('⚠️ Connection already exists');
        return;
    }
    
    const connection = {
        id: connectionId,
        from: start,
        to: end
    };
    
    connections.push(connection);
    drawConnection(connection);
    
    // Update priorities when new connection is created
    updateAllPriorities();
}

// Draw permanent connection line
function drawConnection(connection) {
    const svg = document.getElementById('connectionsSvg');
    const connectionsGroup = document.getElementById('connectionsGroup');
    
    const fromNode = document.getElementById(connection.from.nodeId);
    const toNode = document.getElementById(connection.to.nodeId);
    
    if (!fromNode || !toNode) return;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('id', connection.id);
    line.setAttribute('class', 'connection-line');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    
    // Calculate and set path
    updateConnectionPath(connection, line);
    
    // Add click handler for selection
    line.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('🔗 Selected connection:', connection.id);
    });
    
    connectionsGroup.appendChild(line);
}

// Update connection path
function updateConnectionPath(connection, line) {
    const fromNode = document.getElementById(connection.from.nodeId);
    const toNode = document.getElementById(connection.to.nodeId);
    
    if (!fromNode || !toNode) return;
    
    const svg = document.getElementById('connectionsSvg');
    if (!svg) return;
    
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    const canvasRect = svg.getBoundingClientRect();
    
    // Get connection points
    const fromPoint = fromNode.querySelector(`.connection-point.${connection.from.type}`);
    const toPoint = toNode.querySelector(`.connection-point.${connection.to.type}`);
    
    if (!fromPoint || !toPoint) return;
    
    const fromRect = fromPoint.getBoundingClientRect();
    const toRect = toPoint.getBoundingClientRect();
    
    // Calculate positions relative to SVG, accounting for scroll
    let fromX, fromY, toX, toY;
    
    if (canvasWorkspace) {
        // Use workspace scroll offset for accurate positioning
        const workspaceRect = canvasWorkspace.getBoundingClientRect();
        const scrollLeft = canvasWorkspace.scrollLeft || 0;
        const scrollTop = canvasWorkspace.scrollTop || 0;
        
        fromX = fromRect.left - workspaceRect.left + scrollLeft;
        fromY = fromRect.top - workspaceRect.top + scrollTop;
        toX = toRect.left - workspaceRect.left + scrollLeft;
        toY = toRect.top - workspaceRect.top + scrollTop;
    } else {
        // Fallback to original method
        fromX = fromRect.left + fromRect.width / 2 - canvasRect.left;
        fromY = fromRect.top + fromRect.height / 2 - canvasRect.top;
        toX = toRect.left + toRect.width / 2 - canvasRect.left;
        toY = toRect.top + toRect.height / 2 - canvasRect.top;
    }
    
    const path = createCurvedPath(fromX, fromY, toX, toY);
    line.setAttribute('d', path);
}

// Update all connections when nodes move
function updateAllConnections() {
    connections.forEach(connection => {
        const line = document.getElementById(connection.id);
        if (line) {
            updateConnectionPath(connection, line);
        }
    });
}

// Update connections on window resize (especially important for mobile)
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        updateAllConnections();
    }, 250);
});


// Update all node priorities based on position
function updateAllPriorities() {
    // This function can be used to update execution order based on node positions
    // For now, it's a placeholder for future functionality
    console.log('🔄 Updated node priorities');
}

// Setup node dragging
function setupNodeDragging(nodeElement, nodeData) {
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let nodeStart = { x: 0, y: 0 };
    
    nodeElement.addEventListener('mousedown', (e) => {
        if (e.target.closest('.node-control')) return;
        
            isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
            nodeStart = { x: nodeData.x, y: nodeData.y };
            
            nodeElement.classList.add('dragging');
            
            document.addEventListener('mousemove', handleNodeDrag);
            document.addEventListener('mouseup', handleNodeDragEnd);
        
        e.preventDefault();
    });
    
    function handleNodeDrag(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        
        nodeData.x = Math.max(0, nodeStart.x + deltaX);
        nodeData.y = Math.max(0, nodeStart.y + deltaY);
        
        nodeElement.style.left = `${nodeData.x}px`;
        nodeElement.style.top = `${nodeData.y}px`;
        
        // Update connections when node moves
        updateAllConnections();
        
        // Update priorities when node position changes
        updateAllPriorities();
    }
    
    function handleNodeDragEnd() {
        isDragging = false;
        nodeElement.classList.remove('dragging');
        
        document.removeEventListener('mousemove', handleNodeDrag);
        document.removeEventListener('mouseup', handleNodeDragEnd);
    }
}

// UI Functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

function filterModels() {
    const searchTerm = document.getElementById('modelSearch').value.toLowerCase();
    const modelItems = document.querySelectorAll('.model-item');
    
    modelItems.forEach(item => {
        const modelName = item.dataset.modelName.toLowerCase();
        const category = item.dataset.category.toLowerCase();
        const visible = modelName.includes(searchTerm) || category.includes(searchTerm);
        item.style.display = visible ? 'block' : 'none';
    });
}

function clearCanvas() {
    if (workflowNodes.length === 0) return;
    
    if (confirm('Clear entire canvas? This cannot be undone.')) {
        workflowNodes.forEach(node => {
            const nodeElement = document.getElementById(node.id);
            if (nodeElement) nodeElement.remove();
        });
        
        // Clear connections
        connections.forEach(connection => {
            const lineElement = document.getElementById(connection.id);
            if (lineElement) lineElement.remove();
        });
        
        workflowNodes = [];
        connections = [];
        nodeIdCounter = 0;
        connectionIdCounter = 0;
        
        // Reset button states
        document.getElementById('saveRunBtn').style.display = 'flex';
        document.getElementById('runBtn').style.display = 'none';
        
        // Clear workflow data
        localStorage.removeItem('currentWorkflow');
        
        console.log('🧹 Canvas cleared');
    }
}

function saveWorkflow() {
    const workflow = {
        nodes: workflowNodes,
        connections: connections,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('savedWorkflow', JSON.stringify(workflow));
    localStorage.setItem('canvasWorkflow', JSON.stringify(workflow)); // 双重保存
    alert('✅ Workflow saved successfully!');
    console.log('💾 Workflow saved:', workflow);
}

function runWorkflow() {
    if (workflowNodes.length === 0) {
        alert('⚠️ Please add some models to create a workflow first.');
        return;
    }

    // Build a sequential topological order (no parallel). Tie-break by x, then name.
    const nodes = workflowNodes.map(n => ({ id: n.id, name: n.modelName, category: n.category, x: n.x || 0 }));
    const nodeIds = new Set(nodes.map(n => n.id));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const posX = new Map(nodes.map(n => [n.id, n.x]));

    const edges = connections
        .filter(c => nodeIds.has(c.from.nodeId) && nodeIds.has(c.to.nodeId) && c.from.nodeId !== c.to.nodeId)
        .map(c => ({ from: c.from.nodeId, to: c.to.nodeId }));

    const inDeg = new Map();
    nodes.forEach(n => inDeg.set(n.id, 0));
    edges.forEach(e => inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1));

    const adj = new Map();
    nodes.forEach(n => adj.set(n.id, []));
    edges.forEach(e => adj.get(e.from).push(e.to));

    const ready = [];
    inDeg.forEach((deg, id) => { if (deg === 0) ready.push(id); });
    ready.sort((a, b) => (posX.get(a) - posX.get(b)) || (byId.get(a).name.localeCompare(byId.get(b).name)));

    const seq = [];
    let processed = 0;
    while (ready.length) {
        const u = ready.shift();
        seq.push(u);
        processed++;
        for (const v of adj.get(u)) {
            inDeg.set(v, inDeg.get(v) - 1);
            if (inDeg.get(v) === 0) {
                ready.push(v);
                ready.sort((a, b) => (posX.get(a) - posX.get(b)) || (byId.get(a).name.localeCompare(byId.get(b).name)));
            }
        }
    }

    let orderedNodes;
    let orderNote;
    if (processed !== nodes.length) {
        // Cycle fallback: left → right
        orderedNodes = [...workflowNodes].sort((a, b) => a.x - b.x);
        orderNote = 'Left to Right (cycle fallback)';
        console.warn('⚠️ Cycle detected in canvas workflow. Using left→right order.');
    } else {
        orderedNodes = seq.map(id => byId.get(id)).filter(Boolean);
        orderNote = 'Topological order (no parallel)';
    }

    let description = `🚀 Running workflow with ${workflowNodes.length} nodes:\n\n`;
    orderedNodes.forEach((node, index) => {
        description += `${index + 1}. ${node.name || node.modelName} (${node.category})\n`;
    });
    description += `\n📊 Execution order: ${orderNote}\n`;
    description += `✨ Workflow execution simulated successfully!`;

    alert(description);
    console.log('🚀 Workflow executed:', orderedNodes.map(n => (n.name || n.modelName)));
}

function configureNode(nodeId) {
    const node = workflowNodes.find(n => n.id === nodeId);
    if (node) {
        alert(`⚙️ Configure ${node.modelName}\n\nThis feature allows you to set model parameters and options.`);
    }
}

function deleteNode(nodeId) {
    if (confirm('Delete this node?')) {
        const nodeIndex = workflowNodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) {
            workflowNodes.splice(nodeIndex, 1);
        }
        
        const nodeElement = document.getElementById(nodeId);
        if (nodeElement) {
            nodeElement.remove();
        }
        
        console.log('🗑️ Node deleted:', nodeId);
    }
}

// Modal functions
function showSaveRunModal() {
    if (workflowNodes.length === 0) {
        alert('⚠️ Please add some models to create a workflow first.');
        return;
    }
    
    const modal = document.getElementById('saveRunModal');
    modal.classList.add('show');
    
    // Focus on the first input
    setTimeout(() => {
        document.getElementById('workflowName').focus();
    }, 100);
}

function hideSaveRunModal() {
    const modal = document.getElementById('saveRunModal');
    modal.classList.remove('show');
    
    // Clear form
    document.getElementById('workflowName').value = '';
    document.getElementById('workflowDescription').value = '';
    document.getElementById('visibilityPublic').checked = true;
}

function saveAndRunWorkflow() {
    const nameInput = document.getElementById('workflowName');
    const descInput = document.getElementById('workflowDescription');

    const workflowName = nameInput ? nameInput.value.trim() : '';
    const workflowDescription = descInput ? descInput.value.trim() : '';
    const visibility = 'private';

    if (!workflowName) {
        alert('请输入工作流名称。');
        return;
    }

    if (!workflowNodes || workflowNodes.length === 0) {
        alert('请先在画布中添加至少一个模型。');
        return;
    }

    // 模型列表（用于 My Workflows 显示）
    const modelsList = workflowNodes.map(node => node.modelName);
    const modelsUsed = modelsList.length > 0
        ? `${modelsList.join(', ')} (${modelsList.length} models)`
        : 'None';

    // 构造基础 workflow 对象（注意这里还没有 sequence/graph，稍后由 runSelectedWorkflow 补齐）
    const completeWorkflowData = {
        id: 'workflow_' + Date.now(),
        name: workflowName,
        description: workflowDescription,
        visibility: visibility,
        // My Workflows 需要的字段
        models: modelsList,
        modelsUsed: modelsUsed,
        modelCount: modelsList.length,
        // 节点信息
        nodes: workflowNodes.map(node => ({
            id: node.id,
            modelName: node.modelName,
            modelType: node.modelType,
            category: node.category,
            quantity: node.quantity,
            x: node.x,
            y: node.y
        })),
        // 连接信息
        connections: connections.map(conn => ({
            id: conn.id,
            from: {
                nodeId: conn.from.nodeId,
                type: conn.from.type
            },
            to: {
                nodeId: conn.to.nodeId,
                type: conn.to.type
            }
        })),
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        // 先标记为 ready，真正开始运行由 runSelectedWorkflow 改成 running
        status: 'ready'
    };

    // 保存到 canvasWorkflow：方便 Canvas 恢复
    localStorage.setItem('canvasWorkflow', JSON.stringify(completeWorkflowData));

    // 保存到 My Workflows 列表（统一用已有的工具函数）
    saveWorkflowToMyAssets(completeWorkflowData);

    // 设置当前要运行的 workflow，稍后 runSelectedWorkflow 会在此基础上补充 graph/sequence 等字段
    localStorage.setItem('currentWorkflow', JSON.stringify(completeWorkflowData));

    // 关掉弹窗
    hideSaveRunModal();

    // 直接复用统一的运行逻辑：
    // 1）根据 workflowNodes / connections 计算 sequence 和 graph
    // 2）把 wf.status 设置为 'running'
    // 3）写回 currentWorkflow
    // 4）弹出顺序提示并跳转到 index.html
    runSelectedWorkflow();
}

// Load workflow to canvas
function loadWorkflowToCanvas(workflow) {
    console.log('🔄 Loading workflow to canvas:', workflow.name);
    
    // Force clear existing nodes without confirmation
    workflowNodes.forEach(node => {
        const nodeElement = document.getElementById(node.id);
        if (nodeElement) nodeElement.remove();
    });
    
    // Clear connections from DOM
    const connectionsGroup = document.getElementById('connectionsGroup');
    if (connectionsGroup) {
        connectionsGroup.innerHTML = '';
    }
    
    // Clear connections array
    connections.forEach(connection => {
        const lineElement = document.getElementById(connection.id);
        if (lineElement) lineElement.remove();
    });
    
    workflowNodes = [];
    connections = [];
    nodeIdCounter = 0;
    connectionIdCounter = 0;
    
    // Create nodes for each model in the workflow
    const isMobile = window.innerWidth <= 768;
    let xOffset = 100;
    let yOffset = 100;
    
    // Calculate center position for mobile
    let centerX = 50; // Default fallback
    if (isMobile) {
        const canvasWorkspace = document.getElementById('canvasWorkspace');
        if (canvasWorkspace) {
            const workspaceWidth = canvasWorkspace.clientWidth || canvasWorkspace.offsetWidth;
            const nodeWidth = 200; // Mobile node width (max-width from CSS)
            centerX = Math.max(20, (workspaceWidth - nodeWidth) / 2);
        }
    }
    
    workflow.models.forEach((model, index) => {
        // Find the model in our model data
        const modelData = findModelByName(model.name);
        if (modelData) {
            if (isMobile) {
                // Mobile: vertical layout (top to bottom), centered horizontally
                createWorkflowNode(modelData, centerX, yOffset);
                yOffset += 250; // Space between nodes vertically
            } else {
                // Desktop: horizontal layout (left to right)
                createWorkflowNode(modelData, xOffset, 200);
                xOffset += 350; // Space between nodes horizontally
            }
        }
    });
    
    // Connect nodes sequentially
    setTimeout(() => {
        connectWorkflowNodes();
    }, 500);
    
    // Show Run button and hide Save and Run button
    document.getElementById('saveRunBtn').style.display = 'none';
    document.getElementById('runBtn').style.display = 'flex';
    
    // Store workflow data
    localStorage.setItem('currentWorkflow', JSON.stringify({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: 'ready'
    }));
    
    console.log('✅ Workflow loaded successfully');
}

// Find model by name
function findModelByName(name) {
    // Use model-data.js to get real model information
    const modelData = getModelData(name);
    if (modelData) {
        return {
            name: name,
            type: modelData.category,
            category: modelData.category,
            quantity: 2, // Default quantity
            purpose: modelData.purpose,
            useCase: modelData.useCase,
            industry: modelData.industry,
            rating: modelData.rating,
            tokenPrice: modelData.tokenPrice,
            sharePrice: modelData.sharePrice
        };
    }
    
    // Fallback for models not in model-data.js
    return {
        name: name,
        type: 'AI Model',
        category: 'AI Research',
        quantity: 2
    };
}

// Connect workflow nodes sequentially
function connectWorkflowNodes() {
    // First, clear all existing connections from DOM
    const connectionsGroup = document.getElementById('connectionsGroup');
    if (connectionsGroup) {
        connectionsGroup.innerHTML = '';
    }
    
    // Clear connections array
    connections = [];
    connectionIdCounter = 0;
    
    // Get all nodes and sort them appropriately
    const nodes = Array.from(document.querySelectorAll('.workflow-node'));
    const isMobile = window.innerWidth <= 768;
    
    // Sort nodes: mobile = top to bottom (by y), desktop = left to right (by x)
    const sortedNodes = nodes.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        if (isMobile) {
            // Mobile: sort by top position (top to bottom)
            return rectA.top - rectB.top;
        } else {
            // Desktop: sort by left position (left to right)
            return rectA.left - rectB.left;
        }
    });
    
    console.log(`🔗 Connecting ${sortedNodes.length} nodes sequentially (${isMobile ? 'mobile: top-to-bottom' : 'desktop: left-to-right'})...`);
    
    // Connect nodes in order
    for (let i = 0; i < sortedNodes.length - 1; i++) {
        const currentNode = sortedNodes[i];
        const nextNode = sortedNodes[i + 1];
        
        let startPoint, endPoint, startType, endType;
        
        if (isMobile) {
            // Mobile: connect from bottom to top (bottom of current to top of next)
            startPoint = currentNode.querySelector('.connection-point.bottom') || 
                        currentNode.querySelector('.connection-point.right');
            endPoint = nextNode.querySelector('.connection-point.top') || 
                      nextNode.querySelector('.connection-point.left');
            startType = startPoint?.classList.contains('bottom') ? 'bottom' : 'right';
            endType = endPoint?.classList.contains('top') ? 'top' : 'left';
        } else {
            // Desktop: connect from right to left (right of current to left of next)
            startPoint = currentNode.querySelector('.connection-point.right');
            endPoint = nextNode.querySelector('.connection-point.left');
            startType = 'right';
            endType = 'left';
        }
        
        if (startPoint && endPoint) {
            // Create connection between nodes
            const start = {
                element: startPoint,
                nodeId: startPoint.dataset.node,
                type: startType
            };
            
            const end = {
                element: endPoint,
                nodeId: endPoint.dataset.node,
                type: endType
            };
            
            createNodeConnection(start, end);
        }
    }
    
    // Update all connections after a short delay to ensure DOM is ready
    setTimeout(() => {
        updateAllConnections();
    }, 100);
    
    console.log(`✅ Connected ${connections.length} connections`);
}

// Run selected workflow
function runSelectedWorkflow() {
    const currentWorkflow = localStorage.getItem('currentWorkflow');
    if (!currentWorkflow) {
        alert('⚠️ No workflow selected to run.');
        return;
    }
    
    // Build exportable graph and a single sequential topological order (no parallel)
    function exportWorkflowGraphAndSequence() {
        // Enrich nodes with model description from model-data.js
        const nodes = workflowNodes.map(n => {
            const md = (typeof getModelData === 'function') ? getModelData(n.modelName) : null;
            return {
                id: n.id,
                name: n.modelName,
                category: n.category,
                purpose: md && md.purpose ? md.purpose : '',
                useCase: md && md.useCase ? md.useCase : '',
                industry: md && md.industry ? md.industry : ''
            };
        });
        const nodeIds = new Set(nodes.map(n => n.id));
        const posX = new Map(workflowNodes.map(n => [n.id, n.x || 0]));
        
        // Directed edges
        const edges = connections
            .filter(c => nodeIds.has(c.from.nodeId) && nodeIds.has(c.to.nodeId) && c.from.nodeId !== c.to.nodeId)
            .map(c => ({ from: c.from.nodeId, to: c.to.nodeId }));
        
        // Kahn's algorithm → single sequence with tie-breakers
        const inDeg = new Map();
        nodes.forEach(n => inDeg.set(n.id, 0));
        edges.forEach(e => inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1));
        
        const adj = new Map();
        nodes.forEach(n => adj.set(n.id, []));
        edges.forEach(e => adj.get(e.from).push(e.to));
        
        const byId = new Map(nodes.map(n => [n.id, n]));
        const ready = [];
        inDeg.forEach((deg, id) => { if (deg === 0) ready.push(id); });
        ready.sort((a, b) => (posX.get(a) - posX.get(b)) || (byId.get(a).name.localeCompare(byId.get(b).name)));
        
        const seq = [];
        let processed = 0;
        while (ready.length) {
            const u = ready.shift();
            seq.push(u);
            processed++;
            for (const v of adj.get(u)) {
                inDeg.set(v, inDeg.get(v) - 1);
                if (inDeg.get(v) === 0) {
                    ready.push(v);
                    ready.sort((a, b) => (posX.get(a) - posX.get(b)) || (byId.get(a).name.localeCompare(byId.get(b).name)));
                }
            }
        }
        
        if (processed !== nodes.length) {
            console.warn('⚠️ Cycle detected; falling back to left→right order.');
            const byX = [...workflowNodes].sort((a,b) => a.x - b.x).map(n => n.id);
            return {
                nodes,
                edges,
                sequenceByIds: byX,
                sequenceByNames: byX.map(id => nodes.find(n => n.id === id) && nodes.find(n => n.id === id).name).filter(Boolean)
            };
        }
        
        const sequenceByNames = seq.map(id => byId.get(id) && byId.get(id).name).filter(Boolean);
        return { nodes, edges, sequenceByIds: seq, sequenceByNames };
    }
    
    try {
        const wf = JSON.parse(currentWorkflow);
        const runId = Date.now().toString();
        const { nodes, edges, sequenceByNames } = exportWorkflowGraphAndSequence();
        const experts = nodes.map(n => n.name);
        const expertDetails = nodes.map(n => ({
            name: n.name,
            purpose: n.purpose,
            useCase: n.useCase,
            category: n.category,
            industry: n.industry
        }));
        
        wf.status = 'running';
        wf.runId = runId;
        wf.experts = experts;
        wf.expertDetails = expertDetails;
        wf.graph = { nodes, edges };
        wf.sequence = sequenceByNames;
        
        localStorage.setItem('currentWorkflow', JSON.stringify(wf));
        
        // Clear any forced model when starting workflow from Canvas
        localStorage.removeItem('forcedModel');
        console.log('🧹 Cleared forcedModel when starting workflow from Canvas');
        
        alert(`🚀 Starting workflow: ${wf.name}\n\nOrder: ${sequenceByNames.join(' → ')}`);
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (e) {
        console.error('Error running workflow:', e);
        alert('❌ Error running workflow');
    }
}

// 收集当前canvas上的workflow数据
function collectWorkflowData() {
    const models = [];
    const nodeData = [];
    
    workflowNodes.forEach((node, index) => {
        models.push(node.modelName);
        nodeData.push({
            id: node.id,
            modelName: node.modelName,
            x: node.x,
            y: node.y,
            index: index
        });
    });
    
    // 收集连接数据
    const connectionData = connections.map(conn => ({
        id: conn.id,
        from: conn.from,
        to: conn.to
    }));
    
    return {
        models: models,
        nodes: nodeData,
        connections: connectionData
    };
}

// 保存workflow到My Assets
function saveWorkflowToMyAssets(workflow) {
    try {
        let myWorkflows = JSON.parse(localStorage.getItem('myWorkflows')) || [];
        myWorkflows.push(workflow);
        localStorage.setItem('myWorkflows', JSON.stringify(myWorkflows));
        console.log('Workflow saved to My Assets:', workflow);
        return true;
    } catch (error) {
        console.error('Error saving workflow:', error);
        alert('Failed to save workflow. Please try again.');
        return false;
    }
}

// 触摸拖拽相关变量
let touchDragState = {
    isDragging: false,
    model: null,
    startX: 0,
    startY: 0,
    ghostElement: null
};

// 触摸开始
function handleTouchStart(e) {
    const modelItem = e.currentTarget;
    if (!modelItem.classList.contains('model-item')) return;
    
    const touch = e.touches[0];
    touchDragState.startX = touch.clientX;
    touchDragState.startY = touch.clientY;
    touchDragState.model = {
        name: modelItem.dataset.modelName,
        type: modelItem.dataset.modelType,
        category: modelItem.dataset.category,
        quantity: modelItem.dataset.quantity
    };
    
    // 创建拖拽时的虚拟元素
    const ghost = modelItem.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.7';
    ghost.style.zIndex = '10000';
    ghost.style.width = modelItem.offsetWidth + 'px';
    ghost.style.left = touch.clientX - modelItem.offsetWidth / 2 + 'px';
    ghost.style.top = touch.clientY - 30 + 'px';
    ghost.classList.add('dragging');
    document.body.appendChild(ghost);
    touchDragState.ghostElement = ghost;
    
    // 标记原始元素
    modelItem.style.opacity = '0.5';
    
    console.log('📱 Touch drag started:', touchDragState.model.name);
}

// 触摸移动
function handleTouchMove(e) {
    if (!touchDragState.model || !touchDragState.ghostElement) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    
    // 更新虚拟元素位置
    touchDragState.ghostElement.style.left = touch.clientX - touchDragState.ghostElement.offsetWidth / 2 + 'px';
    touchDragState.ghostElement.style.top = touch.clientY - 30 + 'px';
    
    // 检查是否在canvas区域
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    const canvasRect = canvasWorkspace.getBoundingClientRect();
    const dropZone = document.getElementById('dropZone');
    
    if (touch.clientX >= canvasRect.left && 
        touch.clientX <= canvasRect.right &&
        touch.clientY >= canvasRect.top && 
        touch.clientY <= canvasRect.bottom) {
        touchDragState.isDragging = true;
        if (dropZone) {
            dropZone.style.display = 'block';
            dropZone.classList.add('active');
        }
    } else {
        if (dropZone) {
            dropZone.style.display = 'none';
            dropZone.classList.remove('active');
        }
    }
}

// 触摸结束
function handleTouchEnd(e) {
    const modelItems = document.querySelectorAll('.model-item');
    modelItems.forEach(item => item.style.opacity = '1');
    
    if (!touchDragState.model) return;
    
    const touch = e.changedTouches[0];
    const canvasWorkspace = document.getElementById('canvasWorkspace');
    const canvasRect = canvasWorkspace.getBoundingClientRect();
    const dropZone = document.getElementById('dropZone');
    
    // 移除虚拟元素
    if (touchDragState.ghostElement) {
        touchDragState.ghostElement.remove();
    }
    
    // 隐藏drop zone
    if (dropZone) {
        dropZone.style.display = 'none';
        dropZone.classList.remove('active');
    }
    
    // 检查是否在canvas上放下
    if (touch.clientX >= canvasRect.left && 
        touch.clientX <= canvasRect.right &&
        touch.clientY >= canvasRect.top && 
        touch.clientY <= canvasRect.bottom) {
        
        // 计算相对于canvas的位置
        const x = Math.max(10, touch.clientX - canvasRect.left - 140 + canvasWorkspace.scrollLeft);
        const y = Math.max(10, touch.clientY - canvasRect.top - 100 + canvasWorkspace.scrollTop);
        
        console.log('📱 Touch drop at:', x, y);
        createWorkflowNode(touchDragState.model, x, y);
        
        // 调整视口
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                adjustCanvasViewport();
            }, 150);
        }
    }
    
    // 重置状态
    touchDragState = {
        isDragging: false,
        model: null,
        startX: 0,
        startY: 0,
        ghostElement: null
    };
    
    console.log('📱 Touch drag ended');
}

// 保留原有的触摸支持函数用于节点拖拽
function addTouchSupport() {
    // 节点拖拽的触摸支持
    document.addEventListener('touchstart', function(e) {
        if (e.target.closest('.workflow-node') && !e.target.closest('.connection-point')) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                bubbles: true
            });
            e.target.dispatchEvent(mouseEvent);
        }
    }, { passive: false });
    
    document.addEventListener('touchmove', function(e) {
        if (e.target.closest('.workflow-node') || touchDragState.isDragging) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                bubbles: true
            });
            document.dispatchEvent(mouseEvent);
            e.preventDefault();
        }
    }, { passive: false });
    
    document.addEventListener('touchend', function(e) {
        if (e.target.closest('.workflow-node')) {
            const mouseEvent = new MouseEvent('mouseup', {
                bubbles: true
            });
            document.dispatchEvent(mouseEvent);
        }
    });
}

// 调整 Canvas 视口以适配手机屏幕
function adjustCanvasViewport() {
    const workspace = document.querySelector('.canvas-workspace');
    if (!workspace || window.innerWidth > 768) return;
    
    const nodes = workspace.querySelectorAll('.workflow-node');
    if (nodes.length === 0) return;
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    const workspaceRect = workspace.getBoundingClientRect();
    
    nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const x = rect.left - workspaceRect.left + workspace.scrollLeft;
        const y = rect.top - workspaceRect.top + workspace.scrollTop;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + rect.width);
        maxY = Math.max(maxY, y + rect.height);
    });
    
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        return;
    }
    
    const centerX = (minX + maxX) / 2 - workspace.clientWidth / 2;
    const centerY = (minY + maxY) / 2 - workspace.clientHeight / 2;
    
    workspace.scrollTo({
        left: Math.max(0, centerX),
        top: Math.max(0, centerY),
        behavior: 'smooth'
    });
}

function addNodeAndAdjustView(nodeData, options = {}) {
    createNodeElement(nodeData, options);
    
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            adjustCanvasViewport();
        }, 100);
    }
}

// 移动端 Sidebar 切换功能
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggleBtn = document.querySelector('.mobile-sidebar-toggle');
    
    if (!(sidebar && overlay && toggleBtn)) {
        return;
    }
    
    const isOpen = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    overlay.classList.toggle('show', isOpen);
    toggleBtn.innerHTML = isOpen
        ? `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `
        : `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        `;
}

// 检查屏幕大小，确保状态同步
function checkMobileView() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggleBtn = document.querySelector('.mobile-sidebar-toggle');
    
    if (!(sidebar && overlay && toggleBtn)) {
        return;
    }
    
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    toggleBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
    `;
}

window.addEventListener('load', checkMobileView);
window.addEventListener('resize', checkMobileView);

// Export functions
window.toggleSidebar = toggleSidebar;
window.filterModels = filterModels;
window.clearCanvas = clearCanvas;
window.saveWorkflow = saveWorkflow;
window.runWorkflow = runWorkflow;
window.configureNode = configureNode;
window.deleteNode = deleteNode;
window.showSaveRunModal = showSaveRunModal;
window.hideSaveRunModal = hideSaveRunModal;
window.saveAndRunWorkflow = saveAndRunWorkflow;
window.runSelectedWorkflow = runSelectedWorkflow;
function getCurrentCanvasModels() {
    return workflowNodes.map(node => node.modelName);
}
window.getCurrentCanvasModels = getCurrentCanvasModels;
window.toggleMobileSidebar = toggleMobileSidebar;

console.log('✅ Canvas Workflow JavaScript loaded');
