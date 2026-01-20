/**
 * Update Images Script
 * 
 * Google Sheets에서 imageUrl을 읽어서 Firestore updates 컬렉션의 기존 항목들을 업데이트합니다.
 * 
 * 환경변수 필요:
 * - GOOGLE_SERVICE_ACCOUNT: Google Sheets API 서비스 계정 JSON
 * - FIREBASE_SERVICE_ACCOUNT: Firebase Admin SDK 서비스 계정 JSON
 * - GOOGLE_SHEET_ID: Google Sheets ID
 * 
 * 로컬 실행 (환경변수 설정 필요):
 * node scripts/update-images.js
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// 환경변수에서 설정 읽기 (로컬용 fallback 포함)
let GOOGLE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT, SHEET_ID;

try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } else {
        console.log('⚠️  GOOGLE_SERVICE_ACCOUNT 환경변수가 없습니다.');
        console.log('   GitHub Actions에서 실행하거나 환경변수를 설정하세요.\n');
        process.exit(1);
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // 로컬 fallback
        const localPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(readFileSync(localPath, 'utf8'));
    }

    SHEET_ID = process.env.GOOGLE_SHEET_ID;
    if (!SHEET_ID) {
        console.log('⚠️  GOOGLE_SHEET_ID 환경변수가 없습니다.');
        process.exit(1);
    }
} catch (e) {
    console.error('❌ 설정 로드 실패:', e.message);
    process.exit(1);
}

// Firebase 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
    });
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

async function updateImages() {
    console.log('🖼️ 이미지 업데이트 시작...\n');

    // 1. Google Sheets에서 데이터 읽기
    console.log('📊 Google Sheets에서 데이터 읽는 중...');

    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_SERVICE_ACCOUNT,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'A:E'
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
        console.log('시트에 데이터가 없습니다.');
        return;
    }

    const headers = rows[0];
    console.log(`   헤더: ${headers.join(', ')}`);

    // 시트 데이터를 created_at 기준으로 매핑
    const sheetData = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((header, j) => {
            obj[header] = row[j] || '';
        });

        if (obj.created_at) {
            // imageUrl 우선순위: 시트 컬럼 > payload
            let imageUrl = obj.imageUrl || '';

            if (!imageUrl) {
                try {
                    const payload = JSON.parse(obj.payload || '{}');
                    imageUrl = payload.imageUrl || payload.image || '';
                } catch (e) { }
            }

            if (imageUrl) {
                imageUrl = convertGoogleDriveUrl(imageUrl.trim());
                sheetData[obj.created_at] = imageUrl;
            }
        }
    }

    console.log(`   ${Object.keys(sheetData).length}개 행에 이미지 URL 있음\n`);

    // 2. Firestore updates 컬렉션 업데이트
    console.log('🔄 Firestore updates 컬렉션 업데이트 중...');

    const updatesSnapshot = await db.collection('updates').get();
    let updated = 0;
    let skipped = 0;

    for (const doc of updatesSnapshot.docs) {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (!sheetRowId) {
            skipped++;
            continue;
        }

        // sheetRowId에서 created_at 추출 (sheet_2026-01-19T07:46:47.099Z -> 2026-01-19T07:46:47.099Z)
        // 또는 (sheet_3_2026-01-19T07:46:47.099Z -> 2026-01-19T07:46:47.099Z)
        const createdAtMatch = sheetRowId.match(/sheet_(?:\d+_)?(.+)/);
        const createdAt = createdAtMatch ? createdAtMatch[1] : null;

        if (!createdAt) {
            skipped++;
            continue;
        }

        // 시트에서 해당 이미지 찾기
        const imageUrl = sheetData[createdAt];

        if (imageUrl && imageUrl !== data.image) {
            console.log(`   업데이트: ${data.title}`);
            console.log(`     이전: ${data.image?.substring(0, 50) || '(없음)'}...`);
            console.log(`     새로운: ${imageUrl.substring(0, 50)}...`);

            await db.collection('updates').doc(doc.id).update({
                image: imageUrl
            });
            updated++;
        } else {
            skipped++;
        }
    }

    console.log(`\n✅ 완료!`);
    console.log(`   업데이트: ${updated}개`);
    console.log(`   스킵: ${skipped}개`);
}

updateImages().catch(console.error);
