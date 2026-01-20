/**
 * Fix existing image URLs in Firestore
 * 
 * Converts uc?export=view URLs to lh3.googleusercontent.com format
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

// Convert Google Drive URL to lh3.googleusercontent.com format
function convertToLh3Url(url) {
    if (!url) return url;

    // Already in lh3 format
    if (url.includes('lh3.googleusercontent.com')) {
        return url;
    }

    // uc?export=view format
    const ucMatch = url.match(/uc\?export=view&id=([a-zA-Z0-9_-]+)/);
    if (ucMatch && ucMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${ucMatch[1]}`;
    }

    // /file/d/ format
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
    }

    // ?id= format
    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
    }

    return url;
}

async function fixExistingImages() {
    console.log('🔧 Starting to fix existing image URLs...\n');

    const snapshot = await db.collection('updates').get();
    console.log(`Found ${snapshot.size} items in updates collection\n`);

    let updated = 0;
    let skipped = 0;
    let noImage = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const currentImage = data.image || '';

        if (!currentImage) {
            noImage++;
            continue;
        }

        // Skip if already using lh3 or non-Google Drive URL (like unsplash)
        if (currentImage.includes('lh3.googleusercontent.com') ||
            currentImage.includes('unsplash.com') ||
            !currentImage.includes('drive.google.com')) {
            skipped++;
            continue;
        }

        const newImageUrl = convertToLh3Url(currentImage);

        if (newImageUrl !== currentImage) {
            console.log(`📸 Updating: ${data.title}`);
            console.log(`   Old: ${currentImage.substring(0, 60)}...`);
            console.log(`   New: ${newImageUrl}`);

            await db.collection('updates').doc(doc.id).update({
                image: newImageUrl
            });
            updated++;
        }
    }

    console.log('\n--- Summary ---');
    console.log(`✅ Updated: ${updated} items`);
    console.log(`⏭️  Skipped: ${skipped} items (already correct format)`);
    console.log(`❌ No image: ${noImage} items`);
    console.log('\n✨ Done!');
}

fixExistingImages().catch(console.error);
