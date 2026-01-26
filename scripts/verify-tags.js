
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

async function checkTags() {
    console.log('🔍 Checking Tags in Updates Collection...');
    const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();

    let allTags = new Set();
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const tagSection = data.content?.find(c => c.keyword === 'TAGS');
        if (tagSection && tagSection.text) {
            const tags = tagSection.text.split(',').map(t => t.trim());
            tags.forEach(t => allTags.add(t));
        }
    });

    console.log('--- Tag Analysis ---');
    Array.from(allTags).forEach(tag => {
        if (tag.includes('#')) {
            console.log(`Tag: "${tag}"`);
            console.log(`   Starts with #: ${tag.startsWith('#')}`);
            console.log(`   Starts with ##: ${tag.startsWith('##')}`);
            console.log(`   Char codes: ${tag.split('').map(c => c.charCodeAt(0)).join(', ')}`);
        }
    });
}

checkTags();
