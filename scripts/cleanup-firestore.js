/**
 * Firestore Cleanup Script
 * 
 * 이 스크립트는 다음을 수행합니다:
 * 1. gallery 컬렉션에서 source: shortcut인 항목들을 삭제
 * 2. updates 컬렉션에서 deletedItems에 있는 항목들을 삭제
 * 
 * 실행: node scripts/cleanup-firestore.js
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

// Normalize ID (remove row index)
function normalizeId(id) {
    if (!id) return null;
    return id.replace(/^sheet_\d+_/, 'sheet_');
}

async function cleanupCollections() {
    console.log('🧹 Firestore 정리 시작...\n');

    // 1. gallery에서 shortcut source 항목 삭제
    console.log('📁 Step 1: gallery 컬렉션에서 동기화된 항목 삭제');
    console.log('-'.repeat(50));

    const gallerySnapshot = await db.collection('gallery').get();
    let galleryDeleted = 0;

    for (const doc of gallerySnapshot.docs) {
        const data = doc.data();
        if (data.source === 'shortcut' || data.sheetRowId) {
            console.log(`   삭제: ${data.title} (${doc.id})`);
            await db.collection('gallery').doc(doc.id).delete();
            galleryDeleted++;
        }
    }
    console.log(`\n✅ gallery에서 ${galleryDeleted}개 항목 삭제 완료\n`);

    // 2. deletedItems 수집
    console.log('📁 Step 2: deletedItems 목록 수집');
    console.log('-'.repeat(50));

    const deletedSnapshot = await db.collection('deletedItems').get();
    const deletedIds = new Set();

    deletedSnapshot.forEach(doc => {
        const sheetRowId = doc.data().sheetRowId;
        if (sheetRowId) {
            deletedIds.add(sheetRowId);
            deletedIds.add(normalizeId(sheetRowId));
        }
    });
    console.log(`   ${deletedIds.size}개의 삭제 ID 수집됨\n`);

    // 3. updates에서 삭제된 항목 제거
    console.log('📁 Step 3: updates 컬렉션에서 삭제된 항목 제거');
    console.log('-'.repeat(50));

    const updatesSnapshot = await db.collection('updates').get();
    let updatesDeleted = 0;

    for (const doc of updatesSnapshot.docs) {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (sheetRowId) {
            const normalizedId = normalizeId(sheetRowId);
            if (deletedIds.has(sheetRowId) || deletedIds.has(normalizedId)) {
                console.log(`   삭제: ${data.title}`);
                await db.collection('updates').doc(doc.id).delete();
                updatesDeleted++;
            }
        }
    }
    console.log(`\n✅ updates에서 ${updatesDeleted}개 항목 삭제 완료\n`);

    // 완료 요약
    console.log('='.repeat(50));
    console.log('🎉 정리 완료!');
    console.log(`   - gallery에서 삭제: ${galleryDeleted}개`);
    console.log(`   - updates에서 삭제: ${updatesDeleted}개`);
    console.log('='.repeat(50));
}

cleanupCollections().catch(console.error);
