import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

let serviceAccount = {};
try {
    const keyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (existsSync(keyPath)) {
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

async function checkGalleryPollution() {
    console.log('🔍 Checking Gallery Collection for Pollutants...');
    const snapshot = await db.collection('gallery').get();

    console.log(`Total Gallery Items: ${snapshot.size}`);

    let pollutedCount = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const isSuspicious =
            data.source === 'shortcut' ||
            (data.sheetRowId && data.sheetRowId.startsWith('sheet_')) ||
            (data.createdAt && data.createdAt.toDate && data.createdAt.toDate().getFullYear() === 2026 && !data.index);

        if (isSuspicious) {
            console.log(`⚠️ Pollutant Found: [${doc.id}] ${data.title}`);
            console.log(`   Source: ${data.source}`);
            console.log(`   SheetRowId: ${data.sheetRowId}`);
            console.log(`   Created: ${data.createdAt ? data.createdAt.toDate() : 'N/A'}`);
            pollutedCount++;
        }
    });

    if (pollutedCount === 0) {
        console.log('✅ Gallery appears clean.');
    } else {
        console.log(`❌ Found ${pollutedCount} corrupted items in Gallery.`);
    }
}

checkGalleryPollution();
