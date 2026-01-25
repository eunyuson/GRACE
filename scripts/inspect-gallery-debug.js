import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

const serviceAccountPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

if (!existsSync(serviceAccountPath)) {
    console.error('Service account key not found');
    process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function inspectGallery() {
    console.log('Inspecting Gallery Collection...');
    const snapshot = await db.collection('gallery').get();

    console.log(`Found ${snapshot.size} items.`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\nID: ${doc.id}`);
        console.log(`Title: ${data.title}`);
        console.log(`Source: ${data.source || 'undefined'}`);
        console.log(`SheetRowId: ${data.sheetRowId || 'undefined'}`);
        console.log(`PromotedFrom: ${data.promotedFrom || 'undefined'}`);
        console.log(`Type: ${data.type}`);
    });
}

inspectGallery().catch(console.error);
