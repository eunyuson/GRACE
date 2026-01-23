/**
 * Google Sheets에서 이미지 URL을 가져와서 Firestore의 updates 컬렉션 업데이트
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

let GOOGLE_SERVICE_ACCOUNT = {};
let FIREBASE_SERVICE_ACCOUNT = {};

try {
    const googleKeyPath = '/Users/shinik/Downloads/google-service-account.json';
    const firebaseKeyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

    if (existsSync(googleKeyPath)) {
        GOOGLE_SERVICE_ACCOUNT = JSON.parse(readFileSync(googleKeyPath, 'utf8'));
        console.log('✅ Google service account loaded');
    } else {
        console.log('❌ Google service account file not found');
        process.exit(1);
    }

    if (existsSync(firebaseKeyPath)) {
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(readFileSync(firebaseKeyPath, 'utf8'));
        console.log('✅ Firebase service account loaded');
    }
} catch (e) {
    console.error('Failed to load credentials', e);
    process.exit(1);
}

const SHEET_ID = '10JbOBm57VtS8ZjmYUA_xkk8F9RhAElRWKs55Dq0q8ck';

// Firebase 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
    });
}

const db = admin.firestore();

// Helper: Convert Google Drive URL to direct view URL
function convertGoogleDriveUrl(url) {
    if (!url) return url;

    if (url.includes('lh3.googleusercontent.com')) {
        return url;
    }

    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
    }

    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
    }

    const ucMatch = url.match(/uc\?export=view&id=([a-zA-Z0-9_-]+)/);
    if (ucMatch && ucMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${ucMatch[1]}`;
    }

    return url;
}

async function syncImagesFromSheet() {
    console.log('\n🔄 Syncing images from Google Sheets to Firestore...\n');

    // Google Sheets API 초기화
    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_SERVICE_ACCOUNT,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // 시트 데이터 가져오기
    console.log('📊 Fetching data from Google Sheets...');
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Inbox!A:E'
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
        console.log('No data found in sheet');
        return;
    }

    const headers = rows[0];
    console.log('   Headers:', headers);

    const sheetData = rows.slice(1).map((row, index) => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] || '';
        });
        return obj;
    });

    console.log(`   Found ${sheetData.length} rows in sheet\n`);

    // 시트 데이터를 created_at 기준으로 매핑
    const sheetImageMap = {};
    for (const row of sheetData) {
        let imageUrl = '';
        let title = '';

        // 시트의 imageUrl 컬럼 확인
        if (row.imageUrl && row.imageUrl.trim()) {
            imageUrl = row.imageUrl.trim();
        }

        // payload에서 확인
        try {
            const payload = JSON.parse(row.payload || '{}');
            if (!imageUrl) {
                imageUrl = payload.imageUrl || payload.image || '';
                if (Array.isArray(payload.images) && payload.images.length > 0) {
                    imageUrl = payload.images[0];
                }
            }
            title = payload.title || '';
        } catch (e) { }

        if (imageUrl && row.created_at) {
            imageUrl = convertGoogleDriveUrl(imageUrl);
            sheetImageMap[row.created_at] = { imageUrl, title };
        }
    }

    console.log(`📸 Found ${Object.keys(sheetImageMap).length} items with images in sheet\n`);

    // Firestore의 updates 컬렉션 업데이트
    const snapshot = await db.collection('updates').get();
    console.log(`📦 Checking ${snapshot.size} items in Firestore updates collection...\n`);

    let updated = 0;
    let alreadyHasImage = 0;
    let noMatchInSheet = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (!sheetRowId) {
            continue;
        }

        // sheetRowId에서 created_at 추출
        // 형식: sheet_2026-01-20T04:02:39.829Z 또는 sheet_16_2026-01-20T04:02:39.829Z
        const createdAtMatch = sheetRowId.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
        const createdAt = createdAtMatch ? createdAtMatch[1] : null;

        if (!createdAt) {
            continue;
        }

        // 시트에서 이미지 찾기
        const sheetInfo = sheetImageMap[createdAt];

        if (!sheetInfo) {
            noMatchInSheet++;
            continue;
        }

        const currentImage = data.image || '';
        const hasRealImage = currentImage && !currentImage.includes('unsplash.com');

        // 시트에 이미지가 있고, 현재 이미지가 없거나 기본 이미지인 경우 업데이트
        if (sheetInfo.imageUrl && !hasRealImage) {
            console.log(`✅ Updating: ${data.title}`);
            console.log(`   New image: ${sheetInfo.imageUrl.substring(0, 60)}...`);
            await db.collection('updates').doc(doc.id).update({
                image: sheetInfo.imageUrl
            });
            updated++;
        } else if (hasRealImage) {
            alreadyHasImage++;
        }
    }

    console.log(`\n📊 Results:`);
    console.log(`   ✅ Updated with new images: ${updated}`);
    console.log(`   ✓ Already had real image: ${alreadyHasImage}`);
    console.log(`   - No match in sheet: ${noMatchInSheet}`);
}

syncImagesFromSheet().catch(console.error);
