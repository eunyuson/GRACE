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

async function assignImage() {
    // Get song #53's image
    const snapshot53 = await db.collection('gallery')
        .where('type', '==', 'praise')
        .where('number', '==', 53)
        .get();

    if (snapshot53.empty) {
        console.log('Song #53 not found');
        return;
    }

    const song53 = snapshot53.docs[0].data();
    console.log('Song #53:', song53.title);
    console.log('  imageUrl:', song53.imageUrl?.substring(0, 80) || 'none');
    console.log('  imageUrls:', song53.imageUrls?.length || 0, 'items');

    // Get song #52
    const snapshot52 = await db.collection('gallery')
        .where('type', '==', 'praise')
        .where('number', '==', 52)
        .get();

    if (snapshot52.empty) {
        console.log('Song #52 not found');
        return;
    }

    const song52Doc = snapshot52.docs[0];
    const song52 = song52Doc.data();
    console.log('\nSong #52:', song52.title);
    console.log('  imageUrl:', song52.imageUrl?.substring(0, 80) || 'none');

    // Update song #52 with song #53's image
    await song52Doc.ref.update({
        imageUrl: song53.imageUrl || '',
        imageUrls: song53.imageUrls || [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('\n✅ Updated song #52 with image from #53!');
}

assignImage().catch(console.error);
