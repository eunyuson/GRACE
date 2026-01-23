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

async function checkUpdatesImages() {
    console.log('🔍 Checking images in updates collection...\n');

    const snapshot = await db.collection('updates').orderBy('createdAt', 'desc').limit(20).get();

    console.log(`Found ${snapshot.size} recent items in updates:\n`);

    let withImage = 0;
    let withoutImage = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const hasImage = data.image && data.image.trim() !== '';

        if (hasImage) {
            withImage++;
            console.log(`✅ [${doc.id}] ${data.title?.substring(0, 30)}`);
            console.log(`   Image: ${data.image?.substring(0, 60)}...`);
        } else {
            withoutImage++;
            console.log(`❌ [${doc.id}] ${data.title?.substring(0, 30)}`);
            console.log(`   Image: MISSING`);
            console.log(`   SheetRowId: ${data.sheetRowId}`);
        }
    });

    console.log(`\n📊 Summary: ${withImage} with images, ${withoutImage} without images`);
}

checkUpdatesImages();
