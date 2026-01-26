
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

async function normalizeTags() {
    console.log('🔧 Normalizing duplicate tags (adding # to missing ones)...');
    const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();

    let updatedCount = 0;

    const targets = ['사회', '가정', '교회'];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const content = data.content || [];
        const tagIndex = content.findIndex(c => c.keyword === 'TAGS');

        if (tagIndex === -1) continue;

        const tagSection = content[tagIndex];
        if (!tagSection.text) continue;

        const tags = tagSection.text.split(',').map(t => t.trim());
        let changed = false;

        const newTags = tags.map(t => {
            // If tag is exactly one of the targets without #, add #
            if (targets.includes(t)) {
                changed = true;
                return '#' + t;
            }
            return t;
        });

        if (changed) {
            console.log(`[${doc.id}] Correcting tags: "${tags.join(', ')}" -> "${newTags.join(', ')}"`);

            content[tagIndex].text = newTags.join(', ');
            await db.collection('updates').doc(doc.id).update({
                content: content
            });
            updatedCount++;
        }
    }

    console.log(`✅ Normalized ${updatedCount} items.`);
}

normalizeTags();
