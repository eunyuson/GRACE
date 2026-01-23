/**
 * Check for duplicate items in the 'updates' collection
 * Specifically looking for items with same title but different image states
 */

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

async function checkDuplicates() {
    console.log('🔍 Checking Updates Collection for Duplicates...\n');
    const snapshot = await db.collection('updates').get();

    console.log(`Total Updates Items: ${snapshot.size}\n`);

    // Group by title
    const byTitle = {};
    const defaultImage = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb';

    snapshot.forEach(doc => {
        const data = doc.data();
        const title = (data.title || 'Untitled').trim().toLowerCase();

        if (!byTitle[title]) {
            byTitle[title] = [];
        }

        byTitle[title].push({
            id: doc.id,
            title: data.title,
            image: data.image,
            hasRealImage: data.image && !data.image.includes('unsplash.com'),
            sheetRowId: data.sheetRowId,
            createdAt: data.createdAt
        });
    });

    // Find duplicates
    let duplicateGroups = 0;
    let totalDuplicates = 0;

    for (const [title, docs] of Object.entries(byTitle)) {
        if (docs.length > 1) {
            duplicateGroups++;
            totalDuplicates += docs.length - 1;

            console.log(`⚠️ DUPLICATE: "${docs[0].title}" (${docs.length} copies)`);
            docs.forEach((d, i) => {
                console.log(`   ${i + 1}. ID: ${d.id}`);
                console.log(`      Image: ${d.hasRealImage ? '✅ Real' : '❌ Default/None'} - ${(d.image || '').substring(0, 50)}...`);
                console.log(`      SheetRowId: ${d.sheetRowId}`);
            });
            console.log('');
        }
    }

    if (duplicateGroups === 0) {
        console.log('✅ No duplicates found in Updates collection.');
    } else {
        console.log(`\n❌ Found ${duplicateGroups} duplicate groups with ${totalDuplicates} extra items.`);
    }
}

checkDuplicates();
