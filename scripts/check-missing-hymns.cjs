const admin = require('firebase-admin');
const serviceAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkMissing() {
    // Check 'gallery' collection where type == 'hymn'
    const snapshot = await db.collection('gallery').where('type', '==', 'hymn').get();
    const numbers = snapshot.docs.map(d => d.data().number).sort((a, b) => a - b);

    console.log(`Found ${numbers.length} hymns.`);
    console.log('Min:', Math.min(...numbers), 'Max:', Math.max(...numbers));

    // Check specific range around 381
    const before381 = numbers.filter(n => n < 381);
    console.log(`Count before 381: ${before381.length}`);
    if (before381.length > 0) {
        console.log('Some samples before 381:', before381.slice(0, 10));
    } else {
        console.log('No hymns found before 381.');
    }
}

checkMissing();
