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
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'ass246429.firebasestorage.app'
    });
}

const db = admin.firestore();

async function checkPraiseImages() {
    console.log('Fetching praise songs...');
    const snapshot = await db.collection('gallery')
        .where('type', '==', 'praise')
        .get();

    console.log(`Found ${snapshot.size} praise songs\n`);

    // Check for gaps in image numbering
    const withImages = [];
    const withoutImages = [];

    snapshot.forEach(doc => {
        const d = doc.data();
        const hasImage = d.imageUrl && d.imageUrl.length > 0;
        const hasImageUrls = d.imageUrls && d.imageUrls.length > 0;

        if (hasImage || hasImageUrls) {
            withImages.push({ number: d.number, title: d.title, id: doc.id });
        } else {
            withoutImages.push({ number: d.number, title: d.title, id: doc.id });
        }
    });

    console.log(`With images: ${withImages.length}`);
    console.log(`Without images: ${withoutImages.length}`);
    console.log('\nFirst 20 without images:');
    withoutImages.slice(0, 20).forEach(p => console.log(`  ${p.number}: ${p.title}`));
}

checkPraiseImages().catch(console.error);
