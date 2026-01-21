import admin from 'firebase-admin';

// 환경 변수 또는 로컬 키 파일 사용
let FIREBASE_SERVICE_ACCOUNT;
try {
    // Try local file first for manual execution
    // Using import.meta.url to find relative path if needed, or just absolute/relative
    // Assuming running from root
    const fs = await import('fs');
    const path = await import('path');
    const keyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json'; // Common location
    if (fs.existsSync(keyPath)) {
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    } else {
        // Fallback to env or try another path
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    }
} catch (e) {
    console.error('Failed to load credentials', e);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
    });
}

const db = admin.firestore();

async function fixMissingSource() {
    console.log('🔍 Checking for items with sheetRowId but missing source...');

    // Check updates
    const updatesSnapshot = await db.collection('updates').get();
    let updatesFixed = 0;
    const batch = db.batch();

    updatesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.sheetRowId && (!data.source || data.source !== 'shortcut')) {
            console.log(`updates: Fixing source for ${data.title} (${doc.id})`);
            batch.update(doc.ref, { source: 'shortcut' });
            updatesFixed++;
        }
    });

    // Check gallery pollution
    const gallerySnapshot = await db.collection('gallery').get();
    let galleryFixed = 0;

    gallerySnapshot.forEach(doc => {
        const data = doc.data();
        // gallery item from sheet usually has sheetRowId OR source='shortcut'
        // If it has sheetRowId, it shouldn't be in gallery (unless promoted manually, but user wants them gone)
        if (data.sheetRowId) {
            console.log(`gallery: Tagging pollution for ${data.title} (${doc.id})`);
            batch.update(doc.ref, { source: 'shortcut' });
            galleryFixed++;
        }
    });

    if (updatesFixed > 0 || galleryFixed > 0) {
        await batch.commit();
        console.log(`✅ Fixed source for ${updatesFixed} updates and ${galleryFixed} gallery items.`);
    } else {
        console.log('✅ No items needed fixing.');
    }
}

fixMissingSource().catch(console.error);
