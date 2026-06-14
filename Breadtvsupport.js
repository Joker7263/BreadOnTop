// cloudflare-worker.js - I-deploy sa Cloudflare Workers Dashboard
// URL: https://dash.cloudflare.com/ > Workers & Pages > Create Worker

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Handle CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                }
            });
        }
        
        // Channel configurations
        const channels = {
            'oneph': {
                url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/oneph_sd/default/index.mpd',
                keyId: 'b1c7e9d24f8a4d6c9e337a2f1c5b8d60',
                key: '8ff2e524cc1e028f2a4d4925e860c796'
            },
            'gma': {
                url: 'https://abslive.akamaized.net/dash/live/2099522/gmapt3/manifest.mpd',
                keyId: '7b5d15a7385546768aca9fd505ad5e16',
                key: 'f534393c84c1a9c17fa36bc3a4380981'
            },
            'tv5': {
                url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/tv5_hd/default1/index.mpd',
                keyId: '2615129ef2c846a9bbd43a641c7303ef',
                key: '07c7f996b1734ea288641a68e1cfdc4d'
            },
            'hbo': {
                url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_hbohd/default/index.mpd',
                keyId: 'c2b7a1e95d4f4c3a8e617f9d0a2b6c18',
                key: '27fca1ab042998b0c2f058b0764d7ed4'
            },
            'a2z': {
                url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_a2z/default/index.mpd',
                keyId: '3f6d8a2c1b7e4c9f8d52a7e1b0c6f93d',
                key: '4019f9269b9054a2b9e257b114ebbaf2'
            },
            'ptv': {
                url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_ptv4_sd/default/index.mpd',
                keyId: '71a130a851b9484bb47141c8966fb4a3',
                key: 'ad1f003b4f0b31b75ea4593844435600'
            }
        };
        
        const path = url.pathname;
        
        // API endpoint para makuha ang channel list
        if (path === '/api/channels') {
            const channelList = Object.entries(channels).map(([id, ch]) => ({
                id: id,
                name: ch.name || id,
                url: `/api/stream/${id}`
            }));
            return new Response(JSON.stringify(channelList), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        // Stream proxy - binabasa ang MPD at ginagawang accessible
        if (path.startsWith('/api/stream/')) {
            const channelId = path.split('/').pop();
            const channel = channels[channelId];
            
            if (!channel) {
                return new Response('Channel not found', { status: 404 });
            }
            
            // Fetch original MPD
            const mpdResponse = await fetch(channel.url, {
                headers: {
                    'Origin': 'https://qp-pldt-live-bpk-02-prod.akamaized.net',
                    'Referer': 'https://cignal.tv/'
                }
            });
            
            let mpdContent = await mpdResponse.text();
            
            // Inject Clearkey license info sa MPD
            const clearkeyXml = `
                <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
                    <cenc:pssh>AAAAW3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAADsIARIQ${channel.keyId}GKclkXNoRVpKImZmIiIkeWV5X2lkIiA6ICIkeWV5X2lkIiwgImtleSIgOiAiJHlvdXJfa2V5In0iCg==</cenc:pssh>
                    <clearkey:Laurl>https://${url.hostname}/api/license/${channelId}</clearkey:Laurl>
                </ContentProtection>
            `;
            
            // I-insert ang clearkey sa MPD
            mpdContent = mpdContent.replace('</AdaptationSet>', `${clearkeyXml}</AdaptationSet>`);
            
            return new Response(mpdContent, {
                headers: {
                    'Content-Type': 'application/dash+xml',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }
        
        // License endpoint para sa clearkey
        if (path.startsWith('/api/license/')) {
            const channelId = path.split('/').pop();
            const channel = channels[channelId];
            
            if (!channel) {
                return new Response('Invalid license', { status: 400 });
            }
            
            // Clearkey license response
            const license = {
                keys: [{
                    kty: 'oct',
                    kid: channel.keyId,
                    k: channel.key
                }],
                type: 'temporary'
            };
            
            return new Response(JSON.stringify(license), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        return new Response('IPTV Proxy Server', { status: 200 });
    }
};
