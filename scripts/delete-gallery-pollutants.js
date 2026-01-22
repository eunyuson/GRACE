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

async function deletePollutants() {
    console.log('🧹 Starting cleanup of Gallery Pollution...');
    const snapshot = await db.collection('gallery').get();

    const batch = db.batch();
    let deletedCount = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const isSuspicious =
            data.source === 'shortcut' ||
            (data.sheetRowId && data.sheetRowId.startsWith('sheet_'));

        if (isSuspicious) {
            console.log(`Deleting: [${doc.id}] ${data.title}`);
            batch.delete(doc.ref);
            deletedCount++;
        }
    });

    if (deletedCount > 0) {
        await batch.commit();
        console.log(`✅ Successfully removed ${deletedCount} polluted items from Gallery.`);
    } else {
        console.log('✨ Gallery is already clean.');
    }
}

deletePollutants();
