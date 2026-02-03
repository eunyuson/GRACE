const admin = require('firebase-admin');
const serviceAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCount() {
    try {
        const snapshot = await db.collection('hymns').count().get();
        console.log(`Hymns count: ${snapshot.data().count}`);
    } catch (error) {
        console.error('Error checking count:', error);
    }
}

checkCount();
