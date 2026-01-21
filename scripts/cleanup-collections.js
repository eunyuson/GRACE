/**
 * 데이터 정리 스크립트
 * 
 * 1. gallery 컬렉션에서 동기화된 항목 삭제 (shortcut source 또는 sheetRowId가 있는 것)
 * 2. updates 컬렉션에서 중복 항목 삭제 (같은 타임스탬프, 다른 row index)
 * 
 * 실행: node scripts/cleanup-collections.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Firebase 서비스 계정 파일 경로 (로컬 실행용)
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    }
} catch (e) {
    console.error('❌ Firebase 서비스 계정 파일을 찾을 수 없습니다.');
    console.error('   경로:', SERVICE_ACCOUNT_PATH);
    process.exit(1);
}

// Firebase 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function cleanupCollections() {
    console.log('🧹 데이터 정리 시작...\n');

    // 1. gallery 컬렉션에서 동기화된 항목 삭제
    console.log('📁 gallery 컬렉션 정리 중...');
    const gallerySnapshot = await db.collection('gallery').get();
    let galleryDeleted = 0;

    for (const doc of gallerySnapshot.docs) {
        const data = doc.data();
        // source가 shortcut이거나 sheetRowId가 있으면 삭제
        if (data.source === 'shortcut' || data.sheetRowId) {
            console.log(`   🗑️ 삭제: ${data.title || '(제목없음)'}`);
            await db.collection('gallery').doc(doc.id).delete();
            galleryDeleted++;
        }
    }
    console.log(`   ✅ gallery에서 ${galleryDeleted}개 항목 삭제\n`);

    // 2. updates 컬렉션에서 중복 항목 삭제
    console.log('📁 updates 컬렉션 중복 제거 중...');
    const updatesSnapshot = await db.collection('updates').get();

    // 타임스탬프 기준으로 그룹화 (row index 제외)
    const timestampGroups = {};

    updatesSnapshot.forEach(doc => {
        const data = doc.data();
        if (!data.sheetRowId) return;

        // sheetRowId에서 타임스탬프만 추출 (row index 제외)
        // sheet_16_2026-01-20T04:02:39.829Z -> 2026-01-20T04:02:39.829Z
        const match = data.sheetRowId.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
        if (!match) return;

        const timestamp = match[1];
        if (!timestampGroups[timestamp]) {
            timestampGroups[timestamp] = [];
        }
        timestampGroups[timestamp].push({
            id: doc.id,
            title: data.title,
            sheetRowId: data.sheetRowId,
            createdAt: data.createdAt
        });
    });

    let updatesDeleted = 0;

    for (const [timestamp, items] of Object.entries(timestampGroups)) {
        if (items.length > 1) {
            console.log(`   📦 중복 발견 (${timestamp}): ${items.length}개`);

            // 첫 번째 항목만 유지, 나머지 삭제
            const toDelete = items.slice(1);
            for (const item of toDelete) {
                console.log(`      🗑️ 삭제: ${item.title} (${item.sheetRowId})`);
                await db.collection('updates').doc(item.id).delete();
                updatesDeleted++;
            }
        }
    }
    console.log(`   ✅ updates에서 ${updatesDeleted}개 중복 항목 삭제\n`);

    console.log('🎉 정리 완료!');
    console.log(`   - gallery: ${galleryDeleted}개 삭제`);
    console.log(`   - updates: ${updatesDeleted}개 중복 삭제`);
}

cleanupCollections().catch(console.error);
