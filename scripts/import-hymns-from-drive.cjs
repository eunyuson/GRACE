/**
 * Import hymns from Google Drive folder
 * Files should be named: 1.jpg, 2.jpg, 3.jpg, etc.
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const { readFileSync } = require('fs');

// Initialize Firebase
const firebaseAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');
admin.initializeApp({
    credential: admin.credential.cert(firebaseAccount)
});
const db = admin.firestore();

// Initialize Google Drive API
const googleAccount = require('/Users/shinik/Downloads/google-service-account.json');

// Google Drive folder ID from the shared URL
const FOLDER_ID = '1Nq8fF6k_cQ6TwF0dUcHa4bVjVtORqC1W';

// Hymn titles (we'll use the number as title for now, can be updated later)
const getHymnTitle = (number) => `찬송가 ${number}장`;

async function main() {
    console.log('🎵 Starting Hymn Import from Google Drive...\n');

    // Setup Google Auth
    const auth = new google.auth.GoogleAuth({
        credentials: googleAccount,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: client });

    try {
        // List all files in the folder
        console.log('📂 Fetching files from Google Drive folder...');

        let allFiles = [];
        let pageToken = null;

        do {
            const response = await drive.files.list({
                q: `'${FOLDER_ID}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType)',
                pageSize: 1000,
                pageToken: pageToken
            });

            allFiles = allFiles.concat(response.data.files || []);
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        console.log(`📁 Found ${allFiles.length} files\n`);

        if (allFiles.length === 0) {
            console.log('❌ No files found. Make sure the folder is shared with the service account:');
            console.log('   iphoneto@gen-lang-client-0370933898.iam.gserviceaccount.com');
            return;
        }

        // Filter for image files and extract hymn numbers
        const hymnFiles = allFiles
            .filter(file => file.mimeType && file.mimeType.startsWith('image/'))
            .map(file => {
                // Extract number from filename (e.g., "1.jpg" -> 1, "123.png" -> 123)
                const match = file.name.match(/^(\d+)\./);
                if (match) {
                    return {
                        id: file.id,
                        name: file.name,
                        number: parseInt(match[1], 10)
                    };
                }
                return null;
            })
            .filter(f => f !== null)
            .sort((a, b) => a.number - b.number);

        console.log(`🖼️  Found ${hymnFiles.length} hymn images\n`);
        console.log(`   Range: ${hymnFiles[0]?.number} ~ ${hymnFiles[hymnFiles.length - 1]?.number}\n`);

        // Check existing hymns
        const existingSnapshot = await db.collection('gallery')
            .where('type', '==', 'hymn')
            .get();

        const existingNumbers = new Set();
        existingSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.number) existingNumbers.add(data.number);
        });

        console.log(`📊 Existing hymns in DB: ${existingNumbers.size}`);

        // Filter out already existing hymns
        const newHymns = hymnFiles.filter(h => !existingNumbers.has(h.number));
        console.log(`✨ New hymns to add: ${newHymns.length}\n`);

        if (newHymns.length === 0) {
            console.log('✅ All hymns already exist in database!');
            return;
        }

        // Add new hymns to Firestore
        let added = 0;
        let failed = 0;

        for (const hymn of newHymns) {
            try {
                // Create public Google Drive image URL
                // Using lh3.googleusercontent.com format for better accessibility
                const imageUrl = `https://lh3.googleusercontent.com/d/${hymn.id}`;

                await db.collection('gallery').add({
                    type: 'hymn',
                    number: hymn.number,
                    title: getHymnTitle(hymn.number),
                    imageUrl: imageUrl,
                    lyrics: '', // Empty, can be filled later via the edit feature
                    youtubeLinks: [], // Empty, can be added later
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: 'google-drive',
                    driveFileId: hymn.id
                });

                added++;
                process.stdout.write(`\r   Added: ${added}/${newHymns.length} (${hymn.number}장)`);
            } catch (error) {
                failed++;
                console.error(`\n❌ Error adding hymn ${hymn.number}: ${error.message}`);
            }
        }

        console.log('\n');
        console.log('='.repeat(50));
        console.log(`✅ Successfully added: ${added} hymns`);
        if (failed > 0) {
            console.log(`❌ Failed: ${failed} hymns`);
        }
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('not found')) {
            console.log('\n💡 Make sure to share the folder with:');
            console.log('   iphoneto@gen-lang-client-0370933898.iam.gserviceaccount.com');
        }
    }

    process.exit(0);
}

main();
