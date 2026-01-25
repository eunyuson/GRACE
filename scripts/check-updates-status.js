
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

async function checkUpdates() {
    console.log('🔍 Checking Updates Collection...');
    const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();

    console.log(`Found ${snapshot.size} shortcut items in Updates collection.`);

    if (snapshot.size > 0) {
        const first = snapshot.docs[0].data();
        console.log(`Sample: [${snapshot.docs[0].id}] ${first.title}`);
    }
}

checkUpdates();
