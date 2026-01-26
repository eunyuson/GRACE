
import { google } from 'googleapis';
import admin from 'firebase-admin';

// Vercel Serverless Function Handler
export default async function handler(req, res) {
    // CORS headers for local dev (if needed, but usually redundant for same-origin)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    console.log('🔄 Manual Sync Triggered via Vercel Function');

    let GOOGLE_SERVICE_ACCOUNT = {};
    let FIREBASE_SERVICE_ACCOUNT = {};

    try {
        if (process.env.GOOGLE_SERVICE_ACCOUNT) {
            GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        } else {
            console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT env var missing');
            // Try to construct from individual vars if available (common pattern)
            if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
                GOOGLE_SERVICE_ACCOUNT = {
                    client_email: process.env.GOOGLE_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    project_id: process.env.GOOGLE_PROJECT_ID
                };
            }
        }

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else {
            console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT env var missing');
        }
    } catch (e) {
        console.error('Credential parsing error:', e);
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!GOOGLE_SERVICE_ACCOUNT.client_email || !FIREBASE_SERVICE_ACCOUNT.project_id) {
        // Fallback for local testing if needed, but for production this is critical
        return res.status(500).json({
            error: 'Missing credentials. Please check Vercel Environment Variables.',
            details: 'GOOGLE_SERVICE_ACCOUNT and FIREBASE_SERVICE_ACCOUNT are required.'
        });
    }

    const SHEET_ID = process.env.GOOGLE_SHEET_ID || '10JbOBm57VtS8ZjmYUA_xkk8F9RhAElRWKs55Dq0q8ck';

    // Firebase Init
    if (!admin.apps.length) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
            });
        } catch (e) {
            console.error('Firebase Init Error:', e);
            return res.status(500).json({ error: 'Database connection failed' });
        }
    }

    const db = admin.firestore();

    try {
        // 1. Google Sheets Client
        const auth = new google.auth.GoogleAuth({
            credentials: GOOGLE_SERVICE_ACCOUNT,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        // 2. Fetch Data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Inbox!A:E'
        });

        const rows = response.data.values;
        if (!rows || rows.length <= 1) {
            return res.status(200).json({ message: 'No data in sheet', count: 0 });
        }

        // Parse Data
        const headers = rows[0];
        const sheetData = rows.slice(1).map((row, index) => {
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = row[i] || '';
            });
            obj.rowIndex = index + 2;
            return obj;
        });

        // 3. Get existing to skip
        const syncedTimestamps = new Set();
        const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.sheetRowId) {
                // Normalize ID
                const match = data.sheetRowId.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
                if (match) syncedTimestamps.add(match[1]);
                else syncedTimestamps.add(data.sheetRowId);
            }
        });

        const deletedSnapshot = await db.collection('deletedItems').get();
        const deletedIds = new Set();
        deletedSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.sheetRowId) {
                const match = data.sheetRowId.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
                if (match) deletedIds.add(match[1]);
            }
        });

        // 4. Filter New Items
        const newItems = sheetData.filter(row => {
            const timestamp = row.created_at;
            if (!timestamp) return false;
            if (syncedTimestamps.has(timestamp)) return false;
            if (deletedIds.has(timestamp)) return false;
            return true;
        });

        // 5. Add New Items
        let addedCount = 0;
        if (newItems.length > 0) {
            // Get Next Index
            const indexSnap = await db.collection('updates').orderBy('index', 'desc').limit(1).get();
            let nextIdx = 1;
            if (!indexSnap.empty) {
                const lastIdx = parseInt(indexSnap.docs[0].data().index, 10);
                if (!isNaN(lastIdx)) nextIdx = lastIdx + 1;
            }

            const batch = db.batch();

            for (const row of newItems) {
                let payload = {};
                try {
                    const sanitized = (row.payload || '{}').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
                    payload = JSON.parse(sanitized);
                } catch (e) {
                    console.error('Payload parse error', e);
                    continue;
                }

                // Image Logic
                let imageUrl = '';
                if (row.imageUrl && row.imageUrl.trim()) imageUrl = row.imageUrl.trim();
                else if (payload.imageUrl) imageUrl = payload.imageUrl;
                else if (payload.image) imageUrl = payload.image;
                else if (Array.isArray(payload.images) && payload.images.length > 0) imageUrl = payload.images[0];

                // Drive URL Convert
                if (imageUrl) {
                    if (imageUrl.includes('drive.google.com') || imageUrl.includes('id=')) {
                        const idMatch = imageUrl.match(/id=([a-zA-Z0-9_-]+)/) || imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                        if (idMatch) imageUrl = `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
                    }
                }
                if (!imageUrl) imageUrl = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop';

                const tags = payload.tags || [];
                const content = [{
                    id: 'main',
                    keyword: 'CONTENT',
                    text: payload.body || '',
                    date: row.created_at || new Date().toISOString()
                }];
                if (tags.length > 0) {
                    content.push({ id: 'tags', keyword: 'TAGS', text: tags.join(', ') });
                }

                const galleryItem = {
                    index: String(nextIdx).padStart(2, '0'),
                    title: payload.title || 'Untitled',
                    subtitle: payload.summary || '',
                    image: imageUrl,
                    type: 'image',
                    descTitle: payload.title || 'Untitled',
                    desc: payload.summary || '',
                    content: content,
                    source: 'shortcut',
                    sheetRowId: `sheet_${row.created_at}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    syncedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                const docRef = db.collection('updates').doc();
                batch.set(docRef, galleryItem);
                addedCount++;
                nextIdx++;
            }
            await batch.commit();
        }

        return res.status(200).json({
            success: true,
            added: addedCount,
            message: `Synced ${addedCount} new items.`
        });

    } catch (error) {
        console.error('Sync Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
