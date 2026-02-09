/**
 * Check praise images (gallery collection where type == 'praise')
 * Checks for validity of URLs via HEAD request
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// service account path might vary, ensure correct path
const credentialPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

try {
    const serviceAccount = JSON.parse(readFileSync(credentialPath, 'utf8'));
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
} catch (error) {
    console.error('Credential Error:', error.message);
    process.exit(1);
}

const db = admin.firestore();

async function checkUrl(url) {
    if (!url) return { ok: false, status: 'EMPTY' };
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type')
        };
    } catch (error) {
        return { ok: false, status: 'ERROR', error: error.message };
    }
}

async function run() {
    console.log('Fetching praise songs from gallery...');
    const snapshot = await db.collection('gallery')
        .where('type', '==', 'praise')
        .get();

    console.log(`Found ${snapshot.size} praise songs.\nChecking images...\n`);

    let totalImages = 0;
    let failedImages = 0;

    const results = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const urls = [];
        if (data.imageUrl) urls.push(data.imageUrl);
        if (data.imageUrls && Array.isArray(data.imageUrls)) {
            urls.push(...data.imageUrls);
        }

        // Remove duplicates
        const uniqueUrls = [...new Set(urls)];

        if (uniqueUrls.length === 0) {
            console.log(`[${data.number}곡] ${data.title}: ❌ No Image URLs`);
            continue;
        }

        for (const url of uniqueUrls) {
            totalImages++;
            const check = await checkUrl(url);
            if (!check.ok) {
                failedImages++;
                console.log(`[${data.number}곡] ${data.title}: 🔴 ${check.status} - ${url.substring(0, 60)}...`);
                results.push({ number: data.number, title: data.title, url, status: check.status, error: check.error });
            } else {
                // Success case (optional logging)
                // console.log(`[${data.number}곡] ${data.title}: 🟢 OK`);
            }
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total Images Checked: ${totalImages}`);
    console.log(`Failed Images: ${failedImages}`);

    if (failedImages > 0) {
        console.log('\nPotential Issues:');
        console.log('1. Broken Links (404)');
        console.log('2. Expired Tokens (403)');
        console.log('3. CORS/Referrer (403)');
    }
}

run().catch(console.error);
