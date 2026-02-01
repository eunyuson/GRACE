const admin = require('firebase-admin');
const serviceAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function restoreStress() {
    console.log('Restoring Stress Card...');

    // Get a sample card to copy userId
    const sample = await db.collection('concepts').limit(1).get();
    let userId = 'unknown';
    let userName = 'unknown';
    if (!sample.empty) {
        userId = sample.docs[0].data().userId;
        userName = sample.docs[0].data().userName;
    }

    try {
        await db.collection('concepts').add({
            conceptName: '스트레스',
            question: '스트레스는 어떻게 푸는가?',
            conceptPhrase: '', // Don't know this
            type: 'concept',
            userId: userId,
            userName: userName,
            createdAt: new Date('Sat Jan 31 2026 01:35:44 GMT-0600'), // Original time
            updatedAt: new Date()
        });
        console.log('Successfully restored Stress card.');
    } catch (error) {
        console.error('Error:', error);
    }
}

restoreStress();
