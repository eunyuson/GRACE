
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

async function resetDeletedStatus() {
    console.log('🔄 Resetting deleted status for Shortcut items to force re-sync...');

    // Get all deleted items that look like shortcuts (sheet_DATE)
    const snapshot = await db.collection('deletedItems').get();

    if (snapshot.empty) {
        console.log('No deleted items found.');
        return;
    }

    const batch = db.batch();
    let count = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.sheetRowId && data.sheetRowId.startsWith('sheet_')) {
            console.log(`Re-enabling: ${data.title || data.sheetRowId}`);
            batch.delete(doc.ref);
            count++;
        }
    });

    if (count > 0) {
        await batch.commit();
        console.log(`✅ Successfully cleared ${count} items from deletedItems list.`);
        console.log('👉 Now run the sync script to restore them to Recent Updates.');
    } else {
        console.log('No shortcut items found in deletedItems.');
    }
}

resetDeletedStatus();
