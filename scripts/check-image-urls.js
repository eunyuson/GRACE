/**
 * Check sample image URLs to understand format
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

let serviceAccount = {};
try {
    const keyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
    if (existsSync(keyPath)) {
        serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load creds', e);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkImageUrls() {
    console.log('🔍 Checking Sample Image URLs...\n');
    const snapshot = await db.collection('updates').limit(10).get();

    snapshot.docs.forEach((doc, i) => {
        const data = doc.data();
        const imageUrl = data.image || 'NONE';

        console.log(`[${i + 1}] ${data.title?.substring(0, 40)}...`);
        console.log(`    Image Type: ${typeof imageUrl}`);
        console.log(`    Image URL: ${imageUrl.substring(0, 100)}...`);
        console.log(`    Starts with https: ${imageUrl.startsWith('https://')}`);
        console.log('');
    });
}

checkImageUrls().then(() => process.exit(0));
