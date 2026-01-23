/**
 * Check images status in updates collection
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

async function checkUpdatesImages() {
    console.log('🔍 Checking Updates Collection Images...\n');
    const snapshot = await db.collection('updates').get();

    console.log(`Total Updates Items: ${snapshot.size}\n`);

    const defaultImage = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb';

    let withImage = 0;
    let withDefaultImage = 0;
    let withoutImage = 0;

    const itemsWithoutImage = [];
    const itemsWithDefaultImage = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const image = data.image || '';

        if (!image) {
            withoutImage++;
            itemsWithoutImage.push({ id: doc.id, title: data.title });
        } else if (image.includes('unsplash.com')) {
            withDefaultImage++;
            itemsWithDefaultImage.push({ id: doc.id, title: data.title, image: image.substring(0, 50) + '...' });
        } else {
            withImage++;
        }
    });

    console.log(`✅ With real image: ${withImage}`);
    console.log(`⚠️ With default (unsplash) image: ${withDefaultImage}`);
    console.log(`❌ Without any image: ${withoutImage}`);

    if (itemsWithDefaultImage.length > 0) {
        console.log('\n📋 Items with DEFAULT image:');
        itemsWithDefaultImage.forEach(item => {
            console.log(`   - ${item.title}`);
        });
    }

    if (itemsWithoutImage.length > 0) {
        console.log('\n📋 Items WITHOUT any image:');
        itemsWithoutImage.forEach(item => {
            console.log(`   - ${item.title}`);
        });
    }
}

checkUpdatesImages();
