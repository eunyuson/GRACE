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

async function checkMemos() {
    console.log('🔍 Checking ALL memos in the database...\n');

    // Check memos subcollection under gallery items
    console.log('=== Memos under GALLERY items ===');
    const gallerySnapshot = await db.collection('gallery').get();
    let galleryMemoCount = 0;

    for (const galleryDoc of gallerySnapshot.docs) {
        const memosSnapshot = await db.collection('gallery').doc(galleryDoc.id).collection('memos').get();
        if (!memosSnapshot.empty) {
            console.log(`Gallery "${galleryDoc.data().title}": ${memosSnapshot.size} memos`);
            memosSnapshot.forEach(memoDoc => {
                const memo = memoDoc.data();
                console.log(`   - User: ${memo.userId?.substring(0, 10)}... Text: ${memo.text?.substring(0, 50)}...`);
            });
            galleryMemoCount += memosSnapshot.size;
        }
    }
    console.log(`Total memos under gallery: ${galleryMemoCount}\n`);

    // Check memos subcollection under updates items
    console.log('=== Memos under UPDATES items ===');
    const updatesSnapshot = await db.collection('updates').get();
    let updatesMemoCount = 0;

    for (const updateDoc of updatesSnapshot.docs) {
        const memosSnapshot = await db.collection('updates').doc(updateDoc.id).collection('memos').get();
        if (!memosSnapshot.empty) {
            console.log(`Update "${updateDoc.data().title}": ${memosSnapshot.size} memos`);
            memosSnapshot.forEach(memoDoc => {
                const memo = memoDoc.data();
                console.log(`   - User: ${memo.userId?.substring(0, 10)}... Text: ${memo.text?.substring(0, 50)}...`);
            });
            updatesMemoCount += memosSnapshot.size;
        }
    }
    console.log(`Total memos under updates: ${updatesMemoCount}\n`);

    // Try collection group query
    console.log('=== Collection Group Query Test ===');
    try {
        const collectionGroupSnapshot = await db.collectionGroup('memos').get();
        console.log(`Collection group 'memos' returned: ${collectionGroupSnapshot.size} documents`);

        collectionGroupSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   Path: ${doc.ref.path}`);
            console.log(`   UserId: ${data.userId}, Text: ${data.text?.substring(0, 30)}...`);
        });
    } catch (e) {
        console.error('Collection group query failed:', e.message);
    }
}

checkMemos();
