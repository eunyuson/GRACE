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

async function listAllGalleryItems() {
    console.log('🔍 Listing ALL Gallery Items for Inspection...');
    const snapshot = await db.collection('gallery').orderBy('index', 'asc').get(); // Try order by index

    // Also get valid titles from gallery.ts to cross-reference? Not easy since it's TS file.
    // We'll just dump them and let the LLM analyze.

    console.log(`Total Count: ${snapshot.size}`);
    console.log('---------------------------------------------------');
    console.log('ID | Index | Title | Source | SheetRowId | CreatedAt');
    console.log('---------------------------------------------------');

    snapshot.forEach(doc => {
        const data = doc.data();
        // Format log slightly for readability
        const title = (data.title || 'Untitled').substring(0, 30);
        const created = data.createdAt ? data.createdAt.toDate().toISOString().split('T')[0] : 'N/A';
        console.log(`${doc.id} | ${data.index || '??'} | ${title} | ${data.source || '-'} | ${data.sheetRowId || '-'} | ${created}`);
    });
}

listAllGalleryItems();
