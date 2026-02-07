import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

const serviceAccountPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

if (!existsSync(serviceAccountPath)) {
    console.error('Service account key not found');
    process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function inspectUpdates() {
    console.log('Inspecting Updates Collection...');
    // Limit to 5 to avoid spam
    const snapshot = await db.collection('updates').limit(5).get();

    console.log(`Found ${snapshot.size} items.`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\nID: ${doc.id}`);
        console.log('Keys:', Object.keys(data));
        console.log('Title:', data.title);
        // Check text fields
        console.log('Content Type:', typeof data.content);
        if (typeof data.content === 'object') {
            console.log('Content Object:', JSON.stringify(data.content, null, 2));
        }
        console.log('Desc field:', data.desc ? data.desc.substring(0, 50) : 'undefined');
        console.log('Body field:', data.body ? data.body.substring(0, 50) : 'undefined');

        // Check image fields
        console.log('Images array:', data.images ? `len=${data.images.length}` : 'undefined');
        console.log('Image string:', data.image || 'undefined');
        console.log('AdditionalImages:', data.additionalImages ? `len=${data.additionalImages.length}` : 'undefined');
        console.log('Thumbnail:', data.thumbnail || 'undefined');
    });
}

inspectUpdates().catch(console.error);
