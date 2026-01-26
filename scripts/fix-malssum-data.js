
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

async function fixMalssumTags() {
    console.log('🔧 Fixing "말씀" tags...');
    const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();

    let updatedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        // find tags content
        const content = data.content || [];
        const tagIndex = content.findIndex(c => c.keyword === 'TAGS');

        if (tagIndex === -1) continue;

        const tagSection = content[tagIndex];
        if (!tagSection.text) continue;

        // Split, process, and join
        const tags = tagSection.text.split(',').map(t => t.trim());
        let changed = false;

        const newTags = tags.map(t => {
            // If tag is exactly '#말씀', change to '##말씀'
            if (t === '#말씀') {
                changed = true;
                return '##말씀';
            }
            return t;
        });

        if (changed) {
            console.log(`[${doc.id}] Updating tags: "${tagSection.text}" -> "${newTags.join(', ')}"`);

            // Update Firestore
            content[tagIndex].text = newTags.join(', ');
            await db.collection('updates').doc(doc.id).update({
                content: content
            });
            updatedCount++;
        }
    }

    console.log(`✅ Fixed ${updatedCount} items.`);
}

fixMalssumTags();
