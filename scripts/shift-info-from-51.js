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

async function shiftInfoFromNumber51() {
    console.log('Fetching all praise songs...');

    const snapshot = await db.collection('gallery')
        .where('type', '==', 'praise')
        .get();

    // Convert to array and sort by number (descending for shifting)
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

    // Sort by number descending (to shift from end first)
    songs.sort((a, b) => b.number - a.number);

    console.log(`Found ${songs.length} praise songs\n`);

    const songN = songs.find(s => s.number === 577);
    if (!songN) { console.log('Song not found!'); return; }
    const songNImage = songN.imageUrl;
    const songNImageUrls = songN.imageUrls;
    const songsToShift = songs.filter(s => s.number >= 577).sort((a, b) => b.number - a.number);

    let batch = db.batch();
    let batchCount = 0;

    // Create a map for quick lookup
    const songsByNumber = {};
    songs.forEach(s => {
        songsByNumber[s.number] = s;
    });

    // Process from highest to lowest to avoid overwriting
    for (let i = 0; i < songsToShift.length; i++) {
        const current = songsToShift[i];

        if (current.number === 577) {
            batch.update(current.ref, { title: '.', code: '', category: '', imageUrl: songNImage, imageUrls: songNImageUrls, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            batchCount++;
        } else {
            // Get info from previous number
            const prevSong = songsByNumber[current.number - 1];
            if (prevSong) {
                console.log(`#${current.number}: Getting info from #${current.number - 1} ("${prevSong.title}")`);
                batch.update(current.ref, {
                    title: prevSong.title,
                    code: prevSong.code || '',
                    category: prevSong.category || '',
                    // Keep current image, only shift info
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                batchCount++;
            }
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

    console.log(`\n✅ Shifted info for ${songsToShift.length} songs`);
    console.log(`Song #577 is now placeholder`);
}

shiftInfoFromNumber51().catch(console.error);
