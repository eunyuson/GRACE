/**
 * Add missing hymn 588 to Firestore
 */

const admin = require('firebase-admin');

// Initialize Firebase
const firebaseAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');
admin.initializeApp({
    credential: admin.credential.cert(firebaseAccount)
});
const db = admin.firestore();

async function main() {
    const hymnNumber = 588;
    const fileId = '16p5p2ugP5_Duz8cTcY0oSRPtlfpdxsV0';

    console.log(`🎵 Adding hymn ${hymnNumber}...`);

    // Check if already exists
    const existing = await db.collection('gallery')
        .where('type', '==', 'hymn')
        .where('number', '==', hymnNumber)
        .get();

    if (!existing.empty) {
        console.log(`⏭️  Hymn ${hymnNumber} already exists, skipping.`);
        process.exit(0);
    }

    const imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

    await db.collection('gallery').add({
        type: 'hymn',
        number: hymnNumber,
        title: `찬송가 ${hymnNumber}장`,
        imageUrl: imageUrl,
        lyrics: '',
        youtubeLinks: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'google-drive',
        driveFileId: fileId
    });

    console.log(`✅ Successfully added hymn ${hymnNumber}!`);

    // Verify total count
    const total = await db.collection('gallery')
        .where('type', '==', 'hymn')
        .get();

    console.log(`📊 Total hymns in DB: ${total.size}`);

    process.exit(0);
}

main().catch(console.error);
