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

async function fixDuplicates() {
    console.log('🔧 Fixing duplicates in updates collection...');

    const snapshot = await db.collection('updates').get();

    // Group by timestamp (extracted from sheetRowId)
    const byTimestamp = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (sheetRowId) {
            // Extract timestamp
            const match = sheetRowId.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
            const timestamp = match ? match[1] : null;

            if (timestamp) {
                if (!byTimestamp[timestamp]) {
                    byTimestamp[timestamp] = [];
                }
                byTimestamp[timestamp].push({
                    id: doc.id,
                    data,
                    hasImage: data.image && !data.image.includes('unsplash.com')
                });
            }
        }
    });

    let deletedCount = 0;

    for (const [timestamp, docs] of Object.entries(byTimestamp)) {
        if (docs.length > 1) {
            console.log(`\n📋 Duplicate group (${docs.length} items) for timestamp: ${timestamp.substring(0, 19)}`);

            // Sort: prefer ones with images, then by newest createdAt
            docs.sort((a, b) => {
                // Image first
                if (a.hasImage && !b.hasImage) return -1;
                if (!a.hasImage && b.hasImage) return 1;
                // Then by createdAt
                const timeA = a.data.createdAt?.toDate?.() || new Date(0);
                const timeB = b.data.createdAt?.toDate?.() || new Date(0);
                return timeB - timeA;
            });

            const survivor = docs[0];
            console.log(`   ✅ Keeping: "${survivor.data.title?.substring(0, 30)}" (Image: ${survivor.hasImage ? 'Yes' : 'No'})`);

            // Delete the rest
            for (let i = 1; i < docs.length; i++) {
                const victim = docs[i];
                console.log(`   ❌ Deleting: "${victim.data.title?.substring(0, 30)}" (Image: ${victim.hasImage ? 'Yes' : 'No'})`);
                await db.collection('updates').doc(victim.id).delete();
                deletedCount++;
            }
        }
    }

    console.log(`\n✅ Deleted ${deletedCount} duplicate items from updates collection.`);
}

fixDuplicates();
