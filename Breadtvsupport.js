// ============================================================
// ZeroTwo TV - Cloudflare Worker
// Handles:
// 1. Converge MPD stream proxy (bypasses CORS & mixed content)
// 2. Channel health checks (online/offline status)
// 3. Optional: Converts HTTP streams to HTTPS when needed
// ============================================================

// Configuration
const CONFIG = {
  // Enable CORS headers for all responses
  corsEnabled: true,
  
  // Timeout for fetch requests (milliseconds)
  fetchTimeout: 15000,
  
  // Cache TTL for channel health checks (seconds)
  healthCheckTTL: 300,
  
  // User-Agent to use for proxied requests
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Allowed origins for CORS (use '*' for all, or specify your domain)
  allowedOrigins: ['*'],
  
  // Converge stream hosts that need proxying
  convergeHosts: [
    '136.158.97.2',
    '136.239.159.18',
    '136.239.158.30',
    '136.239.173.2',
    '136.239.173.3',
    '136.239.173.26',
    '161.49.17.2',
    '136.239.158.10',
    '136.239.173.10',
    '136.239.159.20'
  ],
  
  // Channels to check for health (add more as needed)
  healthCheckChannels: [
    { name: 'GMA 7', url: 'http://136.158.97.2:6610/001/2/ch00000090990000001093/manifest.mpd' },
    { name: 'GTV', url: 'http://136.239.159.18:6610/001/2/ch00000090990000001143/manifest.mpd' },
    { name: 'Kapamilya Channel HD', url: 'http://136.239.173.2:6610/001/2/ch00000090990000001286/manifest.mpd' },
    { name: 'TV5', url: 'http://136.239.158.30:6610/001/2/ch00000090990000001088/manifest.mpd' },
    { name: 'A2Z', url: 'http://136.239.173.2:6610/001/2/ch00000090990000001089/manifest.mpd' },
    { name: 'CNN Philippines', url: 'http://136.239.173.2:6610/001/2/ch00000090990000001092/manifest.mpd' }
  ]
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Add CORS headers to response
 */
function addCorsHeaders(headers = new Headers()) {
  if (CONFIG.corsEnabled) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, User-Agent');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

/**
 * Handle OPTIONS request (CORS preflight)
 */
function handleOptions() {
  const headers = addCorsHeaders(new Headers());
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, User-Agent');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

/**
 * Check if URL needs proxying (Converge HTTP stream)
 */
function shouldProxyUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Proxy if it's an HTTP stream from converge hosts
    if (url.protocol === 'http:' && CONFIG.convergeHosts.includes(url.hostname)) {
      return true;
    }
    // Also proxy RTMP-like streams that have been converted to HTTP
    if (urlString.includes(':1935') || urlString.includes('rtmp')) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Fetch and proxy a stream with proper headers
 */
async function proxyStream(urlString, request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.fetchTimeout);
  
  try {
    // Convert URL if needed (fix backslashes)
    let cleanUrl = urlString.replace(/\\/g, '/');
    
    // Prepare headers for the proxied request
    const headers = new Headers();
    headers.set('User-Agent', CONFIG.userAgent);
    headers.set('Accept', '*/*');
    headers.set('Accept-Language', 'en-US,en;q=0.9');
    headers.set('Connection', 'keep-alive');
    headers.set('Cache-Control', 'no-cache');
    
    // Forward range header if present (for seeking)
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    }
    
    // Forward origin header for CORS
    const origin = request.headers.get('Origin');
    if (origin) {
      headers.set('Origin', origin);
    }
    
    const response = await fetch(cleanUrl, {
      method: 'GET',
      headers: headers,
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    
    // Create response with CORS headers
    const responseHeaders = addCorsHeaders(new Headers(response.headers));
    
    // Add content-type if missing
    if (!responseHeaders.has('Content-Type')) {
      if (cleanUrl.endsWith('.mpd')) {
        responseHeaders.set('Content-Type', 'application/dash+xml');
      } else if (cleanUrl.endsWith('.m3u8')) {
        responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (cleanUrl.includes('manifest.mpd')) {
        responseHeaders.set('Content-Type', 'application/dash+xml');
      } else if (cleanUrl.includes('playlist.m3u8')) {
        responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      }
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      return new Response('Request timeout', { status: 504, headers: addCorsHeaders() });
    }
    
    console.error(`Proxy error for ${urlString}:`, error);
    return new Response(`Proxy error: ${error.message}`, { 
      status: 502, 
      headers: addCorsHeaders() 
    });
  }
}

/**
 * Check channel health (simple HEAD request)
 */
async function checkChannelHealth(urlString) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(urlString, {
      method: 'HEAD',
      headers: { 'User-Agent': CONFIG.userAgent },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    return {
      online: response.ok,
      status: response.status,
      statusText: response.statusText
    };
  } catch (error) {
    return {
      online: false,
      status: 0,
      statusText: error.message
    };
  }
}

/**
 * Serve health check status page
 */
async function serveHealthCheck() {
  const results = [];
  
  for (const channel of CONFIG.healthCheckChannels) {
    const status = await checkChannelHealth(channel.url);
    results.push({
      name: channel.name,
      url: channel.url,
      online: status.online,
      status: status.status,
      checkedAt: new Date().toISOString()
    });
  }
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ZeroTwo TV - Channel Health Monitor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      color: #e0e0e0;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      font-size: 1.8rem;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #2196F3, #00BCD4);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      text-align: center;
      color: #888;
      margin-bottom: 30px;
      font-size: 0.85rem;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 12px;
      margin-bottom: 30px;
    }
    .channel-card {
      background: rgba(20, 25, 40, 0.9);
      border-radius: 12px;
      padding: 15px;
      border-left: 4px solid #ff4444;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .channel-card.online {
      border-left-color: #00c851;
    }
    .channel-card.offline {
      border-left-color: #ff4444;
    }
    .channel-card.checking {
      border-left-color: #f59e0b;
    }
    .channel-name {
      font-weight: 700;
      font-size: 1rem;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .status-badge {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 20px;
      font-weight: 600;
    }
    .status-badge.online {
      background: rgba(0, 200, 81, 0.2);
      color: #00c851;
    }
    .status-badge.offline {
      background: rgba(255, 68, 68, 0.2);
      color: #ff4444;
    }
    .status-badge.checking {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }
    .channel-url {
      font-size: 0.7rem;
      color: #888;
      word-break: break-all;
      font-family: monospace;
      margin-top: 8px;
    }
    .timestamp {
      text-align: center;
      font-size: 0.7rem;
      color: #666;
      margin-top: 20px;
    }
    .refresh-btn {
      display: block;
      width: 160px;
      margin: 20px auto;
      padding: 10px 20px;
      background: linear-gradient(135deg, #2196F3, #00BCD4);
      border: none;
      border-radius: 30px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: transform 0.2s;
    }
    .refresh-btn:hover {
      transform: scale(1.02);
    }
    .proxy-info {
      background: rgba(0, 0, 0, 0.4);
      border-radius: 12px;
      padding: 15px;
      margin-top: 20px;
      font-size: 0.8rem;
      text-align: center;
    }
    .proxy-info code {
      background: rgba(33, 150, 243, 0.2);
      padding: 4px 8px;
      border-radius: 6px;
      font-family: monospace;
    }
    @media (max-width: 600px) {
      .status-grid { grid-template-columns: 1fr; }
      body { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📺 ZeroTwo TV Channel Monitor</h1>
    <div class="subtitle">Real-time channel health status | Cloudflare Worker Proxy</div>
    
    <div class="status-grid" id="statusGrid">
      ${results.map(ch => `
        <div class="channel-card ${ch.online ? 'online' : 'offline'}">
          <div class="channel-name">
            ${escapeHtml(ch.name)}
            <span class="status-badge ${ch.online ? 'online' : 'offline'}">${ch.online ? '● ONLINE' : '● OFFLINE'}</span>
          </div>
          <div class="channel-url">${escapeHtml(ch.url.substring(0, 80))}${ch.url.length > 80 ? '...' : ''}</div>
          <div style="font-size:0.7rem; margin-top:6px; color:#aaa;">HTTP ${ch.status}</div>
        </div>
      `).join('')}
    </div>
    
    <button class="refresh-btn" onclick="location.reload()">⟳ Refresh Status</button>
    
    <div class="proxy-info">
      <strong>🔧 Proxy Active</strong><br>
      Converge MPD streams are being proxied through this worker.<br>
      To use: <code>${new URL(request?.url || 'https://worker.dev').origin}/stream-proxy?url=STREAM_URL</code>
    </div>
    <div class="timestamp">Last updated: ${new Date().toISOString()}</div>
  </div>
  <script>
    // Auto-refresh every 30 seconds (but only if page is visible)
    let refreshInterval = setInterval(() => {
      if (!document.hidden) location.reload();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearInterval(refreshInterval);
      else refreshInterval = setInterval(() => location.reload(), 30000);
    });
  </script>
</body>
</html>`;
  
  const headers = addCorsHeaders(new Headers());
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  return new Response(html, { status: 200, headers });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Main request handler
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }
  
  // Health check endpoint
  if (pathname === '/health-check' || pathname === '/status') {
    return await serveHealthCheck();
  }
  
  // Stream proxy endpoint
  if (pathname === '/stream-proxy') {
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response('Missing "url" parameter', { 
        status: 400, 
        headers: addCorsHeaders() 
      });
    }
    
    // Validate URL (basic)
    try {
      new URL(targetUrl);
    } catch (e) {
      return new Response('Invalid URL parameter', { 
        status: 400, 
        headers: addCorsHeaders() 
      });
    }
    
    return await proxyStream(targetUrl, request);
  }
  
  // Simple ping/status endpoint
  if (pathname === '/ping' || pathname === '/') {
    const headers = addCorsHeaders(new Headers());
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'ZeroTwo TV Stream Proxy',
      endpoints: {
        proxy: '/stream-proxy?url=STREAM_URL',
        health: '/health-check'
      }
    }), { status: 200, headers });
  }
  
  // 404 for other routes
  return new Response('Not Found', { 
    status: 404, 
    headers: addCorsHeaders() 
  });
}

// Register event listener
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
