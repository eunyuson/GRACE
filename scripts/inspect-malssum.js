
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

async function inspectMalssum() {
    console.log('🔍 Inspecting items with "말씀" tag...');
    const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();

    let count = 0;
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const tagSection = data.content?.find(c => c.keyword === 'TAGS');
        if (tagSection && tagSection.text) {
            const tags = tagSection.text.split(',').map(t => t.trim());
            const malssumTags = tags.filter(t => t.includes('말씀'));

            if (malssumTags.length > 0) {
                console.log(`[${doc.id}] ${data.title}`);
                console.log(`    Raw Tags: ${JSON.stringify(tags)}`);
                console.log(`    Malssum Tags: ${JSON.stringify(malssumTags)}`);
                count++;
            }
        }
    });
    console.log(`Found ${count} items with "말씀" related tags.`);
}

inspectMalssum();
