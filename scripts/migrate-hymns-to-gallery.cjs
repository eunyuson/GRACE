const admin = require('firebase-admin');
const serviceAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
    console.log('Starting migration of hymns to gallery collection...');

    // Read all hymns
    const hymnsSnapshot = await db.collection('hymns').get();
    console.log(`Found ${hymnsSnapshot.size} hymns to migrate.`);

    let count = 0;
    const batchSize = 400; // Write batch limit is 500
    let batch = db.batch();

    for (const doc of hymnsSnapshot.docs) {
        const data = doc.data();

        // Create new ref in gallery
        // Use same ID if possible, or new one. Let's use custom ID "hymn_{number}" to be clean
        const newDocRef = db.collection('gallery').doc(`hymn_${data.number}`);

        batch.set(newDocRef, {
            ...data,
            type: 'hymn',
            migratedAt: admin.firestore.FieldValue.serverTimestamp()
            // IMPORTANT: No 'index' field, so it doesn't show up in main GalleryContext query
        });

        count++;
        if (count % batchSize === 0) {
            await batch.commit();
            console.log(`Committed ${count} hymns...`);
            batch = db.batch();
        }
    }

    if (count % batchSize !== 0) {
        await batch.commit();
    }

    console.log(`Migration complete. Migrated ${count} hymns.`);
}

migrate().catch(console.error);
