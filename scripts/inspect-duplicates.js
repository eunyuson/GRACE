
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

async function inspectSocietyTag() {
    console.log('🔍 Inspecting items with "사회" tag...');
    const snapshot = await db.collection('updates').where('source', '==', 'shortcut').get();

    let societyCounts = {};

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const tagSection = data.content?.find(c => c.keyword === 'TAGS');
        if (tagSection && tagSection.text) {
            const tags = tagSection.text.split(',').map(t => t.trim());
            const societyTags = tags.filter(t => t.includes('사회') || t.includes('가정') || t.includes('교회'));

            if (societyTags.length > 0) {
                societyTags.forEach(tag => {
                    // Check for invisible characters
                    const charCodes = tag.split('').map(c => c.charCodeAt(0)).join(',');
                    const key = `${tag} (${charCodes})`;
                    societyCounts[key] = (societyCounts[key] || 0) + 1;
                });
            }
        }
    });

    console.log('--- Duplicate Tag Analysis ---');
    console.log(JSON.stringify(societyCounts, null, 2));
}

inspectSocietyTag();
