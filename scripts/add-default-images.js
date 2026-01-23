/**
 * Add default image to updates that have no image
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

let serviceAccount = {};
try {
    const keyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (existsSync(keyPath)) {
        serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load creds', e);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// 카테고리별 기본 이미지
const defaultImages = [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=800&auto=format&fit=crop', // 글쓰기
    'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop', // 노트
    'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?q=80&w=800&auto=format&fit=crop', // 메모
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=800&auto=format&fit=crop', // 기술
    'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?q=80&w=800&auto=format&fit=crop', // 성경
    'https://images.unsplash.com/photo-1529070538774-1843cb3265df?q=80&w=800&auto=format&fit=crop', // 교회
];

async function addDefaultImages() {
    console.log('🖼️ Adding default images to updates without images...\n');
    const snapshot = await db.collection('updates').get();

    let updated = 0;
    let index = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        // 이미지가 없거나 빈 문자열인 경우에만 업데이트
        if (!data.image || data.image.trim() === '') {
            // 순서대로 기본 이미지 할당 (다양성을 위해)
            const defaultImage = defaultImages[index % defaultImages.length];

            await db.collection('updates').doc(doc.id).update({
                image: defaultImage
            });

            console.log(`✅ Added image to: ${data.title}`);
            updated++;
            index++;
        }
    }

    console.log(`\n🎉 Updated ${updated} items with default images`);
}

addDefaultImages();
