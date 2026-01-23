
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const keyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
let FIREBASE_SERVICE_ACCOUNT = {};

if (existsSync(keyPath)) {
    FIREBASE_SERVICE_ACCOUNT = JSON.parse(readFileSync(keyPath, 'utf8'));
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
    });
}

const db = admin.firestore();

async function testTrigger() {
    console.log('🧪 Testing for hidden Cloud Functions/Triggers...');
    const testId = `trigger_test_${Date.now()}`;
    const testData = {
        title: 'TRIGGER DEST CONSPIRACY TEST',
        subtitle: 'If this appears in gallery, we have a phantom function.',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'shortcut', // 트리거 조건을 맞추기 위해
        trigger_test: true
    };

    // 1. updates에 추가
    console.log(`1️⃣ Adding test doc to 'updates' collection: ${testId}`);
    await db.collection('updates').doc(testId).set(testData);

    console.log('⏳ Waiting 10 seconds for potential trigger...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 2. gallery 확인
    console.log('2️⃣ Checking gallery for the ghost...');
    const gallerySnapshot = await db.collection('gallery')
        .where('title', '==', 'TRIGGER DEST CONSPIRACY TEST')
        .get();

    if (!gallerySnapshot.empty) {
        console.error('🚨 ALARM: Phantom Cloud Function detected! The document was COPIED to gallery.');
        // Clean up
        const deletePromises = [];
        gallerySnapshot.forEach(doc => {
            console.log(`Deleting ghost doc: ${doc.id}`);
            deletePromises.push(doc.ref.delete());
        });
        await Promise.all(deletePromises);
        console.log('🧹 Cleaned up the ghost from gallery.');
    } else {
        console.log('✅ No ghost detected. Gallery is clean.');
    }

    // Clean up updates
    await db.collection('updates').doc(testId).delete();
    console.log('🧹 Cleaned up test doc from updates.');
}

testTrigger();
