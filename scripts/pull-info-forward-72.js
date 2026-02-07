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

async function pullInfoForward() {
    console.log('Fetching all praise songs...');

    const snapshot = await db.collection('gallery')
        .where('type', '==', 'praise')
        .get();

    const songs = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        songs.push({
            id: doc.id,
            ref: doc.ref,
            number: data.number,
            title: data.title,
            code: data.code || '',
            category: data.category || '',
            imageUrl: data.imageUrl || '',
            imageUrls: data.imageUrls || []
        });
    });

    // Sort by number ascending
    songs.sort((a, b) => a.number - b.number);
    console.log(`Found ${songs.length} praise songs\n`);

    // Create a map for quick lookup
    const songsByNumber = {};
    songs.forEach(s => {
        songsByNumber[s.number] = s;
    });

    // Filter songs >= 460 and sort ascending (to shift from start)
    const songsToShift = songs.filter(s => s.number >= 460).sort((a, b) => a.number - b.number);
    console.log(`Songs to shift (>= 460): ${songsToShift.length}`);

    let batch = db.batch();
    let batchCount = 0;

    // Process from lowest to highest to pull info forward
    for (let i = 0; i < songsToShift.length; i++) {
        const current = songsToShift[i];
        const nextSong = songsByNumber[current.number + 1];

        if (nextSong) {
            console.log(`#${current.number}: Getting info from #${current.number + 1} ("${nextSong.title}")`);
            batch.update(current.ref, {
                title: nextSong.title,
                code: nextSong.code || '',
                category: nextSong.category || '',
                // Keep current image
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            batchCount++;
        } else {
            // Last song - set to placeholder
            console.log(`#${current.number}: No next song, setting to placeholder`);
            batch.update(current.ref, {
                title: '.',
                code: '',
                category: '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            batchCount++;
        }

        if (batchCount >= 400) {
            console.log(`\nCommitting batch of ${batchCount} operations...`);
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        console.log(`\nCommitting final batch of ${batchCount} operations...`);
        await batch.commit();
    }

    console.log(`\n✅ Pulled info forward for ${songsToShift.length} songs starting from #73`);
}

pullInfoForward().catch(console.error);
