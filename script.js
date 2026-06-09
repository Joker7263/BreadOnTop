// Storage keys
const STORAGE_KEY = 'github_clone_files';

// Global state
let files = [];
let currentFile = null;
let isEditing = false;
let currentRawLink = '';

// Load files from localStorage
function loadFiles() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        files = JSON.parse(stored);
    } else {
        // Demo files
        files = [
            {
                name: 'README.md',
                content: '# Welcome to GitHub Clone\n\nThis is a demo file.\n\n## Features:\n- Upload files\n- Edit files\n- Delete files\n- Copy raw links\n- Beautiful UI',
                size: 0,
                type: 'md',
                lastModified: Date.now()
            },
            {
                name: 'example.js',
                content: '// Example JavaScript file\nconsole.log("Hello from GitHub Clone!");\n\nfunction greet(name) {\n    return `Hello, ${name}!`;\n}',
                size: 0,
                type: 'js',
                lastModified: Date.now()
            }
        ];
        saveFiles();
    }
    updateFileSizes();
    renderFileTree();
    updateFileCount();
}

// Save files to localStorage
function saveFiles() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    updateFileCount();
}

// Update file sizes
function updateFileSizes() {
    files.forEach(file => {
        file.size = new Blob([file.content]).size;
        file.type = file.name.split('.').pop().toLowerCase();
    });
}

// Render file tree
function renderFileTree() {
    const container = document.getElementById('fileTree');
    container.innerHTML = '';
    
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-item';
        if (currentFile && currentFile.name === file.name) {
            fileDiv.classList.add('active');
        }
        
        const icon = getFileIcon(file.type);
        fileDiv.innerHTML = `
            <i class="${icon}"></i>
            <span>${file.name}</span>
        `;
        
        fileDiv.onclick = () => selectFile(file);
        container.appendChild(fileDiv);
    });
}

// Get file icon
function getFileIcon(type) {
    const icons = {
        js: 'fab fa-js',
        html: 'fab fa-html5',
        css: 'fab fa-css3-alt',
        json: 'fas fa-code',
        md: 'fas fa-markdown',
        txt: 'fas fa-file-alt',
        py: 'fab fa-python',
        java: 'fab fa-java'
    };
    return icons[type] || 'fas fa-file';
}

// Select file
function selectFile(file) {
    currentFile = file;
    isEditing = false;
    
    document.getElementById('fileName').innerHTML = `<i class="${getFileIcon(file.type)}"></i> ${file.name}`;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('currentFileLabel').textContent = file.name;
    
    // Generate raw link
    currentRawLink = generateRawLink(file);
    
    // Enable/disable buttons
    document.getElementById('rawLinkBtn').disabled = false;
    document.getElementById('editBtn').disabled = false;
    document.getElementById('deleteBtn').disabled = false;
    document.getElementById('downloadBtn').disabled = false;
    
    // Display content
    displayFileContent(file);
    
    // Hide empty state
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('fileViewer').style.display = 'flex';
    
    renderFileTree();
}

// Display file content with syntax highlighting
function displayFileContent(file) {
    const viewer = document.getElementById('codeViewer');
    const editor = document.getElementById('codeEditor');
    
    if (isEditing) {
        editor.style.display = 'block';
        viewer.style.display = 'none';
        editor.textContent = file.content;
        editor.setAttribute('contenteditable', 'true');
        editor.focus();
    } else {
        editor.style.display = 'none';
        viewer.style.display = 'block';
        
        // Syntax highlighting
        if (['js', 'html', 'css', 'json', 'md', 'xml'].includes(file.type)) {
            const highlighted = hljs.highlight(file.content, { language: file.type }).value;
            viewer.innerHTML = highlighted;
        } else {
            viewer.textContent = file.content;
        }
    }
}

// Generate raw link
function generateRawLink(file) {
    const data = {
        name: file.name,
        content: file.content,
        type: file.type,
        timestamp: Date.now()
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    return `${window.location.origin}/raw/${encoded}`;
}

// Copy raw link
async function copyRawLink() {
    if (!currentRawLink) return;
    
    try {
        await navigator.clipboard.writeText(currentRawLink);
        showToast('✅ Raw link copied to clipboard!', 'success');
    } catch (err) {
        showToast('❌ Failed to copy link', 'error');
    }
}

// Show raw view
function showRawView() {
    if (!currentFile) return;
    
    const rawView = document.getElementById('rawView');
    const rawContent = document.getElementById('rawContent');
    
    rawContent.textContent = currentFile.content;
    rawView.style.display = 'flex';
    
    // Add to history without reload
    const url = new URL(window.location);
    url.searchParams.set('raw', currentFile.name);
    window.history.pushState({}, '', url);
}

// Edit file
function editFile() {
    if (!currentFile) return;
    isEditing = true;
    displayFileContent(currentFile);
    document.getElementById('editBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'flex';
    showToast('✏️ Editing mode enabled', 'info');
}

// Save file
function saveFile() {
    if (!currentFile) return;
    
    const editor = document.getElementById('codeEditor');
    const newContent = editor.textContent;
    
    currentFile.content = newContent;
    currentFile.size = new Blob([newContent]).size;
    currentFile.lastModified = Date.now();
    
    saveFiles();
    isEditing = false;
    displayFileContent(currentFile);
    
    document.getElementById('editBtn').style.display = 'flex';
    document.getElementById('saveBtn').style.display = 'none';
    
    showToast('✅ File saved successfully!', 'success');
    renderFileTree();
}

// Delete file
function deleteFile() {
    if (!currentFile) return;
    
    if (confirm(`Are you sure you want to delete "${currentFile.name}"?`)) {
        const index = files.findIndex(f => f.name === currentFile.name);
        if (index !== -1) {
            files.splice(index, 1);
            saveFiles();
            
            currentFile = null;
            document.getElementById('fileViewer').style.display = 'none';
            document.getElementById('emptyState').style.display = 'flex';
            
            // Disable buttons
            ['rawLinkBtn', 'editBtn', 'deleteBtn', 'downloadBtn'].forEach(id => {
                document.getElementById(id).disabled = true;
            });
            
            renderFileTree();
            showToast('🗑️ File deleted', 'info');
        }
    }
}

// Download file
function downloadFile() {
    if (!currentFile) return;
    
    const blob = new Blob([currentFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.name;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Download started', 'success');
}

// Upload files
function uploadFiles(filesToUpload) {
    Array.from(filesToUpload).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const newFile = {
                name: file.name,
                content: e.target.result,
                size: file.size,
                type: file.name.split('.').pop().toLowerCase(),
                lastModified: Date.now()
            };
            
            // Check if file already exists
            const existing = files.findIndex(f => f.name === newFile.name);
            if (existing !== -1) {
                if (confirm(`${newFile.name} already exists. Overwrite?`)) {
                    files[existing] = newFile;
                }
            } else {
                files.push(newFile);
            }
            
            saveFiles();
            renderFileTree();
            selectFile(newFile);
            showToast(`📁 ${file.name} uploaded!`, 'success');
        };
        reader.readAsText(file);
    });
}

// Create new file
function createNewFile(name, content) {
    if (files.find(f => f.name === name)) {
        showToast('❌ File already exists!', 'error');
        return false;
    }
    
    const newFile = {
        name: name,
        content: content || '',
        size: 0,
        type: name.split('.').pop().toLowerCase(),
        lastModified: Date.now()
    };
    
    files.push(newFile);
    saveFiles();
    renderFileTree();
    selectFile(newFile);
    showToast(`✨ Created ${name}`, 'success');
    return true;
}

// Update file count
function updateFileCount() {
    document.getElementById('fileCount').textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.background = type === 'error' ? '#da3633' : type === 'success' ? '#238636' : '#21262d';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// Event listeners
document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
});

document.getElementById('newFileBtn').addEventListener('click', () => {
    document.getElementById('modal').style.display = 'flex';
});

document.getElementById('rawLinkBtn').addEventListener('click', copyRawLink);
document.getElementById('editBtn').addEventListener('click', editFile);
document.getElementById('saveBtn').addEventListener('click', saveFile);
document.getElementById('deleteBtn').addEventListener('click', deleteFile);
document.getElementById('downloadBtn').addEventListener('click', downloadFile);
document.getElementById('closeRawBtn').addEventListener('click', () => {
    document.getElementById('rawView').style.display = 'none';
});

// Modal handlers
document.querySelector('.modal-close').addEventListener('click', () => {
    document.getElementById('modal').style.display = 'none';
});

document.querySelector('.modal-cancel').addEventListener('click', () => {
    document.getElementById('modal').style.display = 'none';
});

document.querySelector('.modal-create').addEventListener('click', () => {
    const name = document.getElementById('newFileName').value;
    const content = document.getElementById('newFileContent').value;
    
    if (name) {
        createNewFile(name, content);
        document.getElementById('modal').style.display = 'none';
        document.getElementById('newFileName').value = '';
        document.getElementById('newFileContent').value = '';
    } else {
        showToast('Please enter a file name', 'error');
    }
});

// Close modal on outside click
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) {
        document.getElementById('modal').style.display = 'none';
    }
});

// Initialize
loadFiles();

// If no files, show empty state
if (files.length === 0) {
    document.getElementById('fileViewer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
} else if (!currentFile && files.length > 0) {
    selectFile(files[0]);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 's' && isEditing) {
            e.preventDefault();
            saveFile();
        }
        if (e.key === 'e' && currentFile && !isEditing) {
            e.preventDefault();
            editFile();
        }
    }
});    fileName.textContent = file.name;
    
    // Remove active class from all list items
    document.querySelectorAll('#fileList li').forEach(li => li.classList.remove('active'));
    
    // Add active class to clicked item
    event?.target.classList.add('active');
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const extension = file.name.split('.').pop().toLowerCase();
        
        // Syntax highlighting based on extension
        if (['js', 'json', 'html', 'css', 'xml', 'md'].includes(extension)) {
            fileContent.innerHTML = hljs.highlight(content, { language: extension }).value;
            fileContent.style.background = '#0d1117';
        } else {
            fileContent.textContent = content;
        }
    };
    reader.readAsText(file);
}

// Raw view functionality
rawBtn.addEventListener('click', () => {
    if (fileName.textContent) {
        const file = uploadedFiles.find(f => f.name === fileName.textContent);
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Open raw content in new window
                const rawWindow = window.open();
                rawWindow.document.body.innerHTML = `<pre style="margin:0;padding:20px;background:#0d1117;color:#c9d1d9;font-family:monospace;">${escapeHtml(e.target.result)}</pre>`;
            };
            reader.readAsText(file);
        }
    }
});

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load highlight.js for syntax highlighting
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
document.head.appendChild(script);

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
document.head.appendChild(link);
