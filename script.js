let uploadedFiles = [];

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const fileContent = document.getElementById('fileContent');
const fileName = document.getElementById('fileName');
const rawBtn = document.getElementById('rawBtn');

// Upload area click handler
uploadArea.addEventListener('click', () => fileInput.click());

// Drag and drop handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

// File input handler
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// Handle uploaded files
function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (!uploadedFiles.find(f => f.name === file.name)) {
            uploadedFiles.push(file);
        }
    });
    renderFileList();
    
    // Auto-select first file
    if (uploadedFiles.length > 0) {
        displayFile(uploadedFiles[0]);
    }
}

// Render file list
function renderFileList() {
    fileList.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.textContent = `📄 ${file.name}`;
        li.onclick = () => displayFile(file);
        if (document.querySelector('.active')?.dataset?.index == index) {
            li.classList.add('active');
        }
        fileList.appendChild(li);
    });
}

// Display file content
function displayFile(file) {
    fileName.textContent = file.name;
    
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
