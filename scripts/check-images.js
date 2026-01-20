/**
 * Check images in updates collection
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkImages() {
    const snapshot = await db.collection('updates').get();
    console.log('\n📸 updates 컬렉션 이미지 상태:\n');
    console.log(`총 ${snapshot.size}개 항목\n`);

    let withImage = 0;
    let withDefault = 0;
    let noImage = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const image = data.image || '';
        const isDefault = image.includes('unsplash.com');

        if (!image) {
            noImage++;
            console.log(`❌ ${data.title}: 이미지 없음`);
        } else if (isDefault) {
            withDefault++;
            console.log(`⚠️  ${data.title}: 기본 이미지`);
        } else {
            withImage++;
            console.log(`✅ ${data.title}: ${image.substring(0, 60)}...`);
        }
    });

    console.log(`\n--- 요약 ---`);
    console.log(`✅ 실제 이미지: ${withImage}개`);
    console.log(`⚠️  기본 이미지: ${withDefault}개`);
    console.log(`❌ 이미지 없음: ${noImage}개`);
}

checkImages().catch(console.error);
