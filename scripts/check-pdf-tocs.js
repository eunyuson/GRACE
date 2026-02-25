import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkPdfTocs() {
    console.log('Checking pdfTocs collection...\n');

    try {
        // Get all documents in pdfTocs collection
        const snapshot = await db.collection('pdfTocs').get();

        if (snapshot.empty) {
            console.log('❌ No documents found in pdfTocs collection\n');
            console.log('This means no PDF TOCs have been saved to Firestore yet.');
            console.log('You need to:');
            console.log('  1. Open a PDF in the app');
            console.log('  2. Edit the Table of Contents');
            console.log('  3. Click the save button (✓ icon)\n');
            return;
        }

        console.log(`✅ Found ${snapshot.size} document(s) in pdfTocs collection:\n`);

        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Document ID: ${doc.id}`);
            console.log(`  Updated: ${data.updatedAt}`);
            console.log(`  TOC items: ${data.toc ? data.toc.length : 0}`);
            if (data.toc && data.toc.length > 0) {
                console.log('  First few items:');
                data.toc.slice(0, 5).forEach((item, idx) => {
                    console.log(`    ${idx + 1}. ${item.title} (page ${item.page})`);
                });
            }
            console.log('');
        });
    } catch (error) {
        console.error('Error checking pdfTocs:', error);
    }
}

checkPdfTocs().then(() => process.exit(0));
