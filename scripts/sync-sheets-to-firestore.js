/**
 * Google Sheets → Firestore 동기화 스크립트
 * 
 * 이 스크립트는 GitHub Actions에서 실행되어
 * Google Sheets의 데이터를 Firestore에 갤러리 아이템으로 추가합니다.
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';

// 환경 변수에서 설정 읽기
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Firebase 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
    });
}

const db = admin.firestore();

// Google Sheets API 초기화
async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_SERVICE_ACCOUNT,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

// 시트에서 데이터 읽기
async function getSheetData() {
    const sheets = await getGoogleSheetsClient();

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'A:E' // created_at, payload, imageUrl, source
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
        console.log('No data found in sheet');
        return [];
    }

    // 헤더 제외하고 데이터 파싱
    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] || '';
        });
        obj.rowIndex = index + 2; // 실제 행 번호 (1-based, 헤더 제외)
        return obj;
    });

    return data;
}

// Firestore에서 기존 동기화된 항목 ID 가져오기
async function getSyncedItemIds() {
    const snapshot = await db.collection('updates')
        .where('source', '==', 'shortcut')
        .get();

    const ids = new Set();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.sheetRowId) {
            ids.add(data.sheetRowId);
        }
    });

    return ids;
}

// 삭제된 항목 ID 가져오기 (재동기화 방지용)
async function getDeletedItemIds() {
    const snapshot = await db.collection('deletedItems').get();

    const ids = new Set();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.sheetRowId) {
            ids.add(data.sheetRowId);
        }
    });

    console.log(`🗑️ Already deleted: ${ids.size} items`);
    return ids;
}

// 다음 인덱스 번호 가져오기
async function getNextIndex() {
    const snapshot = await db.collection('updates')
        .orderBy('index', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) {
        return '01';
    }

    const lastItem = snapshot.docs[0].data();
    const lastIndex = parseInt(lastItem.index, 10) || 0;
    return String(lastIndex + 1).padStart(2, '0');
}

// Google Sheets 행을 갤러리 아이템으로 변환
function convertToGalleryItem(row, index) {
    let payload = {};

    try {
        payload = JSON.parse(row.payload || '{}');
    } catch (e) {
        console.error('Failed to parse payload:', row.payload);
        return null;
    }

    // 이미지 URL 우선순위:
    // 1. 시트의 imageUrl 컬럼
    // 2. payload 안의 imageUrl 또는 image
    // 3. 기본 placeholder
    let imageUrl = '';

    // 시트의 imageUrl 컬럼 확인
    if (row.imageUrl && row.imageUrl.trim()) {
        imageUrl = row.imageUrl.trim();
    }
    // payload 안의 imageUrl 확인
    else if (payload.imageUrl && payload.imageUrl.trim()) {
        imageUrl = payload.imageUrl.trim();
    }
    // payload 안의 image 확인
    else if (payload.image && payload.image.trim()) {
        imageUrl = payload.image.trim();
    }

    console.log(`📸 Image URL for "${payload.title}": ${imageUrl || '(none - will use default)'}`);

    const defaultImage = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop';

    // 태그를 키워드로 변환
    const tags = payload.tags || [];
    const content = [
        {
            id: 'main',
            keyword: 'CONTENT',
            text: payload.body || '',
            date: row.created_at || new Date().toISOString()
        }
    ];

    // 태그가 있으면 추가 섹션으로
    if (tags.length > 0) {
        content.push({
            id: 'tags',
            keyword: 'TAGS',
            text: tags.join(', ')
        });
    }

    return {
        index: index,
        title: payload.title || 'Untitled',
        subtitle: payload.summary || '',
        image: imageUrl || defaultImage,
        type: 'image',
        descTitle: payload.title || 'Untitled',
        desc: payload.summary || '',
        content: content,
        // 동기화 메타데이터
        source: 'shortcut',
        sheetRowId: `sheet_${row.rowIndex}_${row.created_at}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}

// 메인 동기화 함수
async function syncSheetsToFirestore() {
    console.log('🔄 Starting sync from Google Sheets to Firestore...');

    try {
        // 1. 시트 데이터 가져오기
        const sheetData = await getSheetData();
        console.log(`📊 Found ${sheetData.length} rows in sheet`);

        if (sheetData.length === 0) {
            console.log('No data to sync');
            return;
        }

        // 2. 이미 동기화된 항목 확인
        const syncedIds = await getSyncedItemIds();
        console.log(`✅ Already synced: ${syncedIds.size} items`);

        // 3. 삭제된 항목 확인 (재동기화 방지)
        const deletedIds = await getDeletedItemIds();

        // 4. 새 항목 필터링 (이미 동기화되었거나 삭제된 항목 제외)
        const newItems = sheetData.filter(row => {
            const rowId = `sheet_${row.rowIndex}_${row.created_at}`;
            if (syncedIds.has(rowId)) {
                return false; // 이미 동기화됨
            }
            if (deletedIds.has(rowId)) {
                console.log(`⏭️ Skipping deleted item: ${rowId}`);
                return false; // 이미 삭제됨
            }
            return true;
        });

        console.log(`🆕 New items to sync: ${newItems.length}`);

        if (newItems.length === 0) {
            console.log('No new items to sync');
            return;
        }

        // 4. 다음 인덱스 가져오기
        let nextIndex = await getNextIndex();
        console.log(`📍 Starting index: ${nextIndex}`);

        // 5. 새 항목 추가
        const batch = db.batch();
        let addedCount = 0;

        for (const row of newItems) {
            const galleryItem = convertToGalleryItem(row, nextIndex);

            if (galleryItem) {
                const docRef = db.collection('updates').doc();
                batch.set(docRef, galleryItem);
                addedCount++;

                // 인덱스 증가
                const currentIndex = parseInt(nextIndex, 10);
                nextIndex = String(currentIndex + 1).padStart(2, '0');
            }
        }

        // 6. 배치 커밋
        await batch.commit();
        console.log(`✨ Successfully added ${addedCount} items to Firestore`);

    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

// 실행
syncSheetsToFirestore();
