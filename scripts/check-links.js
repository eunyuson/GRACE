
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

const keyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
if (!existsSync(keyPath)) { console.error('Key not found'); process.exit(1); }

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkLinks() {
    console.log('🔍 Checking updates for externalLinks...');
    const snapshot = await db.collection('updates').get();

    let count = 0;
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.externalLinks && data.externalLinks.length > 0) {
            console.log(`✅ Found links in "${data.title}":`, JSON.stringify(data.externalLinks, null, 2));
            count++;
        }
    });

    if (count === 0) {
        console.log('❌ No externalLinks found in any document.');
    } else {
        console.log(`✨ Found links in ${count} documents.`);
    }
}

checkLinks();
