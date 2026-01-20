/**
 * Debug Sheet Data Script
 * 
 * Google Sheets에서 읽어온 데이터의 컬럼 구조를 확인합니다.
 * 
 * 실행: node scripts/debug-sheet-data.js
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';

// 서비스 계정 파일 경로
const GOOGLE_SERVICE_ACCOUNT_PATH = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

let googleServiceAccount;
try {
    // Try environment variable first
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        googleServiceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } else {
        // 로컬에서는 Google Cloud 서비스 계정 필요
        // Firebase 서비스 계정과는 다를 수 있음
        console.log('⚠️  환경변수 GOOGLE_SERVICE_ACCOUNT가 없습니다.');
        console.log('   GitHub Actions에서만 실행 가능합니다.\n');

        // 간단한 테스트를 위해 시트의 예상 구조 출력
        console.log('📊 예상 시트 구조:');
        console.log('   A열: created_at');
        console.log('   B열: payload (JSON)');
        console.log('   C열: imageUrl');
        console.log('   D열: source');
        console.log('\n');
        console.log('sync-sheets-to-firestore.js에서 읽는 범위: A:E');
        console.log('imageUrl은 C열에 있어야 합니다.\n');

        console.log('💡 수동으로 확인하려면:');
        console.log('   1. Google Sheets를 열어 imageUrl 열이 어디 있는지 확인');
        console.log('   2. 헤더가 정확히 "imageUrl"인지 확인 (대소문자 포함)');
        console.log('   3. 이미지 URL이 실제로 셀에 있는지 확인\n');

        process.exit(0);
    }
} catch (e) {
    console.error('❌ 서비스 계정 로드 실패:', e.message);
    process.exit(1);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

if (!SHEET_ID) {
    console.error('❌ GOOGLE_SHEET_ID 환경변수가 필요합니다.');
    process.exit(1);
}

async function debugSheetData() {
    console.log('🔍 Google Sheets 데이터 디버그...\n');

    const auth = new google.auth.GoogleAuth({
        credentials: googleServiceAccount,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'A:E'
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
        console.log('시트에 데이터가 없습니다.');
        return;
    }

    console.log('📋 헤더 (첫 번째 행):');
    const headers = rows[0];
    headers.forEach((header, i) => {
        console.log(`   열 ${String.fromCharCode(65 + i)}: "${header}"`);
    });

    console.log(`\n📊 데이터 행 수: ${rows.length - 1}\n`);

    // 처음 5개 행의 imageUrl 확인
    console.log('🖼️ 처음 5개 행의 imageUrl 확인:');
    for (let i = 1; i < Math.min(6, rows.length); i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((header, j) => {
            obj[header] = row[j] || '';
        });

        console.log(`\n행 ${i + 1}:`);
        console.log(`   created_at: ${obj.created_at?.substring(0, 30) || '(없음)'}...`);
        console.log(`   imageUrl: ${obj.imageUrl || '(비어있음)'}`);

        // payload에서 이미지 확인
        try {
            const payload = JSON.parse(obj.payload || '{}');
            console.log(`   payload.imageUrl: ${payload.imageUrl || '(없음)'}`);
            console.log(`   payload.image: ${payload.image || '(없음)'}`);
        } catch (e) {
            console.log('   payload 파싱 실패');
        }
    }
}

debugSheetData().catch(console.error);
