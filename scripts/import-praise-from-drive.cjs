/**
 * Import praise sheets from Google Drive folder
 * Files should be named with a leading number: 39.img, 40.jpg, 41.png, etc.
 * Mapping rule: 39 -> Praise #1, 40 -> #2, ... (driveNumber - 38)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');

// Initialize Firebase
const firebaseAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');
admin.initializeApp({
    credential: admin.credential.cert(firebaseAccount)
});
const db = admin.firestore();

// Initialize Google Drive API
const googleAccount = require('/Users/shinik/Downloads/google-service-account.json');

// Google Drive folder ID from the shared URL
const FOLDER_ID = '1-V9cYsY1zQ0OO3Nlcq2h-ETIE1jUOsgN';

// Mapping rule
const DRIVE_START_NUMBER = 39;
const DRIVE_OFFSET = DRIVE_START_NUMBER - 1; // 39 -> 1

const getPraiseTitle = (number) => `찬양곡 ${number}`;

async function main() {
    console.log('🎶 Starting Praise Import from Google Drive...\n');

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

        // Filter for image files and extract drive numbers
        const praiseFiles = allFiles
            .filter(file => file.mimeType && file.mimeType.startsWith('image/'))
            .map(file => {
                const match = file.name.match(/^(\d+)\./);
                if (!match) return null;
                const driveNumber = parseInt(match[1], 10);
                if (driveNumber < DRIVE_START_NUMBER) return null;
                return {
                    id: file.id,
                    name: file.name,
                    driveNumber,
                    number: driveNumber - DRIVE_OFFSET
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.number - b.number);

        console.log(`🖼️  Found ${praiseFiles.length} praise images\n`);
        if (praiseFiles.length > 0) {
            console.log(`   Drive Range: ${praiseFiles[0].driveNumber} ~ ${praiseFiles[praiseFiles.length - 1].driveNumber}`);
            console.log(`   Praise Range: ${praiseFiles[0].number} ~ ${praiseFiles[praiseFiles.length - 1].number}\n`);
        }

        // Check existing praise items
        const existingSnapshot = await db.collection('gallery')
            .where('type', '==', 'praise')
            .get();

        const existingNumbers = new Set();
        existingSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.number) existingNumbers.add(data.number);
        });

        console.log(`📊 Existing praise items in DB: ${existingNumbers.size}`);

        // Filter out already existing praise numbers
        const newPraise = praiseFiles.filter(p => !existingNumbers.has(p.number));
        console.log(`✨ New praise items to add: ${newPraise.length}\n`);

        if (newPraise.length === 0) {
            console.log('✅ All praise items already exist in database!');
            return;
        }

        let added = 0;
        let failed = 0;

        for (const praise of newPraise) {
            try {
                const imageUrl = `https://lh3.googleusercontent.com/d/${praise.id}`;

                await db.collection('gallery').add({
                    type: 'praise',
                    number: praise.number,
                    title: getPraiseTitle(praise.number),
                    imageUrl: imageUrl,
                    lyrics: '',
                    youtubeLinks: [],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: 'google-drive',
                    driveFileId: praise.id,
                    driveFileNumber: praise.driveNumber
                });

                added++;
                process.stdout.write(`\r   Added: ${added}/${newPraise.length} (찬양곡 ${praise.number})`);
            } catch (error) {
                failed++;
                console.error(`\n❌ Error adding praise ${praise.number}: ${error.message}`);
            }
        }

        console.log('\n');
        console.log('='.repeat(50));
        console.log(`✅ Successfully added: ${added} praise items`);
        if (failed > 0) {
            console.log(`❌ Failed: ${failed} items`);
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
