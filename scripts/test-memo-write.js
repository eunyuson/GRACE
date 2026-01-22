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

async function testMemoWrite() {
    console.log('🧪 Testing memo write to gallery...');

    // Get first gallery item
    const gallerySnapshot = await db.collection('gallery').limit(1).get();
    if (gallerySnapshot.empty) {
        console.log('No gallery items found');
        return;
    }

    const galleryDoc = gallerySnapshot.docs[0];
    console.log(`Found gallery item: ${galleryDoc.id} - ${galleryDoc.data().title}`);

    // Try to write a test memo
    try {
        const memoRef = await db.collection('gallery').doc(galleryDoc.id).collection('memos').add({
            text: 'Test memo from script',
            userId: 'test-user-id',
            userName: 'Test User',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            tags: ['test']
        });
        console.log(`✅ Successfully created memo: ${memoRef.id}`);

        // Clean up
        await memoRef.delete();
        console.log('🧹 Cleaned up test memo');
    } catch (e) {
        console.error('❌ Failed to write memo:', e.message);
    }
}

testMemoWrite();
