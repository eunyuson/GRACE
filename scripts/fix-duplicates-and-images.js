/**
 * Remove duplicate items and update images from sheet
 * 
 * 1. 중복된 sheetRowId를 가진 항목 중 최신 것만 유지
 * 2. 시트에서 이미지 URL을 읽어 업데이트
 */

import admin from 'firebase-admin';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

// 서비스 계정 로드
const firebaseAccount = JSON.parse(readFileSync('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json', 'utf8'));
const googleAccount = JSON.parse(readFileSync('/Users/shinik/Downloads/google-service-account.json', 'utf8'));

const SHEET_ID = '10JbOBm57VtS8ZjmYUA_xkk8F9RhAElRWKs55Dq0q8ck';

// Firebase 초기화
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(firebaseAccount) });
}
const db = admin.firestore();

// Google Drive URL 변환
function convertGoogleDriveUrl(url) {
    if (!url) return url;
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
    }
    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${idParamMatch[1]}`;
    }
    return url;
}

async function fixDuplicatesAndImages() {
    console.log('🔧 중복 제거 및 이미지 업데이트 시작...\n');

    // 1. Google Sheets에서 이미지 데이터 읽기
    console.log('📊 Google Sheets에서 데이터 읽는 중...');

    const auth = new google.auth.GoogleAuth({
        credentials: googleAccount,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Inbox!A:E'
    });

    const rows = response.data.values;
    const headers = rows[0];
    console.log(`   헤더: ${headers.join(', ')}`);

    // 시트 데이터를 created_at 기준으로 이미지 매핑
    const sheetImages = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((h, j) => { obj[h] = row[j] || ''; });

        let imageUrl = obj.imageUrl || '';

        // payload에서도 확인
        if (!imageUrl) {
            try {
                const payload = JSON.parse(obj.payload || '{}');
                imageUrl = payload.imageUrl || payload.image || '';
            } catch (e) { }
        }

        if (imageUrl && obj.created_at) {
            sheetImages[obj.created_at] = convertGoogleDriveUrl(imageUrl.trim());
        }
    }
    console.log(`   ${Object.keys(sheetImages).length}개 행에 이미지 URL 있음\n`);

    // 2. Firestore updates 컬렉션 확인
    console.log('🔍 Firestore updates 컬렉션 분석 중...');
    const snapshot = await db.collection('updates').get();

    // sheetRowId별로 그룹화
    const bySheetRowId = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;
        if (sheetRowId) {
            if (!bySheetRowId[sheetRowId]) {
                bySheetRowId[sheetRowId] = [];
            }
            bySheetRowId[sheetRowId].push({ id: doc.id, data, createdAt: data.createdAt });
        }
    });

    // 3. 중복 제거 - 가장 최신 것만 유지
    console.log('\n🗑️ 중복 항목 제거 중...');
    let deletedCount = 0;

    for (const [sheetRowId, docs] of Object.entries(bySheetRowId)) {
        if (docs.length > 1) {
            // createdAt 기준 정렬 (최신 우선)
            docs.sort((a, b) => {
                const timeA = a.createdAt?.toDate?.() || new Date(0);
                const timeB = b.createdAt?.toDate?.() || new Date(0);
                return timeB - timeA;
            });

            // 첫 번째(최신) 제외하고 삭제
            console.log(`   ${docs[0].data.title}: ${docs.length}개 중복 -> 1개 유지`);
            for (let i = 1; i < docs.length; i++) {
                await db.collection('updates').doc(docs[i].id).delete();
                deletedCount++;
            }
        }
    }
    console.log(`\n✅ ${deletedCount}개 중복 항목 삭제\n`);

    // 4. 이미지 업데이트
    console.log('🖼️ 이미지 업데이트 중...');
    const freshSnapshot = await db.collection('updates').get();
    let updatedCount = 0;

    for (const doc of freshSnapshot.docs) {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (!sheetRowId) continue;

        // sheetRowId에서 created_at 추출
        const match = sheetRowId.match(/sheet_(?:\d+_)?(.+)/);
        const createdAt = match ? match[1] : null;

        if (!createdAt) continue;

        const newImage = sheetImages[createdAt];

        // 이미지가 없거나 다르면 업데이트
        if (newImage && newImage !== data.image) {
            console.log(`   📸 ${data.title}`);
            console.log(`      이전: ${data.image?.substring(0, 50) || '(없음)'}`);
            console.log(`      새로: ${newImage.substring(0, 50)}`);

            await db.collection('updates').doc(doc.id).update({
                image: newImage
            });
            updatedCount++;
        }
    }

    console.log(`\n✅ ${updatedCount}개 항목 이미지 업데이트 완료`);

    // 5. 최종 상태
    console.log('\n--- 최종 상태 ---');
    const finalSnapshot = await db.collection('updates').get();
    let hasImage = 0, noImage = 0;
    finalSnapshot.forEach(doc => {
        if (doc.data().image && !doc.data().image.includes('unsplash.com')) {
            hasImage++;
        } else {
            noImage++;
        }
    });
    console.log(`총 ${finalSnapshot.size}개 항목`);
    console.log(`✅ 이미지 있음: ${hasImage}개`);
    console.log(`❌ 이미지 없음: ${noImage}개`);
}

fixDuplicatesAndImages().catch(console.error);
