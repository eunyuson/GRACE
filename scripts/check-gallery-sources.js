
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Check if we can run this locally. 
// We need credentials. The user has them in `scripts` usually or env.
// I'll try to use the existing setup from sync-sheets-to-firestore.js or fix-duplicates-and-images.js
// fix-duplicates-and-images.js loads from absolute path. I should try to use env var or that path.
// detailed path: /Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json

const serviceAccountPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
} catch (e) {
    console.error('Failed to load credentials:', e);
    process.exit(1);
}

const db = admin.firestore();

async function checkGallery() {
    console.log('Checking "gallery" collection for shortcut items...');
    const snapshot = await db.collection('gallery').get();
    let shortcutCount = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.source === 'shortcut') {
            console.log(`FOUND SHORTCUT ITEM IN GALLERY: ${doc.id} - ${data.title}`);
            shortcutCount++;
        }
    });

    console.log(`Total items in gallery: ${snapshot.size}`);
    console.log(`Shortcut items in gallery: ${shortcutCount}`);
}

checkGallery();
