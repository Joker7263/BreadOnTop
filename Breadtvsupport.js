// Cloudflare Worker para sa BreadOnTop IPTV
// I-paste ito sa Cloudflare Workers dashboard

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // CORS headers para payagan ang lahat ng requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        };
        
        // Handle OPTIONS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        // Channel configurations na may Clearkey licenses
        const channels = {
            'oneph': {
                name: 'One PH',
                url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/oneph_sd/default/index.mpd',
                keyId: 'b1c7e9d24f8a4d6c9e337a2f1c5b8d60',
                key: '8ff2e524cc1e028f2a4d4925e860c796'
            },
            'gma': {
                name: 'GMA Pinoy TV',
                url: 'https://abslive.akamaized.net/dash/live/2099522/gmapt3/manifest.mpd',
                keyId: '7b5d15a7385546768aca9fd505ad5e16',
                key: 'f534393c84c1a9c17fa36bc3a4380981'
            },
            'tv5': {
                name: 'TV5',
                url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/tv5_hd/default1/index.mpd',
                keyId: '2615129ef2c846a9bbd43a641c7303ef',
                key: '07c7f996b1734ea288641a68e1cfdc4d'
            },
            'hbo': {
                name: 'HBO',
                url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_hbohd/default/index.mpd',
                keyId: 'c2b7a1e95d4f4c3a8e617f9d0a2b6c18',
                key: '27fca1ab042998b0c2f058b0764d7ed4'
            },
            'a2z': {
                name: 'A2Z',
                url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_a2z/default/index.mpd',
                keyId: '3f6d8a2c1b7e4c9f8d52a7e1b0c6f93d',
                key: '4019f9269b9054a2b9e257b114ebbaf2'
            },
            'ptv': {
                name: 'PTV4',
                url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_ptv4_sd/default/index.mpd',
                keyId: '71a130a851b9484bb47141c8966fb4a3',
                key: 'ad1f003b4f0b31b75ea4593844435600'
            },
            'gmalife': {
                name: 'GMA Life TV',
                url: 'https://abslive.akamaized.net/dash/live/2099522/glife3/manifest.mpd',
                keyId: '5d308ef487f54107b7da758e195ecbd3',
                key: '9d4004d4c065dd4b85ad5bd12c35386f'
            },
            'onenews': {
                name: 'One News',
                url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/onenews_hd1/default/index.mpd',
                keyId: '2e6a9d7c1f4b4c8a8d33c7b1f0a5e924',
                key: '4c71e178d090332fbfe72e023b59f6d2'
            }
        };
        
        // Serve HTML page para sa root path
        if (path === '/' || path === '/index.html') {
            const html = await getHTMLPage();
            return new Response(html, {
                headers: {
                    'Content-Type': 'text/html;charset=UTF-8',
                    ...corsHeaders
                }
            });
        }
        
        // API endpoint para makuha ang channel list
        if (path === '/api/channels') {
            const channelList = Object.entries(channels).map(([id, ch]) => ({
                id: id,
                name: ch.name,
                url: `/api/stream/${id}`
            }));
            return new Response(JSON.stringify(channelList), {
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // Stream proxy - binabasa ang MPD at nag-iinject ng Clearkey info
        if (path.startsWith('/api/stream/')) {
            const channelId = path.split('/').pop();
            const channel = channels[channelId];
            
            if (!channel) {
                return new Response('Channel not found', { status: 404 });
            }
            
            try {
                // Fetch original MPD
                const mpdResponse = await fetch(channel.url, {
                    headers: {
                        'Origin': 'https://qp-pldt-live-bpk-02-prod.akamaized.net',
                        'Referer': 'https://cignal.tv/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                let mpdContent = await mpdResponse.text();
                
                // I-inject ang Clearkey license URL sa MPD
                const licenseUrl = `https://${url.hostname}/api/license/${channelId}`;
                const clearkeyXml = `<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
                    <clearkey:Laurl>${licenseUrl}</clearkey:Laurl>
                </ContentProtection>`;
                
                // I-insert sa bawat AdaptationSet
                mpdContent = mpdContent.replace(/<\/AdaptationSet>/g, `${clearkeyXml}</AdaptationSet>`);
                
                return new Response(mpdContent, {
                    headers: {
                        'Content-Type': 'application/dash+xml',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        ...corsHeaders
                    }
                });
            } catch (error) {
                return new Response(`Error fetching stream: ${error.message}`, { status: 500 });
            }
        }
        
        // License endpoint para sa Clearkey decryption
        if (path.startsWith('/api/license/')) {
            const channelId = path.split('/').pop();
            const channel = channels[channelId];
            
            if (!channel) {
                return new Response('Invalid license request', { status: 400 });
            }
            
            // Clearkey license response format
            const licenseResponse = {
                keys: [{
                    kty: 'oct',
                    kid: channel.keyId,
                    k: channel.key
                }],
                type: 'temporary'
            };
            
            return new Response(JSON.stringify(licenseResponse), {
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // 404 for other paths
        return new Response('BreadOnTop IPTV Worker - Channel proxy active', { 
            status: 200,
            headers: corsHeaders
        });
    }
};

// HTML Page na ipapakita sa root
async function getHTMLPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>BreadOnTop IPTV - Cignal + Converge Philippines</title>
    <script src="https://cdn.jsdelivr.net/npm/shaka-player@4.11.6/dist/shaka-player.compiled.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: white;
            padding: 16px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            text-align: center;
            margin-bottom: 24px;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border-radius: 24px;
        }
        .header h1 { font-size: 1.8rem; color: #e94560; }
        .player-wrapper {
            background: #000;
            border-radius: 20px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        video {
            width: 100%;
            height: auto;
            max-height: 55vh;
            background: black;
        }
        .info-bar {
            background: #1a1f2e;
            padding: 14px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .current-channel {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .current-logo {
            width: 45px;
            height: 45px;
            object-fit: contain;
            background: white;
            border-radius: 10px;
            padding: 6px;
        }
        .status {
            padding: 5px 14px;
            border-radius: 30px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .status-ready { background: #2c3e50; }
        .status-playing { background: #2ecc71; }
        .status-loading { background: #f39c12; animation: pulse 1s infinite; }
        .status-error { background: #e74c3c; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        .channels-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
            max-height: 420px;
            overflow-y: auto;
            padding: 4px;
        }
        .channel-card {
            background: #141824;
            border-radius: 14px;
            padding: 10px 12px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 12px;
            border: 1px solid #252a3e;
        }
        .channel-card:hover, .channel-card.active {
            background: #e94560;
            transform: translateX(3px);
        }
        .channel-logo {
            width: 42px;
            height: 42px;
            object-fit: contain;
            background: white;
            border-radius: 8px;
            padding: 5px;
        }
        .channel-name { font-size: 0.85rem; font-weight: 600; }
        .channel-group { font-size: 0.65rem; opacity: 0.7; }
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 0.7rem;
            opacity: 0.5;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🍞 BreadOnTop IPTV</h1>
        <p>Cignal TV · Converge TV · Philippines</p>
        <small>Powered by Cloudflare Worker | DASH + Clearkey</small>
    </div>

    <div class="player-wrapper">
        <video id="videoPlayer" controls autoplay playsinline></video>
        <div class="info-bar">
            <div class="current-channel" id="currentChannelInfo">
                <img class="current-logo" id="currentLogo" src="https://i.imgur.com/gkluDe9.png">
                <div>
                    <div id="currentName" style="font-weight: bold;">One PH</div>
                    <div id="currentGroup" style="font-size: 0.7rem; opacity: 0.7;">Entertainment</div>
                </div>
            </div>
            <div class="status status-ready" id="statusDisplay">● Ready</div>
        </div>
    </div>

    <div class="channels-grid" id="channelList"></div>
    <div class="footer">⚡ BreadOnTop IPTV · Cloudflare Worker Proxy Active</div>
</div>

<script>
    const channels = [
        { id: "oneph", name: "One PH", group: "Entertainment", logo: "https://i.imgur.com/gkluDe9.png" },
        { id: "gma", name: "GMA Pinoy TV", group: "Entertainment", logo: "https://upload.wikimedia.org/wikipedia/en/a/af/GMA_Pinoy_TV_logo.png" },
        { id: "gmalife", name: "GMA Life TV", group: "Lifestyle", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/GMA_Life_TV_logo.png/1280px-GMA_Life_TV_logo.png" },
        { id: "tv5", name: "TV5", group: "Entertainment", logo: "https://static.wikia.nocookie.net/russel/images/7/7a/TV5_HD_Logo_2024.png" },
        { id: "a2z", name: "A2Z", group: "Entertainment", logo: "https://static.wikia.nocookie.net/russel/images/8/85/A2Z_Channel_11_without_Channel_11_3D_Logo_2020.png" },
        { id: "ptv", name: "PTV4", group: "News", logo: "https://static.wikia.nocookie.net/russel/images/d/dc/PTV_4_Para_Sa_Bayan_Alternative_Logo_June_2017.png" },
        { id: "hbo", name: "HBO", group: "Movies", logo: "https://images.now-tv.com/shares/channelPreview/img/en_hk/color/ch115_170_122" },
        { id: "onenews", name: "One News", group: "News", logo: "https://i.imgur.com/bpRiu54.png" }
    ];

    let player = null;

    async function initPlayer() {
        const video = document.getElementById('videoPlayer');
        player = new shaka.Player(video);
        player.configure({
            drm: { clearKeys: {}, servers: {} }
        });
        player.addEventListener('error', (e) => {
            document.getElementById('statusDisplay').textContent = '⚠️ Error';
            document.getElementById('statusDisplay').className = 'status status-error';
        });
    }

    async function loadChannel(channel) {
        if (!player) await initPlayer();
        
        document.getElementById('currentLogo').src = channel.logo;
        document.getElementById('currentName').textContent = channel.name;
        document.getElementById('currentGroup').textContent = channel.group;
        
        const statusDiv = document.getElementById('statusDisplay');
        statusDiv.textContent = '🔄 Loading...';
        statusDiv.className = 'status status-loading';
        
        // Highlight active
        document.querySelectorAll('.channel-card').forEach(card => {
            card.classList.remove('active');
            if (card.querySelector('.channel-name')?.innerText === channel.name) {
                card.classList.add('active');
            }
        });
        
        try {
            const streamUrl = \`/api/stream/\${channel.id}\`;
            await player.load(streamUrl);
            statusDiv.textContent = '● Playing';
            statusDiv.className = 'status status-playing';
        } catch (error) {
            statusDiv.textContent = '⚠️ Failed';
            statusDiv.className = 'status status-error';
        }
    }

    function renderChannels() {
        const container = document.getElementById('channelList');
        container.innerHTML = '';
        channels.forEach(channel => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.innerHTML = \`
                <img class="channel-logo" src="\${channel.logo}" onerror="this.src='https://i.imgur.com/31e7xew.png'">
                <div>
                    <div class="channel-name">\${channel.name}</div>
                    <div class="channel-group">\${channel.group}</div>
                </div>
            \`;
            card.onclick = () => loadChannel(channel);
            container.appendChild(card);
        });
    }

    window.onload = async () => {
        renderChannels();
        await initPlayer();
        if (channels.length) loadChannel(channels[0]);
    };
</script>
</body>
</html>`;
}
