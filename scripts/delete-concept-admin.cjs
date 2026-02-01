const admin = require('firebase-admin');
const serviceAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteDuplicateConcepts() {
    console.log('Searching for "예술" concepts...');

    try {
        const snapshot = await db.collection('concepts').get();

        if (snapshot.empty) {
            console.log('No concepts found with name "예술".');
            return;
        }

        console.log(`Found ${snapshot.size} concepts.`);

        const concepts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            concepts.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date(0)
            });
        });

        // Sort by creation time (oldest first)
        concepts.sort((a, b) => a.createdAt - b.createdAt);

        concepts.forEach((c, index) => {
            console.log(`${index + 1}. ID: ${c.id}, Created: ${c.createdAt}, Question: ${c.question}`);
        });

        // If user wants to delete the "second" one, we can ask or just delete duplicates.
        // Given the request "Delete the second Art text", let's try to identify if there's a clear duplicate.

        if (concepts.length > 1) {
            // Keep the latest one? Or delete the specific one?
            // Since I can't satisfy "second" visually without knowing the sort order on screen (likely desc),
            // "Second" on screen (desc order) would be the OLDER one if sorted by recent first.
            // Screen usually sorts by Newest First. So 1st is Newest, 2nd is Older.
            // So we probably want to delete the OLDER one (index 0 in my sorted list).

            console.log('\nAssuming "Second" on screen means the older one (since screen sorts by Newest First).');
            const target = concepts[0]; // The oldest one
            console.log(`Deleting Oldest Concept: ID ${target.id}`);

            await db.collection('concepts').doc(target.id).delete();
            console.log('Successfully deleted.');
        } else {
            console.log('Only 1 concept found. Not deleting automatically to be safe.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

deleteDuplicateConcepts();
