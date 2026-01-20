/**
 * Firestore Debug Script
 * 
 * 이 스크립트는 Firestore의 컬렉션들을 검사하여
 * 삭제된 항목이 다시 나타나는 원인을 파악합니다.
 * 
 * 실행: node scripts/debug-firestore.js
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

async function debugCollections() {
    console.log('🔍 Firestore 디버그 시작...\n');
    console.log('='.repeat(60));

    // 1. deletedItems 컬렉션 확인
    console.log('\n📁 deletedItems 컬렉션:');
    console.log('-'.repeat(40));
    const deletedSnapshot = await db.collection('deletedItems').get();

    if (deletedSnapshot.empty) {
        console.log('   (비어있음)');
    } else {
        deletedSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   ID: ${doc.id}`);
            console.log(`   sheetRowId: ${data.sheetRowId}`);
            console.log(`   title: ${data.title}`);
            console.log(`   deletedAt: ${data.deletedAt?.toDate?.() || 'N/A'}`);
            console.log('');
        });
    }
    console.log(`   총 ${deletedSnapshot.size}개 항목\n`);

    // 2. updates 컬렉션 확인 (최근 뉴스)
    console.log('='.repeat(60));
    console.log('\n📁 updates 컬렉션 (최근 뉴스):');
    console.log('-'.repeat(40));
    const updatesSnapshot = await db.collection('updates').get();

    if (updatesSnapshot.empty) {
        console.log('   (비어있음)');
    } else {
        updatesSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   ID: ${doc.id}`);
            console.log(`   title: ${data.title}`);
            console.log(`   sheetRowId: ${data.sheetRowId || '(없음)'}`);
            console.log(`   source: ${data.source || '(없음)'}`);
            console.log(`   image: ${data.image ? '있음' : '없음'}`);
            console.log('');
        });
    }
    console.log(`   총 ${updatesSnapshot.size}개 항목\n`);

    // 3. gallery 컬렉션 확인
    console.log('='.repeat(60));
    console.log('\n📁 gallery 컬렉션 (메인 갤러리):');
    console.log('-'.repeat(40));
    const gallerySnapshot = await db.collection('gallery').get();

    if (gallerySnapshot.empty) {
        console.log('   (비어있음)');
    } else {
        gallerySnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   ID: ${doc.id}`);
            console.log(`   title: ${data.title}`);
            console.log(`   sheetRowId: ${data.sheetRowId || '(없음)'}`);
            console.log(`   source: ${data.source || '(없음)'}`);
            console.log('');
        });
    }
    console.log(`   총 ${gallerySnapshot.size}개 항목\n`);

    // 4. 분석
    console.log('='.repeat(60));
    console.log('\n📊 분석 결과:');
    console.log('-'.repeat(40));

    // gallery에 shortcut source가 있는지 확인
    const galleryWithShortcut = gallerySnapshot.docs.filter(doc =>
        doc.data().source === 'shortcut' || doc.data().sheetRowId
    );

    if (galleryWithShortcut.length > 0) {
        console.log(`\n⚠️  경고: gallery 컬렉션에 동기화된 항목 ${galleryWithShortcut.length}개 발견!`);
        console.log('   이 항목들은 updates에만 있어야 합니다.');
        galleryWithShortcut.forEach(doc => {
            console.log(`   - ${doc.data().title} (${doc.id})`);
        });
    } else {
        console.log('\n✅ gallery 컬렉션에 동기화된 항목 없음 (정상)');
    }

    // deletedItems와 updates 비교
    const deletedIds = new Set();
    deletedSnapshot.forEach(doc => {
        const sheetRowId = doc.data().sheetRowId;
        if (sheetRowId) {
            deletedIds.add(sheetRowId);
            // 정규화된 버전도 추가
            deletedIds.add(sheetRowId.replace(/^sheet_\d+_/, 'sheet_'));
        }
    });

    const stillPresent = updatesSnapshot.docs.filter(doc => {
        const sheetRowId = doc.data().sheetRowId;
        if (!sheetRowId) return false;
        const normalizedId = sheetRowId.replace(/^sheet_\d+_/, 'sheet_');
        return deletedIds.has(sheetRowId) || deletedIds.has(normalizedId);
    });

    if (stillPresent.length > 0) {
        console.log(`\n⚠️  경고: 삭제되었어야 할 항목 ${stillPresent.length}개가 updates에 존재!`);
        stillPresent.forEach(doc => {
            console.log(`   - ${doc.data().title}`);
            console.log(`     sheetRowId: ${doc.data().sheetRowId}`);
        });
    } else {
        console.log('\n✅ 삭제된 항목이 updates에 없음 (정상)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('디버그 완료\n');
}

debugCollections().catch(console.error);
