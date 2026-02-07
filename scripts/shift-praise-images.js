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

async function shiftPraiseImages() {
    console.log('Fetching all praise songs...');

    const snapshot = await db.collection('gallery')
        .where('type', '==', 'praise')
        .get();

    // Convert to array and sort by number
    const songs = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        songs.push({
            id: doc.id,
            ref: doc.ref,
            number: data.number,
            title: data.title,
            imageUrl: data.imageUrl || '',
            imageUrls: data.imageUrls || []
        });
    });

    songs.sort((a, b) => a.number - b.number);
    console.log(`Found ${songs.length} praise songs\n`);

    // Find songs without images that have images in higher numbered songs
    let shifted = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (let i = 0; i < songs.length; i++) {
        const current = songs[i];
        const hasImage = current.imageUrl && current.imageUrl.length > 0;

        if (!hasImage) {
            // Find next song with image
            let nextWithImage = null;
            let nextIndex = -1;

            for (let j = i + 1; j < songs.length; j++) {
                if (songs[j].imageUrl && songs[j].imageUrl.length > 0) {
                    nextWithImage = songs[j];
                    nextIndex = j;
                    break;
                }
            }

            if (nextWithImage) {
                console.log(`#${current.number} (${current.title}) <- image from #${nextWithImage.number} (${nextWithImage.title})`);

                // Update current song with next song's image
                batch.update(current.ref, {
                    imageUrl: nextWithImage.imageUrl,
                    imageUrls: nextWithImage.imageUrls,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Clear image from next song (it will get filled from the one after it)
                batch.update(nextWithImage.ref, {
                    imageUrl: '',
                    imageUrls: [],
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Update our local array too
                current.imageUrl = nextWithImage.imageUrl;
                current.imageUrls = nextWithImage.imageUrls;
                nextWithImage.imageUrl = '';
                nextWithImage.imageUrls = [];

                shifted++;
                batchCount += 2;

                if (batchCount >= 400) {
                    console.log(`\nCommitting batch of ${batchCount} operations...`);
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
        }
    }

    if (batchCount > 0) {
        console.log(`\nCommitting final batch of ${batchCount} operations...`);
        await batch.commit();
    }

    console.log(`\n✅ Shifted ${shifted} images`);

    // Check remaining songs without images
    const remaining = songs.filter(s => !s.imageUrl || s.imageUrl.length === 0);
    if (remaining.length > 0) {
        console.log(`\n⚠️ ${remaining.length} songs still without images (at the end of the list):`);
        remaining.slice(0, 10).forEach(s => console.log(`  #${s.number}: ${s.title}`));
    }
}

shiftPraiseImages().catch(console.error);
