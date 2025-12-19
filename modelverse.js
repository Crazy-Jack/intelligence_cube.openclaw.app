// ================================
// Modelverse - modelverse.js (Replacement, v3.1)
// ================================
// New in v3.1:
//  • Donut Pie chart ALWAYS draws. If data.purchasedPercent is missing or >35, use demo-friendly random [10,35].
//  • Keeps v3 features: Category/Industry in modal; Market Change sign from row; search panel hidden on open;
//    robust button rebinding so every row opens its own card.
// ================================

let currentModelverseTab = window.currentModelverseTab || 'local';
window.currentModelverseTab = currentModelverseTab;

function getActiveModelsPanel() {
  return document.querySelector(`.models-tab-panel[data-tab="${currentModelverseTab}"]`) || document.querySelector('.models-tab-panel');
}

function getVisibleRowCount(panel) {
  if (!panel) return 0;
  const rows = panel.querySelectorAll('.models-table tbody tr');
  if (!rows.length) return 0;
  let visible = 0;
  rows.forEach(row => {
    if (row.style.display !== 'none') visible++;
  });
  return visible || rows.length;
}

function refreshModelCounts() {
  const panel = getActiveModelsPanel();
  const totalRows = panel ? panel.querySelectorAll('.models-table tbody tr').length : 0;
  const visible = getVisibleRowCount(panel) || totalRows;
  updateSearchResultCount(visible);
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString();
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------- Markdown Renderer ----------
// modelId is optional - used to convert relative paths to HuggingFace URLs
function renderMarkdown(text, modelId) {
  if (!text) return '';
  let s = String(text);
  
  // Helper to convert relative paths to HuggingFace URLs
  function toHfUrl(path) {
    if (!path) return path;
    // Already absolute URL
    if (/^https?:\/\//i.test(path)) return path;
    // Already a data URL
    if (/^data:/i.test(path)) return path;
    // Anchor links
    if (path.startsWith('#')) return path;
    // Convert relative path to HuggingFace URL
    if (modelId) {
      // Remove leading ./ if present
      const cleanPath = path.replace(/^\.\//, '');
      return `https://huggingface.co/${modelId}/resolve/main/${cleanPath}`;
    }
    return path;
  }
  
  // Remove YAML frontmatter (--- delimited metadata at the start of file)
  s = s.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/m, '');
  
  // Remove HTML comments (<!-- ... -->)
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  
  // Store placeholders for preserved content
  const placeholders = [];
  
  // FIRST: Process code blocks before anything else (to preserve their content)
  // Handle fenced code blocks: ```lang\ncode\n```
  s = s.replace(/```(\w*)[ \t]*\r?\n([\s\S]*?)```/g, function(match, lang, code) {
    const idx = placeholders.length;
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();
    const html = `<pre style="background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px;margin:12px 0;"><code>${escapedCode}</code></pre>`;
    placeholders.push(html);
    return `\x00PLACEHOLDER${idx}\x00`;
  });
  
  // Preserve safe HTML tags commonly used in READMEs
  // Safe tags: structural, text formatting, media
  const safeTagPattern = /<(\/?)(\s*)(h[1-6]|div|span|p|br|hr|img|a|strong|b|em|i|u|s|sub|sup|code|pre|blockquote|ul|ol|li|table|thead|tbody|tr|th|td|details|summary|center|figure|figcaption)(\s+[^>]*)?(\s*\/?\s*)>/gi;
  
  s = s.replace(safeTagPattern, function(match) {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\x00PLACEHOLDER${idx}\x00`;
  });
  
  // Also preserve common HTML entities
  s = s.replace(/&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, function(match) {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\x00PLACEHOLDER${idx}\x00`;
  });
  
  // Escape remaining HTML for safety
  s = s.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;');
  
  // Inline code: `code`
  s = s.replace(/`([^`]+?)`/g, '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px;">$1</code>');
  
  // Tables: Parse markdown tables
  s = s.replace(/(\|[^\n]+\|\n)(\|[\s:\-|]+\|\n)((?:\|[^\n]+\|\n?)+)/g, function(match, headerRow, separatorRow, bodyRows) {
    // Parse header
    const headers = headerRow.trim().split('|').filter(cell => cell.trim() !== '');
    
    // Parse alignment from separator row
    const alignments = separatorRow.trim().split('|').filter(cell => cell.trim() !== '').map(cell => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    });
    
    // Parse body rows
    const rows = bodyRows.trim().split('\n').map(row => 
      row.split('|').filter(cell => cell !== '').map(cell => cell.trim())
    );
    
    // Build HTML table
    let tableHtml = '<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">';
    
    // Header
    tableHtml += '<thead><tr style="background:#f3f4f6;">';
    headers.forEach((header, i) => {
      const align = alignments[i] || 'left';
      tableHtml += `<th style="border:1px solid #e5e7eb;padding:10px 12px;text-align:${align};font-weight:600;color:#374151;">${header.trim()}</th>`;
    });
    tableHtml += '</tr></thead>';
    
    // Body
    tableHtml += '<tbody>';
    rows.forEach((row, rowIndex) => {
      const bgColor = rowIndex % 2 === 0 ? 'white' : '#f9fafb';
      tableHtml += `<tr style="background:${bgColor};">`;
      row.forEach((cell, i) => {
        const align = alignments[i] || 'left';
        tableHtml += `<td style="border:1px solid #e5e7eb;padding:10px 12px;text-align:${align};color:#4b5563;">${cell}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    
    return tableHtml;
  });
  
  // Images: ![alt](src) - render as actual images (convert relative paths to HuggingFace URLs)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, src) {
    const resolvedSrc = toHfUrl(src.trim());
    return `<img src="${resolvedSrc}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;">`;
  });
  
  // Links: [text](url) - handle both absolute and relative URLs
  s = s.replace(/\[([^\]]+?)\]\(([^)]+)\)/g, function(_, label, url) {
    const resolvedUrl = toHfUrl(url.trim());
    // Determine if it's a downloadable file (PDF, zip, etc.)
    const isDownload = /\.(pdf|zip|tar|gz|rar|7z|doc|docx|xls|xlsx|ppt|pptx)$/i.test(resolvedUrl);
    const downloadAttr = isDownload ? ' download' : '';
    return `<a href="${resolvedUrl}" target="_blank" rel="noopener noreferrer"${downloadAttr} style="color:#8b7cf6;text-decoration:none;">${label}</a>`;
  });
  
  // Badge images (common in READMEs): [![name](img)](url)
  s = s.replace(/\[(&lt;img[^&]*&gt;)\]\((https?:\/\/[^\s)]+)\)/g, function(_, img, url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${img}</a>`;
  });
  
  // Headers: # ## ### #### (at start of line)
  s = s.replace(/^#### (.+)$/gm, '<h4 style="font-size:16px;font-weight:600;margin:16px 0 8px;color:#1f2937;">$1</h4>');
  s = s.replace(/^### (.+)$/gm, '<h3 style="font-size:18px;font-weight:600;margin:16px 0 8px;color:#1f2937;">$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2 style="font-size:20px;font-weight:600;margin:20px 0 10px;color:#1f2937;">$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:700;margin:24px 0 12px;color:#1f2937;">$1</h1>');
  
  // Bold: **text** or __text__
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_ (but not inside URLs or already processed)
  s = s.replace(/(?<![\/\w])\*([^*]+?)\*(?![\/\w])/g, '<em>$1</em>');
  s = s.replace(/(?<![\/\w])_([^_]+?)_(?![\/\w])/g, '<em>$1</em>');
  
  // Blockquotes: > text
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:4px solid #8b7cf6;padding-left:12px;margin:12px 0;color:#6b7280;font-style:italic;">$1</blockquote>');
  
  // Unordered lists: - item or * item
  s = s.replace(/^[-*] (.+)$/gm, '<li style="margin-left:20px;margin-bottom:4px;">$1</li>');
  
  // Ordered lists: 1. item
  s = s.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px;margin-bottom:4px;">$1</li>');
  
  // Horizontal rule: --- or ***
  s = s.replace(/^(---|\*\*\*)$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">');
  
  // Double newlines to paragraphs, single newlines to <br>
  s = s.replace(/\n\n+/g, '</p><p style="margin:12px 0;">');
  s = s.replace(/\n/g, '<br>');
  
  // Wrap in paragraph
  s = '<p style="margin:12px 0;">' + s + '</p>';
  
  // Clean up empty paragraphs and fix table wrapping
  s = s.replace(/<p style="margin:12px 0;"><\/p>/g, '');
  s = s.replace(/<p style="margin:12px 0;">(<h[1-4])/g, '$1');
  s = s.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
  s = s.replace(/<p style="margin:12px 0;">(<table)/g, '$1');
  s = s.replace(/(<\/table>)<\/p>/g, '$1');
  s = s.replace(/<br>(<table)/g, '$1');
  s = s.replace(/(<\/table>)<br>/g, '$1');
  
  // Restore all preserved content (code blocks, HTML tags, entities)
  s = s.replace(/\x00PLACEHOLDER(\d+)\x00/g, function(_, idx) {
    return placeholders[parseInt(idx, 10)] || '';
  });
  
  // Clean up any artifacts around preserved HTML
  s = s.replace(/<p style="margin:12px 0;">(<div|<h[1-6]|<center|<table|<figure)/gi, '$1');
  s = s.replace(/(<\/div>|<\/h[1-6]>|<\/center>|<\/table>|<\/figure>)<\/p>/gi, '$1');
  s = s.replace(/<br>(<div|<h[1-6]|<center|<table)/gi, '$1');
  s = s.replace(/(<\/div>|<\/h[1-6]>|<\/center>|<\/table>)<br>/gi, '$1');
  
  return s;
}

// ---------- Search ----------
let hfSearchDebounceTimer = null;
let lastHfSearchQuery = '';

// Search HuggingFace models via API (searches entire catalog)
async function searchHuggingFaceModels(query, limit = 20) {
  if (!query || query.length < 2) return null;
  
  try {
    let results = [];
    
    // If query looks like a model ID (contains /), try direct lookup first
    if (query.includes('/')) {
      try {
        const directUrl = `https://huggingface.co/api/models/${encodeURIComponent(query).replace(/%2F/g, '/')}`;
        const directRes = await fetch(directUrl);
        if (directRes.ok) {
          const model = await directRes.json();
          if (model && model.id) {
            results.push({
              modelId: model.id,
              id: model.id,
              author: model.author,
              downloads: model.downloads,
              likes: model.likes,
              pipeline_tag: model.pipeline_tag,
              lastModified: model.lastModified
            });
          }
        }
      } catch (e) {
        console.log('Direct model lookup failed, trying search...');
      }
    }
    
    // Also do a regular search (handles partial matches and variations)
    const searchTerms = query.replace('/', ' ').trim(); // Replace / with space for better search
    const searchUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(searchTerms)}&limit=${limit}`;
    const searchRes = await fetch(searchUrl);
    
    if (searchRes.ok) {
      const searchResults = await searchRes.json();
      if (searchResults && searchResults.length > 0) {
        // Merge results, avoiding duplicates
        const existingIds = new Set(results.map(r => r.id || r.modelId));
        for (const r of searchResults) {
          const id = r.id || r.modelId;
          if (id && !existingIds.has(id)) {
            results.push(r);
            existingIds.add(id);
          }
        }
      }
    }
    
    // If query contains /, also try author filter
    if (query.includes('/') && results.length < limit) {
      const [author, modelName] = query.split('/');
      if (author && modelName) {
        try {
          const authorUrl = `https://huggingface.co/api/models?author=${encodeURIComponent(author)}&search=${encodeURIComponent(modelName)}&limit=${limit}`;
          const authorRes = await fetch(authorUrl);
          if (authorRes.ok) {
            const authorResults = await authorRes.json();
            const existingIds = new Set(results.map(r => r.id || r.modelId));
            for (const r of authorResults) {
              const id = r.id || r.modelId;
              if (id && !existingIds.has(id)) {
                results.push(r);
                existingIds.add(id);
              }
            }
          }
        } catch (e) {}
      }
    }
    
    return results.length > 0 ? results.slice(0, limit) : null;
  } catch (err) {
    console.error('HuggingFace search error:', err);
    return null;
  }
}

// Display HuggingFace search results
async function displayHfSearchResults(query) {
  const tbody = document.querySelector('#huggingfaceModelsTable tbody');
  const mobileContainer = document.getElementById('hfMobileModelsList');
  if (!tbody) return;
  
  // Show loading state
  tbody.innerHTML = `
    <tr id="hfSearchingRow">
      <td colspan="8" style="text-align: center; padding: 30px 20px;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <div style="width: 28px; height: 28px; border: 3px solid #e5e7eb; border-top-color: #8b7cf6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span style="color: #6b7280; font-size: 14px;">Searching HuggingFace for "${query}"...</span>
        </div>
      </td>
    </tr>
  `;
  
  const results = await searchHuggingFaceModels(query, 20);
  
  if (!results || results.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px 20px; color: #6b7280;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <svg width="32" height="32" fill="none" stroke="#9ca3af" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
            </svg>
            <span>Querying too frequently. Please wait / Clear Cache / Try the Intelligence Cubed Models.</span>
            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <button onclick="clearSearch(); switchModelverseTab('local');" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Go to I³ Models</button>
              <button onclick="clearSearch()" style="padding: 8px 16px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px;">Clear Search</button>
            </div>
          </div>
        </td>
      </tr>
    `;
    if (mobileContainer) {
      mobileContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; padding: 40px 20px; color: #6b7280; gap: 10px;">
          <svg width="32" height="32" fill="none" stroke="#9ca3af" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          <span style="text-align: center;">Querying too frequently.<br>Please wait or try Intelligence Cubed Models.</span>
          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button onclick="clearSearch(); switchModelverseTab('local');" style="padding: 10px 18px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Go to I³ Models</button>
          </div>
        </div>
      `;
    }
    updateSearchResultCount(0);
    return;
  }
  
  // Clear and populate with search results
  tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';
  
  // Process results (reuse existing row creation logic)
  const modelIds = results.map(m => m.modelId || m.id).filter(Boolean);
  
  // Fetch model cards in parallel (with limit to avoid rate limiting)
  const hfMap = await fetchAllModelCards(modelIds.slice(0, 20), 4);
  
  results.forEach(entry => {
    const modelId = entry.modelId || entry.id;
    if (!modelId) return;
    
    const hf = hfMap[modelId];
    const normalized = (hf && hf.normalized) ? hf.normalized : null;
    if (normalized) normalized._hf = true;
    if (typeof MODEL_DATA === 'object' && normalized) MODEL_DATA[modelId] = normalized;
    
    // Create desktop row
    const row = document.createElement('tr');
    row.className = 'model-row hf-model-row hf-search-result';
    row.setAttribute('data-hf', 'true');
    
    const escModelId = escapeHtml(modelId);
    const escPaper = normalized && normalized.paperLink && normalized.paperLink !== '-' ? escapeHtml(normalized.paperLink) : '';
    const paperLinkHtml = escPaper ? `<a href="${escPaper}" target="_blank">Link</a>` : '<span>-</span>';
    const baseModel = normalized?.baseModel || entry.base_model || normalized?.category || '-';
    const pipelineTag = normalized?.pipelineTag || entry.pipeline_tag || null;
    const author = normalized?.author || entry.author || '-';
    const downloadsValue = Number.isFinite(Number(normalized?.downloads)) ? Number(normalized.downloads) : (Number.isFinite(Number(entry.downloads)) ? Number(entry.downloads) : null);
    const likesValue = Number.isFinite(Number(normalized?.likes)) ? Number(normalized.likes) : (Number.isFinite(Number(entry.likes)) ? Number(entry.likes) : null);
    // List API only has createdAt, individual model API has lastModified
    const lastUpdated = normalized?.lastModified || entry.lastModified || entry.last_modified || entry.createdAt || null;
    
    const baseModelHtml = `
      <div class="hf-meta-primary">${escapeHtml(baseModel || '-')}</div>
      ${pipelineTag && pipelineTag !== baseModel ? `<div class="hf-meta-secondary">${escapeHtml(pipelineTag)}</div>` : ''}
    `;
    const authorHtml = author ? escapeHtml(author) : '-';
    const downloadsLikesHtml = `
      <div class="hf-stat-line">${downloadsValue !== null && downloadsValue !== 0 ? `${formatNumber(downloadsValue)} downloads` : 'N/A'}</div>
      <div class="hf-stat-sub">${likesValue !== null ? `${formatNumber(likesValue)} likes` : '-'}</div>
    `;
    const lastUpdatedHtml = formatDateDisplay(lastUpdated);
    
    // Highlight search term in model name
    const highlightedName = escModelId.replace(new RegExp(`(${query})`, 'gi'), '<mark style="background:#fef08a;padding:0 2px;border-radius:2px;">$1</mark>');
    
    row.innerHTML = `
      <td class="model-name">${highlightedName}</td>
      <td class="paper-link" data-label="Paper">${paperLinkHtml}</td>
      <td class="model-details" data-label="Details">
        <button class="model-card-btn" onclick="showModelCard('${escModelId}')">Model Card</button>
      </td>
      <td class="hf-meta" data-label="Base Model">${baseModelHtml}</td>
      <td class="hf-author" data-label="Author">${authorHtml || '-'}</td>
      <td class="hf-downloads" data-label="Downloads / Likes">${downloadsLikesHtml}</td>
      <td class="hf-last-updated" data-label="Last Updated">${lastUpdatedHtml}</td>
      <td class="action-cell" data-label="Actions">
        <div class="invest">
          <button class="try-btn" disabled style="opacity:0.5;cursor:not-allowed;">Try</button>
          <button class="add-cart-btn" disabled style="opacity:0.5;cursor:not-allowed;">Add to Cart</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
    
    // Create mobile item
    if (mobileContainer) {
      const icon = escapeHtml(modelId.charAt(0).toUpperCase());
      const statsPrimary = downloadsValue !== null && downloadsValue !== 0 ? `${formatNumber(downloadsValue)} downloads` : 'N/A';
      const statsSecondary = likesValue !== null ? `${formatNumber(likesValue)} likes` : '-';
      
      const item = document.createElement('div');
      item.className = 'mobile-model-item hf-mobile-item hf-search-result';
      item.setAttribute('data-hf', 'true');
      item.setAttribute('data-model-id', modelId);
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <div class="mobile-model-item-header">
          <div class="mobile-model-icon">${icon}</div>
          <div style="flex: 1;">
            <div class="mobile-model-name">${highlightedName}</div>
          </div>
          <div style="color: #9ca3af; font-size: 12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>
        <div class="mobile-model-info">
          <div class="mobile-model-info-row">
            <span class="mobile-model-label">Author:</span>
            <span class="mobile-model-value">${escapeHtml(author || '-')}</span>
          </div>
          <div class="mobile-model-info-row">
            <span class="mobile-model-label">Stats:</span>
            <span class="mobile-model-value">${statsPrimary} / ${statsSecondary}</span>
          </div>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6; text-align: center;">
          <span style="color: #8b7cf6; font-size: 13px; font-weight: 500;">Tap to view details</span>
        </div>
      `;
      
      // Add click handler to show model card
      item.addEventListener('click', () => {
        showModelCard(modelId);
      });
      
      mobileContainer.appendChild(item);
    }
  });
  
  // Update count
  const info = document.querySelector('.search-info') || document.getElementById('searchResults');
  if (info) {
    info.innerHTML = `Found <strong>${results.length}</strong> models matching "<strong>${escapeHtml(query)}</strong>" <span style="color:#6b7280;font-size:12px;">(from ${formatLargeNumber(hfTotalModels || 1200000)} total)</span>`;
  }
  
  // Hide pagination during search
  const paginationContainer = document.getElementById('hfPaginationContainer');
  if (paginationContainer) paginationContainer.style.display = 'none';
  const mobilePagination = document.getElementById('hfMobilePaginationContainer');
  if (mobilePagination) mobilePagination.style.display = 'none';
}

function performSearch() {
  const input = document.getElementById('searchInput') || document.getElementById('mobileSearchInput');
  const searchTerm = (input ? input.value : '').toLowerCase().trim();

  if (!searchTerm) {
    clearSearch();
    return;
  }

  const activePanel = getActiveModelsPanel();
  const rows = activePanel
    ? activePanel.querySelectorAll('.models-table tbody tr')
    : document.querySelectorAll('#localModelsTable tbody tr');
  let visibleCount = 0;

  rows.forEach(row => {
    const nameCell = row.querySelector('.model-name');
    const paperLink = row.querySelector('.paper-link a')?.href || '';
    if (!nameCell) return;

    const modelName = nameCell.textContent.trim();
    const modelData = (typeof getModelData === 'function') ? getModelData(modelName) : null;

    const searchable = [
      modelName,
      modelData?.purpose || '',
      modelData?.useCase || '',
      modelData?.category || '',
      modelData?.industry || '',
      paperLink
    ].join(' ').toLowerCase();

    if (searchable.includes(searchTerm)) {
      row.style.display = '';
      highlightSearchTerms(nameCell, searchTerm);
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });

  // 手机端列表搜索
  const mobileItems = activePanel
    ? activePanel.querySelectorAll('.mobile-model-item')
    : document.querySelectorAll('#mobileModelsList .mobile-model-item');
  mobileItems.forEach(item => {
    const nameElement = item.querySelector('.mobile-model-name');
    if (!nameElement) return;
    
    const modelName = nameElement.textContent.trim();
    const modelData = (typeof getModelData === 'function') ? getModelData(modelName) : null;
    
    const searchable = [
      modelName,
      modelData?.purpose || '',
      modelData?.useCase || '',
      modelData?.category || '',
      modelData?.industry || ''
    ].join(' ').toLowerCase();
    
    if (searchable.includes(searchTerm)) {
      item.style.display = '';
      visibleCount++;
    } else {
      item.style.display = 'none';
    }
  });

  updateSearchResultCount(visibleCount);
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  const mobileInput = document.getElementById('mobileSearchInput');
  if (input) input.value = '';
  if (mobileInput) mobileInput.value = '';
  
  document.querySelectorAll('.models-table tbody tr').forEach(row => {
    row.style.display = '';
    const nameCell = row.querySelector('.model-name');
    if (!nameCell) return;
    nameCell.innerHTML = nameCell.textContent;
  });
  
  document.querySelectorAll('.mobile-model-item').forEach(item => {
    item.style.display = '';
  });
  
  const activePanel = getActiveModelsPanel();
  const activeRows = activePanel ? activePanel.querySelectorAll('.models-table tbody tr').length : 0;
  updateSearchResultCount(activeRows);
}

function highlightSearchTerms(cellEl, term) {
  const original = cellEl.textContent;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi');
  cellEl.innerHTML = original.replace(regex, '<span class="highlight" style="background-color:#fef3c7;padding:1px 3px;border-radius:3px;font-weight:bold;">$1</span>');
}

function updateSearchResultCount(count) {
  const activePanel = getActiveModelsPanel();
  const isLocal = !activePanel || activePanel.getAttribute('data-tab') === 'local';
  const tableRows = activePanel
    ? activePanel.querySelectorAll('.models-table tbody tr')
    : document.querySelectorAll('#localModelsTable tbody tr');
  const totalRows = tableRows.length;
  const total = totalRows || count;
  const info = document.querySelector('.search-info') || document.getElementById('searchResults');
  if (info) info.textContent = `Showing ${Math.min(count, totalRows)} / ${total} models`;
  
  const mobileInfo = document.getElementById('mobileSearchResults');
  if (mobileInfo) {
    const mobileItems = activePanel ? activePanel.querySelectorAll('.mobile-model-item') : [];
    let visibleMobileCount = 0;
    mobileItems.forEach(item => {
      if (item.style.display !== 'none') visibleMobileCount++;
    });
    const displayCount = mobileItems.length ? visibleMobileCount : Math.min(count, totalRows);
    const rawTotal = mobileItems.length || totalRows || count;
    const finalTotal = rawTotal || displayCount;
    mobileInfo.textContent = `${displayCount}/${finalTotal} models`;
  }
}

function switchModelverseTab(tabName) {
  if (!tabName || tabName === currentModelverseTab) return;
  currentModelverseTab = tabName;
  window.currentModelverseTab = currentModelverseTab;

  document.querySelectorAll('.modelverse-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tabName;
    btn.classList.toggle('active', isActive);
  });

  document.querySelectorAll('.models-tab-panel').forEach(panel => {
    const isActive = panel.getAttribute('data-tab') === tabName;
    panel.classList.toggle('active', isActive);
    if (window.innerWidth <= 768) {
      const list = panel.querySelector('.mobile-models-list');
      if (list) list.style.display = isActive ? 'block' : 'none';
    }
  });

  if (window.innerWidth <= 768) {
    const detailView = document.getElementById('mobileModelDetail');
    if (detailView) detailView.style.display = 'none';
  }

  performSearch();
  refreshModelCounts();
  requestAnimationFrame(refreshModelCounts);
}

window.performSearch = performSearch;
window.clearSearch = clearSearch;

// ---------- Donut Chart ----------
function drawDonutChart(percent = 0) {
  console.log('drawDonutChart called with percent:', percent);
  const canvas = document.getElementById('shareChart');
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }
  console.log('Canvas found, size:', canvas.width, 'x', canvas.height);
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  
  // 确保画布是正方形，使用固定的正方形尺寸
  const size = 180; // 固定尺寸确保完美圆形
  canvas.width = size * DPR;
  canvas.height = size * DPR;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const purchased = Math.max(0, Math.min(100, Number(percent)||0));
  const cx = size/2, cy = size/2;
  // 调整圆环比例，确保完美的圆形
  const outerR = size*0.40, innerR = size*0.30;
  const trackR = (outerR + innerR)/2;
  const start = -Math.PI/2;
  const end = start + (purchased/100)*Math.PI*2;
  const gap = 0.02;

  ctx.clearRect(0,0,size,size);
  ctx.lineWidth = outerR - innerR;
  ctx.lineCap = 'round';

  // Purchased
  ctx.strokeStyle = '#8b7cf6';
  ctx.beginPath();
  ctx.arc(cx, cy, trackR, start, end);
  ctx.stroke();

  // Gap
  ctx.strokeStyle = '#f3f4f6';
  ctx.beginPath();
  ctx.arc(cx, cy, trackR, end, end+gap);
  ctx.stroke();

  // Remaining
  ctx.strokeStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(cx, cy, trackR, end+gap, start + Math.PI*2);
  ctx.stroke();

  // Inner cutout
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI*2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Center text
  ctx.fillStyle = '#1f2937';
  ctx.font = '700 13px Inter, system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${purchased.toFixed(1)}%`, cx, cy);
  
  console.log('Chart drawn successfully with percentage:', purchased.toFixed(1) + '%');
}

// ---------- Modal helpers ----------
function getFloatingSearchPanel() {
  const input = document.getElementById('searchInput');
  if (!input) return null;
  let panel = input.parentElement;
  if (panel && panel.parentElement) panel = panel.parentElement;
  return panel;
}

// When opened via row (preferred – gives us sign)
function showModelCardForRow(rowEl) {
  const modelName = rowEl?.querySelector('.model-name')?.textContent?.trim();
  if (!modelName) return;
  let sign = null;
  const deltaCell = rowEl.querySelector('.daily-delta');
  if (deltaCell) {
    if (deltaCell.classList.contains('negative')) sign = -1;
    else if (deltaCell.classList.contains('positive')) sign = 1;
    const txt = (deltaCell.textContent || '').trim();
    if (sign === null) sign = txt.startsWith('-') ? -1 : 1;
  }
  showModelCard(modelName, sign);
}

// Main entry
async function showModelCard(modelName, signOverride) {
  if (typeof getModelData !== 'function') {
    alert('Error: model-data.js 未正确加载');
    return;
  }
  let data = getModelData(modelName);
  // If model not in local MODEL_DATA, attempt to lazy-load from Hugging Face
  if (!data) {
    try {
      // Try fetching from HF API and populate MODEL_DATA for subsequent uses
      if (typeof fetchHuggingFaceModelCard === 'function') {
        const hf = await fetchHuggingFaceModelCard(modelName);
        if (hf) {
            // If fetchHuggingFaceModelCard returned a normalized object use it
            const normalized = hf.normalized || {
              purpose: hf.readme || (hf.api && (hf.api.card?.description || hf.api.description)) || '-',
              useCase: (hf.api && (hf.api.card?.use_case || hf.api.card?.usecase)) || '-',
              category: (hf.api && (hf.api.pipeline_tag || (hf.api.pipeline_tags && hf.api.pipeline_tags[0]) || (hf.api.tags && hf.api.tags[0]))) || '-',
              industry: (hf.api && (hf.api.pipeline_tag || (hf.api.pipeline_tags && hf.api.pipeline_tags[0]) || (hf.api.tags && hf.api.tags[0]))) || '-',
              tokenPrice: '-',
              sharePrice: '-',
              change: '-',
              rating: '-',
              ratingFormatted: '-',
              starsHtml: '—',
              purchasedPercent: 0,
              paperLink: (hf.normalized && hf.normalized.paperLink) || (hf.readme && null) || '-'
            };
            // mark as coming from Hugging Face so UI can render disabled actions
            normalized._hf = true;
            // If normalized was built from readme parsing inside fetch, prefer that paperLink
            if (hf.normalized && hf.normalized.paperLink) normalized.paperLink = hf.normalized.paperLink;
            if (typeof MODEL_DATA === 'object') MODEL_DATA[modelName] = normalized;
            data = normalized;
          }
      }
    } catch (err) {
      console.warn('Lazy HF load failed for', modelName, err);
    }
  }
  if (!data) {
    alert('Model data not found for: ' + modelName);
    return;
  }

  const modal = document.getElementById('modelCartModal');
  if (!modal) {
    alert('缺少模态框 HTML，请插入模态框片段。');
    return;
  }
  const $ = (sel) => modal.querySelector(sel);

  const titleEl    = $('#modelCartTitle');
  const purposeEl  = $('#modelPurpose');
  const useCaseEl  = $('#modelUseCase');
  const categoryEl = $('#modelCategory');
  const industryEl = $('#modelIndustry');
  const priceEl    = $('#modelPrice');
  const changeEl   = $('#modelChange');
  const ratingEl   = $('#modelRating');

  if (titleEl)    titleEl.textContent = `${modelName} Details`;
  if (purposeEl) {
    const shortText = (data.purpose || '—').substring(0, 200) + "...";
    purposeEl.innerHTML = `
      <div class="purpose-content clickable-content" data-content="${encodeURIComponent(fullPurpose)}" data-type="Purpose" data-model="${encodeURIComponent(modelName)}" style="max-height: 300px; overflow-y: auto; padding-right: 8px; cursor: pointer; transition: background 0.2s;" title="Click to view full content">
        ${renderedContent}
        ${isLong ? '<div style="color: #8b7cf6; font-size: 12px; margin-top: 8px; font-weight: 500;">Click to read more...</div>' : ''}
      </div>
      ${isLong ? `
      <div style="margin-top: 12px;">
        <a href="#" class="view-full-content" data-content="${encodeURIComponent(fullPurpose)}" data-type="Purpose" data-model="${encodeURIComponent(modelName)}" style="display: inline-flex; align-items: center; gap: 6px; color: #8b7cf6; text-decoration: none; font-size: 13px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          View Full Content
        </a>
      </div>
      ` : ''}
    `;
  }
  if (useCaseEl) {
    const shortText = (data.useCase || '—').substring(0, 150) + "...";
    useCaseEl.innerHTML = `
      ${shortText}
      <br><br>
        <a href="#" class="view-full-content" data-content="${encodeURIComponent(data.useCase || '')}" data-type="Use Case">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        View Full Content
      </a>
    `;
  }
  if (categoryEl) categoryEl.textContent = data.category || '—';
  if (industryEl) industryEl.textContent = data.industry || '—';
  if (priceEl) {
    priceEl.innerHTML = `${data.tokenPrice} <img src="svg/i3-token-logo.svg" alt="I³" style="width: 16px; height: 16px; vertical-align: middle; margin-left: 4px;">`;
  }

  // fix market change sign
  let changeVal = Number(data.change);
  if (Number.isFinite(changeVal) && signOverride) {
    changeVal = Math.abs(changeVal) * (signOverride > 0 ? 1 : -1);
  }
  if (changeEl) {
    const sign = changeVal > 0 ? '+' : (changeVal < 0 ? '−' : '');
    changeEl.textContent = `${sign}${Math.abs(changeVal).toFixed(2)}%`;
  }

  if (ratingEl)  ratingEl.textContent = `${data.ratingFormatted}/5 (${data.starsHtml})`;

  // Show modal
  modal.classList.add('active');
  modal.style.display = 'flex';
  document.body.classList.add('mvpro-lock');

  // Disable Try/Add in modal for HF models
  try {
    const tryBtnModal = modal.querySelector('.mvpro-actions .mvpro-btn.primary');
    const addBtnModal = modal.querySelector('.mvpro-actions .mvpro-btn.success');
    if (data && data._hf) {
      if (tryBtnModal) {
        tryBtnModal.disabled = true;
        tryBtnModal.style.opacity = '0.5';
        tryBtnModal.style.cursor = 'not-allowed';
        tryBtnModal.title = 'Not available for external Hugging Face models';
      }
      if (addBtnModal) {
        addBtnModal.disabled = true;
        addBtnModal.style.opacity = '0.5';
        addBtnModal.style.cursor = 'not-allowed';
        addBtnModal.title = 'Not available for external Hugging Face models';
      }
    } else {
      if (tryBtnModal) { tryBtnModal.disabled = false; tryBtnModal.style.opacity = ''; tryBtnModal.style.cursor = ''; tryBtnModal.title = ''; }
      if (addBtnModal) { addBtnModal.disabled = false; addBtnModal.style.opacity = ''; addBtnModal.style.cursor = ''; addBtnModal.title = ''; }
    }
  } catch (e) { console.warn('Failed to set modal Try/Add disabled state', e); }

  // Hide floating search while modal is open
  const panel = getFloatingSearchPanel();
  if (panel) panel.style.display = 'none';
  const results = document.getElementById('searchResults');
  if (results) results.style.display = 'none';

  // Donut chart value: use data if present but cap at 35; otherwise random in [10,35]
  let purchased = Number(data.purchasedPercent);
  if (!Number.isFinite(purchased) || purchased <= 0) {
    purchased = 10 + Math.random() * 25; // 10–35
  } else {
    purchased = Math.min(35, purchased);
  }
  
  // 确保图表绘制 - 添加延迟确保 DOM 完全加载
  setTimeout(() => {
    drawDonutChart(purchased);
    console.log('Drawing chart with percentage:', purchased.toFixed(1) + '%');
  }, 200);
  
  // 更新图例显示具体数据
  const legendItems = modal.querySelectorAll('.mvpro-legend .item');
  if (legendItems.length >= 2) {
    const purchasedItem = legendItems[0];
    const remainingItem = legendItems[1];
    
    // 更新 Purchased (%) 显示具体数据
    const purchasedText = purchasedItem.textContent.replace('Purchased (%)', `Purchased (${purchased.toFixed(1)}%)`);
    purchasedItem.textContent = purchasedText;
    
    // 更新 Remaining (%) 显示具体数据
    const remaining = 100 - purchased;
    const remainingText = remainingItem.textContent.replace('Remaining (%)', `Remaining (${remaining.toFixed(1)}%)`);
    remainingItem.textContent = remainingText;
  }
  
  // 也在图表下方显示百分比
  const percentageEl = $('#chartPercentage');
  if (percentageEl) {
    percentageEl.textContent = `${purchased.toFixed(1)}% Purchased`;
  }
}

function closeModal() {
  const modal = document.getElementById('modelCartModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.classList.remove('mvpro-lock');

  const panel = getFloatingSearchPanel();
  if (panel) panel.style.display = '';
  const results = document.getElementById('searchResults');
  if (results) results.style.display = '';
}

window.addEventListener('click', function(e) {
  const modal = document.getElementById('modelCartModal');
  if (e.target === modal) closeModal();
});

window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

function closeModelCart(){ closeModal(); }
window.closeModal = closeModal;
window.closeModelCart = closeModelCart;
window.showModelCard = showModelCard;
window.showModelCardForRow = showModelCardForRow;
window.switchModelverseTab = switchModelverseTab;

// ---------- Page init ----------
document.addEventListener('DOMContentLoaded', function() {
  // Rebind Model Card buttons to use the row's model name
  document.querySelectorAll('#localModelsTable .model-card-btn').forEach(btn => {
    try { btn.removeAttribute('onclick'); } catch (e) {}
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      const row = this.closest('tr');
      if (row) {
        showModelCardForRow(row); // 优先使用行级显示（获取符号信息）
      } else {
        const modelName = this.textContent.trim();
        if (modelName) showModelCard(modelName); // 备用：直接显示
      }
    });
  });

  // Allow clicking model name to open card
  document.querySelectorAll('#localModelsTable .model-name').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.style.color = '#3b82f6';
    cell.addEventListener('click', function() {
      const row = this.closest('tr');
      if (row) {
        showModelCardForRow(row); // 优先使用行级显示（获取符号信息）
      } else {
        showModelCard(this.textContent.trim()); // 备用：直接显示
      }
    });
  });

  // Search input UX
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') performSearch();
    });
    searchInput.addEventListener('input', function() {
      if (this.value === '') clearSearch();
    });
  }

  updateSearchResultCount(document.querySelectorAll('#localModelsTable tbody tr').length);
});

// ---------- Try / Cart ----------
function tryModelFromModelverse(button) {
  const row = button.closest('tr');
  const modelName = row?.querySelector('.model-name')?.textContent?.trim();
  if (!modelName) return;

  const data = (typeof getModelData === 'function') ? getModelData(modelName) : null;
  if (!data) {
    alert('❌ Model data not found. Please try again.');
    return;
  }

  alert(`🚀 Trying "${modelName}"...\n\nModel Info:\n• Category: ${data.category}\n• Industry: ${data.industry}\n• Purpose: ${data.purpose}\n• Use Case: ${data.useCase}\n\nRedirecting to model interface...`);

  const original = button.textContent;
  button.textContent = 'Trying...';
  button.disabled = true;
  button.style.opacity = '0.7';
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
    button.style.opacity = '';
  }, 1500);
}

function addToCartFromModelverse(button) {
  const row = button.closest('tr');
  const modelName = row?.querySelector('.model-name')?.textContent?.trim();
  if (!modelName) return;

  const data = (typeof getModelData === 'function') ? getModelData(modelName) : null;
  if (!data) {
    alert('❌ Model data not found. Please try again.');
    return;
  }

  const ok = addToCartStorage(modelName, 1, 0);
  if (ok) {
    button.textContent = 'Added ✓';
    button.style.background = '#10b981';
    button.disabled = true;
    // Stay on page; do not redirect
  } else {
    alert('❌ Failed to add to cart. Please try again.');
  }
}

function addToCartStorage(modelName, tokenQuantity = 1, shareQuantity = 0) {
  try {
    const data = (typeof getModelData === 'function') ? getModelData(modelName) : null;
    if (!data) return false;

    let items = JSON.parse(localStorage.getItem('cartItems')) || [];
    const ex = items.find(x => x.modelName === modelName);
    if (ex) {
      ex.tokenQuantity = (ex.tokenQuantity || 0) + tokenQuantity;
      ex.shareQuantity = (ex.shareQuantity || 0) + shareQuantity;
    } else {
      items.push({
        modelName,
        tokenQuantity,
        shareQuantity,
        addedAt: new Date().toISOString()
      });
    }
    localStorage.setItem('cartItems', JSON.stringify(items));
    console.log('✅ Added to cart:', modelName, 'Tokens:', tokenQuantity, 'Shares:', shareQuantity);
    return true;
  } catch (err) {
    console.error('❌ addToCartStorage failed:', err);
    return false;
  }
}

window.tryModelFromModelverse = tryModelFromModelverse;
window.addToCartFromModelverse = addToCartFromModelverse;
window.addToCartStorage = addToCartStorage;

// ---------- Data access helper ----------
function getModelData(name) {
  if (typeof MODEL_DATA !== 'object') return null;
  return MODEL_DATA[name] || null;
}

// ====== ACTION 列注入 ======
(function () {
  document.addEventListener('DOMContentLoaded', injectActionColumn);

  function injectActionColumn() {
    const table = document.querySelector('#localModelsTable');
    if (!table) return;

    // 1) 表头追加「Action」
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('th.action-col')) {
      const th = document.createElement('th');
      th.className = 'action-col';
      th.textContent = 'Action';
      headRow.appendChild(th);
    }

    // 2) 每一行追加按钮列
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      if (row.querySelector('td.action-cell')) return; // 已注入则跳过
      const nameCell = row.querySelector('.model-name');
      if (!nameCell) return;
      const modelName = nameCell.textContent.trim();

      const td = document.createElement('td');
      td.className = 'action-cell';
      td.setAttribute('data-label', 'Action');
      td.innerHTML = `
        <div class="invest">
          <button class="try-btn">Try</button>
          <button class="add-cart-btn">Add to Cart</button>
        </div>
      `;
      const tryBtn = td.querySelector('.try-btn');
      const addBtn = td.querySelector('.add-cart-btn');
      tryBtn.addEventListener('click', () => tryModel(modelName));
      addBtn.addEventListener('click', () => addToCart(modelName));
      row.appendChild(td);
    });
  }

  // ====== 与 Benchmark 一致的 Try / Add to Cart 行为 ======
  // Try：关掉 Auto Router、写入 running 状态并跳到 index.html
  window.tryModel = function (modelName) {
    const modelData = (typeof getModelData === 'function') ? getModelData(modelName) : null;

    // 记录当前选择的模型（不要存任何私钥）
    localStorage.setItem('currentModel', JSON.stringify({
      name: modelName,
      category: modelData?.category,
      industry: modelData?.industry,
      purpose: modelData?.purpose,
      useCase: modelData?.useCase
    }));

    // 与 Benchmark 页相同的工作流约定：running + 关闭 Auto Router
    // （Benchmark 里也是在 tryModel 里做同样的事）
    localStorage.setItem('autoRouter', 'off');
    localStorage.setItem('currentWorkflow', JSON.stringify({
      name: modelName,
      status: 'running',
      startedAt: new Date().toISOString()
    }));

    // 去聊天页，首页会读取 running 状态并显示"Running …"
    // （index.html 的这套展示逻辑你已具备）
    window.location.href = 'index.html?tryModel=' + encodeURIComponent(modelName);
  };

  // Add to Cart：与 Benchmark 一致的功能
  window.addToCart = function (modelName) {
    const modelData = (typeof getModelData === 'function') ? getModelData(modelName) : null;
    if (modelData) {
      // 添加到购物车并跳转 (默认添加1个token)
      const success = addToCartStorage(modelName, 1, 0);
      if (success) {
        // 更新按钮状态
        const button = event.target;
        button.textContent = 'Added ✓';
        button.style.background = '#10b981';
        button.disabled = true;
        // Stay on page; do not redirect
      } else {
        alert('❌ Failed to add to cart. Please try again.');
      }
    } else {
      alert('❌ Model data not found. Please try again.');
    }
  };
})();

// 创建全屏滚动弹窗
function showFullContentModal(content, title = 'Content') {
  const fullModal = document.createElement('div');
  fullModal.className = 'full-content-modal';
  fullModal.innerHTML = `
    <div class="full-content-overlay">
      <div class="full-content-container">
        <div class="full-content-header">
          <h3>Complete ${title}</h3>
          <button class="close-full-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="full-content-body">
          ${content}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(fullModal);
  
  // 关闭事件
  fullModal.querySelector('.close-full-content').addEventListener('click', () => {
    document.body.removeChild(fullModal);
  });
  
  fullModal.addEventListener('click', (e) => {
    if (e.target === fullModal.querySelector('.full-content-overlay')) {
      document.body.removeChild(fullModal);
    }
  });
}

// 为模态框添加点击事件处理

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('view-full-content') || e.target.closest('.view-full-content')) {
    e.preventDefault();
    const link = e.target.closest('.view-full-content');
    const fullContent = decodeURIComponent(link.dataset.content);
    const contentType = link.dataset.type || 'Content'; // 获取内容类型
    showFullContentModal(fullContent, contentType); // 传递标题参数
  }
});

window.showFullContentModal = showFullContentModal;

// ---------- Hugging Face integration (fetch list + lazy model card) ----------
// Quick HTML-escape helper to avoid breaking inline templates when inserting model IDs or URLs
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchHuggingFaceModels(limit = 50) {
  try {
    const url = `https://huggingface.co/api/models?limit=${encodeURIComponent(limit)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HF models request failed: ' + res.status);
    const data = await res.json();
    // data is an array of model objects; return as-is
    return data;
  } catch (err) {
    console.error('fetchHuggingFaceModels error:', err);
    return [];
  }
}

async function fetchHuggingFaceModelCard(modelId) {
  // Fetch model metadata from HF API and attempt to fetch README.raw for purpose and paper link.
  try {
  const safeId = encodeURIComponent(modelId).replace(/%2F/g, '/');
  const apiUrl = `https://huggingface.co/api/models/${safeId}`;
  const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('HF model fetch failed: ' + res.status);
    const api = await res.json();
    const card = api.card || {};
    const cardData = api.cardData || {};

    // Try to fetch README.md from raw/main then raw/master
    let readme = null;
    const tryUrls = [
      `https://huggingface.co/${safeId}/raw/main/README.md`,
      `https://huggingface.co/${safeId}/raw/master/README.md`
    ];
    for (const u of tryUrls) {
      try {
        const r = await fetch(u);
        if (r.ok) {
          readme = await r.text();
          break;
        }
      } catch (e) {
        // ignore and try next
      }
    }

    // Extract paper link from README text
    let paperLink = null;
    // Quick sanitizer for extracted URLs to remove trailing punctuation or embedded HTML fragments
    function sanitizeUrl(u) {
      if (!u) return null;
      let s = String(u).trim();
      // Try decoding percent-encodings (safe guard)
      try { if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s); } catch (e) { /* ignore */ }
      // Remove leading/trailing angle brackets or quotes commonly surrounding URLs
      s = s.replace(/^["'\(<\[]+/, '').replace(/[\)\]>"'}]+$/, '');
      // Extract only the initial http(s)://... chunk up to first space or disallowed char
      const m = s.match(/(https?:\/\/[^\s\)\]\}\<\>"']+)/i);
      if (m && m[1]) s = m[1];
      // Trim trailing punctuation
      s = s.replace(/[.,;:]+$/,'');
      return s || null;
    }

    // Helper to prefer academic sources
    function isAcademicUrl(u) {
      if (!u) return false;
      try {
        const url = u.toLowerCase();
        // prefer explicit academic hosts or direct PDF links
        const academicHosts = ['arxiv.org', 'doi.org', 'openreview.net', 'ieeexplore.ieee.org', 'paperswithcode.com', 'acm.org', 'semanticscholar.org', 'nature.com', 'science.org', 'springer.com'];
        if (academicHosts.some(h => url.includes(h))) return true;
        if (url.endsWith('.pdf')) return true;
        // sometimes papers are hosted on github as PDF or in /paper.pdf
        if (url.includes('raw.githubusercontent.com') && url.endsWith('.pdf')) return true;
        return false;
      } catch (e) { return false; }
    }

    if (readme) {
      // 1) Look for explicit markdown links whose link text contains 'paper' (e.g., [paper](url))
      const mdLinkRegex = /\[([^\]]*paper[^\]]*)\]\((https?:\/\/[^)\s]+)\)/i;
      const mmd = readme.match(mdLinkRegex);
      if (mmd && mmd[2]) paperLink = mmd[2];

      // 2) Look for explicit 'arXiv: 1234.5678' mentions and convert to an arXiv URL
      if (!paperLink) {
        const arxivIdMatch = readme.match(/arXiv[:\s]*([0-9]{4}\.[0-9]{4,5}(v\d+)?)/i);
        if (arxivIdMatch && arxivIdMatch[1]) paperLink = `https://arxiv.org/abs/${arxivIdMatch[1]}`;
      }

      // 3) Look for explicit 'paper:' or 'Paper:' followed by a URL
      if (!paperLink) {
        const kwRegex = /(?:paper|Paper|paper_link|paper-link|arxiv|ArXiv)[:\s\-–—]{0,40}(https?:\/\/[^\s\)\]]+)/m;
        const m1 = readme.match(kwRegex);
        if (m1 && m1[1]) paperLink = m1[1];
      }

      // 4) Fallback: collect all http/https URLs and pick the most academic-looking one
      if (!paperLink) {
        const urlRegex = /(https?:\/\/[^\s\)\]]+)/g;
        let match;
        const candidates = [];
        while ((match = urlRegex.exec(readme)) !== null) {
          candidates.push(match[1]);
        }
        if (candidates.length) {
            // Prefer true academic hosts
            const academic = candidates.map(sanitizeUrl).find(u => u && isAcademicUrl(u));
            if (academic) paperLink = academic;
            else {
              // prefer PDFs hosted anywhere
              const pdf = candidates.map(sanitizeUrl).find(u => u && u.toLowerCase().endsWith('.pdf'));
              if (pdf) paperLink = pdf;
            }
          }
      }
    }

      // sanitize any discovered link (also applied to fallbacks later)
      if (paperLink) paperLink = sanitizeUrl(paperLink);

    // Determine pipeline tag
    let pipeline = null;
    if (api.pipeline_tag) pipeline = api.pipeline_tag;
    else if (api.pipeline_tags && api.pipeline_tags.length) pipeline = api.pipeline_tags[0];
    else if (api.tags && api.tags.length) pipeline = api.tags[0];

    const pipelineTag = pipeline || cardData.pipeline_tag || card.pipeline_tag || null;
    // Use pipelineTag as the preferred category; keep base_model available as fallback.
    const baseModel = pipelineTag || cardData.base_model || card.base_model || (api.config?.peft?.base_model_name_or_path) || null;
    const author = api.author || cardData.author || card.author || null;
    const downloads = api.downloads ?? api.downloads_count ?? null;
    const likes = api.likes ?? null;
    const license = cardData.license || card.license || api.license || null;
    const datasetsRaw = cardData.datasets || cardData.dataset || card.datasets || card.dataset;
    const datasets = Array.isArray(datasetsRaw) ? datasetsRaw : (datasetsRaw ? [datasetsRaw] : []);
    const languageRaw = cardData.language || card.language || api.language;
    const languages = Array.isArray(languageRaw) ? languageRaw : (languageRaw ? [languageRaw] : []);
    const lastModified = api.lastModified || api.last_modified || api.updatedAt || api.createdAt || null;
    const tags = Array.isArray(api.tags) ? api.tags : [];

    // Normalized object to be used by showModelCard
    const normalized = {
      purpose: readme || card.description || api.description || '-',
      useCase: card.use_case || card.usecase || '-',
      category: pipelineTag || '-',
      industry: pipelineTag || '-',
      tokenPrice: '-',
      sharePrice: '-',
      change: '-',
      rating: '-',
      ratingFormatted: '-',
      starsHtml: '—',
      purchasedPercent: 0,
      paperLink: sanitizeUrl(paperLink) || sanitizeUrl(card.paperLink || card.paper) || '-',
      // normalized.baseModel will reflect the pipelineTag when available (so UI treats it as Category)
      baseModel: baseModel || '-',
      pipelineTag: pipelineTag || '-',
      license: license || '-',
      datasets,
      languages,
      downloads: Number.isFinite(Number(downloads)) ? Number(downloads) : null,
      likes: Number.isFinite(Number(likes)) ? Number(likes) : null,
      author: author || '-',
      lastModified,
      tags,
      // include raw api/readme if caller wants
      _rawApi: api,
      _readme: readme
    };

    return { api, readme, normalized };
  } catch (err) {
    console.error('fetchHuggingFaceModelCard error for', modelId, err);
    return null;
  }
}

// Append HF model rows to the desktop table with metadata-focused columns and disabled actions.
async function appendHuggingFaceModels(limit = 50) {
  const tbody = document.querySelector('#huggingfaceModelsTable tbody');
  if (!tbody) return;
  const models = await fetchHuggingFaceModels(limit);
  if (!models || !models.length) return;
  const listMetaMap = {};
  const modelIds = [];
  models.forEach(entry => {
    const id = entry.modelId || entry.id || entry.model || (entry.repository?.name);
    if (!id || listMetaMap[id]) return;
    listMetaMap[id] = entry;
    modelIds.push(id);
  });
  if (!modelIds.length) return;

  const hfMap = await fetchAllModelCards(modelIds, 8); // id -> {api, readme, normalized}

  modelIds.forEach(modelId => {
    // Skip if already in table (avoid duplicates)
    if ([...tbody.querySelectorAll('.model-name')].some(el => el.textContent.trim() === modelId)) return;

    const hf = hfMap[modelId];
    const normalized = (hf && hf.normalized) ? hf.normalized : null;
    if (normalized) normalized._hf = true;
    if (typeof MODEL_DATA === 'object' && normalized) MODEL_DATA[modelId] = normalized;

    const row = document.createElement('tr');
    row.className = 'model-row hf-model-row';
    row.setAttribute('data-hf', 'true');

    const escModelId = escapeHtml(modelId);
    const escPaper = normalized && normalized.paperLink && normalized.paperLink !== '-' ? escapeHtml(normalized.paperLink) : '';
    const paperLinkHtml = escPaper ? `<a href="${escPaper}" target="_blank">Link</a>` : '<span>-</span>';
    const listMeta = listMetaMap[modelId] || {};
    // Prefer pipeline_tag (pipelineTag) to represent the model's Category
    const pipelineTag = normalized?.pipelineTag || listMeta.pipeline_tag || normalized?.category || null;
    const category = pipelineTag || normalized?.category || normalized?.baseModel || listMeta.base_model || '-';
    const author = normalized?.author || listMeta.author || '-';
    const downloadsValue = Number.isFinite(Number(normalized?.downloads))
      ? Number(normalized.downloads)
      : (Number.isFinite(Number(listMeta.downloads)) ? Number(listMeta.downloads) : null);
    const likesValue = Number.isFinite(Number(normalized?.likes))
      ? Number(normalized.likes)
      : (Number.isFinite(Number(listMeta.likes)) ? Number(listMeta.likes) : null);
    const lastUpdated = normalized?.lastModified || listMeta.lastModified || listMeta.last_modified || listMeta.updatedAt || null;

    const categoryHtml = `
      <div class="hf-meta-primary">${escapeHtml(category || '-')}</div>
      ${pipelineTag && pipelineTag !== category ? `<div class="hf-meta-secondary">${escapeHtml(pipelineTag)}</div>` : ''}
    `;
    const authorHtml = author ? escapeHtml(author) : '-';
    const downloadsLikesHtml = `
      <div class="hf-stat-line">${downloadsValue !== null ? `${formatNumber(downloadsValue)} downloads` : '-'}</div>
      <div class="hf-stat-sub">${likesValue !== null ? `${formatNumber(likesValue)} likes` : '-'}</div>
    `;
    const lastUpdatedHtml = formatDateDisplay(lastUpdated);

    row.innerHTML = `
      <td class="model-name">${escModelId}</td>
      <td class="paper-link" data-label="Paper">${paperLinkHtml}</td>
      <td class="model-details" data-label="Details">
        <button class="model-card-btn" onclick="showModelCard('${escModelId}')">Model Card</button>
      </td>
      <td class="hf-meta" data-label="Category">${categoryHtml}</td>
      <td class="hf-author" data-label="Author">${authorHtml || '-'}</td>
      <td class="hf-downloads" data-label="Downloads / Likes">${downloadsLikesHtml}</td>
      <td class="hf-last-updated" data-label="Last Updated">${lastUpdatedHtml}</td>
      <td class="action-cell" data-label="Actions">
        <div class="invest">
          <button class="try-btn" disabled style="opacity:0.5;cursor:not-allowed;">Try</button>
          <button class="add-cart-btn" disabled style="opacity:0.5;cursor:not-allowed;">Add to Cart</button>
        </div>
      </td>
    `;

    tbody.appendChild(row);
  });
  if (currentModelverseTab === 'hf') {
    refreshModelCounts();
  }
}

// Append HF models to mobile list with richer metadata and disabled actions
async function appendHuggingFaceModelsToMobile(limit = 50) {
  const container = document.getElementById('hfMobileModelsList');
  if (!container) return;
  const models = await fetchHuggingFaceModels(limit);
  if (!models || !models.length) return;

  const listMetaMap = {};
  const modelIds = [];
  models.forEach(entry => {
    const id = entry.modelId || entry.id || entry.model || (entry.repository?.name);
    if (!id || listMetaMap[id]) return;
    listMetaMap[id] = entry;
    modelIds.push(id);
  });
  if (!modelIds.length) return;

  const hfMap = await fetchAllModelCards(modelIds, 8);

  modelIds.forEach(modelId => {
    if (!modelId) return;
    if ([...container.querySelectorAll('.mobile-model-name')].some(el => el.textContent.trim() === modelId)) return;

    const hf = hfMap[modelId];
    const normalized = (hf && hf.normalized) ? hf.normalized : null;
    if (normalized) normalized._hf = true;
    if (typeof MODEL_DATA === 'object' && normalized) MODEL_DATA[modelId] = normalized;

    const listMeta = listMetaMap[modelId] || {};
    const pipelineTag = normalized?.pipelineTag || listMeta.pipeline_tag || normalized?.category || null;
    const category = pipelineTag || normalized?.category || normalized?.baseModel || listMeta.base_model || '-';
    const author = normalized?.author || listMeta.author || '-';
    const downloadsValue = Number.isFinite(Number(normalized?.downloads))
      ? Number(normalized.downloads)
      : (Number.isFinite(Number(listMeta.downloads)) ? Number(listMeta.downloads) : null);
    const likesValue = Number.isFinite(Number(normalized?.likes))
      ? Number(normalized.likes)
      : (Number.isFinite(Number(listMeta.likes)) ? Number(listMeta.likes) : null);
    const lastUpdated = normalized?.lastModified || listMeta.lastModified || listMeta.last_modified || listMeta.updatedAt || null;

    const icon = escapeHtml(modelId.charAt(0).toUpperCase());
    const escModelId = escapeHtml(modelId);
    const statsPrimary = downloadsValue !== null ? `${formatNumber(downloadsValue)} downloads` : 'Downloads -';
    const statsSecondary = likesValue !== null ? `${formatNumber(likesValue)} likes` : 'Likes -';
    const lastUpdatedText = lastUpdated ? `Updated ${formatDateDisplay(lastUpdated)}` : 'Updated -';

    const item = document.createElement('div');
    item.className = 'mobile-model-item hf-mobile-item';
    item.setAttribute('data-hf', 'true');
    item.innerHTML = `
      <div class="mobile-model-item-header">
        <div class="mobile-model-icon">${icon}</div>
        <div style="flex: 1;">
          <div class="mobile-model-name">${escModelId}</div>
        </div>
      </div>
      <div class="mobile-model-info">
        <div class="mobile-model-info-row">
          <span class="mobile-model-label">Category:</span>
          <span class="mobile-model-value">${escapeHtml(category || '-')}</span>
        </div>
        <div class="mobile-model-info-row">
          <span class="mobile-model-label">Author:</span>
          <span class="mobile-model-value">${escapeHtml(author || '-')}</span>
        </div>
        <div class="mobile-model-info-row">
          <span class="mobile-model-label">Stats:</span>
          <span class="mobile-model-value">${escapeHtml(statsPrimary)} / ${escapeHtml(statsSecondary)}</span>
        </div>
        <div class="mobile-model-info-row">
          <span class="mobile-model-label">Last:</span>
          <span class="mobile-model-value">${escapeHtml(lastUpdatedText)}</span>
        </div>
      </div>
    `;

    container.appendChild(item);
  });
}

// Helper: fetch all model cards with bounded concurrency
async function fetchAllModelCards(modelIds, concurrency = 4) {
  const results = {};
  let i = 0;
  const runners = new Array(concurrency).fill(null).map(async () => {
    while (i < modelIds.length) {
      const idx = i++;
      const id = modelIds[idx];
      try {
        const hf = await fetchHuggingFaceModelCard(id);
        if (hf) results[id] = hf;
      } catch (e) {
        console.warn('fetchAllModelCards error for', id, e);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// expose
window.fetchHuggingFaceModels = fetchHuggingFaceModels;
window.fetchHuggingFaceModelCard = fetchHuggingFaceModelCard;
window.appendHuggingFaceModels = appendHuggingFaceModels;
window.appendHuggingFaceModelsToMobile = appendHuggingFaceModelsToMobile;
