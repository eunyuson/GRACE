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
        range: 'Inbox!A:E' // Sheet name: Inbox, columns: created_at, payload, imageUrl, source, debug_info
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

// Helper: Normalize ID to be stable (remove row index if present)
// Converts "sheet_2_2024-01-01" -> "sheet_2024-01-01"
// Keeps "sheet_2024-01-01" as is
function normalizeId(id) {
    if (!id) return null;
    return id.replace(/^sheet_\d+_/, 'sheet_');
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
            // Store normalized ID to compare against new stable IDs
            ids.add(normalizeId(data.sheetRowId));
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
            // Store normalized ID regarding deletions too
            ids.add(normalizeId(data.sheetRowId));
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

// Helper: Convert Google Drive URL to direct view URL
function convertGoogleDriveUrl(url) {
    if (!url) return url;

    // Regular Google Drive File link
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
    }

    // Older format or open?id= format
    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${idParamMatch[1]}`;
    }

    return url;
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

    // Convert Google Drive URL if present
    imageUrl = convertGoogleDriveUrl(imageUrl);

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

    // Use stable ID format (no rowIndex)
    const stableId = `sheet_${row.created_at}`;

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
        sheetRowId: stableId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}

// Helper: Get Sheet Row ID from our stable ID
// Firestore ID: sheet_2024-01-01T12:00:00
// We need to match this with rows in the sheet.
// Since we don't store rowIndex in ID anymore, we must match by created_at.

// Reverse Sync: Delete rows from Google Sheets
async function syncDeletionsToSheets(sheetData) {
    console.log('🗑️ checking for deletions to sync to Sheets...');

    // Get all deleted items that haven't been processed yet? 
    // For now, we get all and match against current sheet data.
    // Ideally we should mark them as 'synced' but to keep it simple and robust (stateless),
    // we just check if the row still exists in the sheet.

    const deletedIds = await getDeletedItemIds();
    if (deletedIds.size === 0) return;

    // Find rows to delete
    // We match by created_at which is the suffix of our ID
    const rowsToDelete = [];

    sheetData.forEach(row => {
        const stableId = `sheet_${row.created_at}`;
        // Also check if deletedId matches normal ID
        if (deletedIds.has(stableId)) {
            rowsToDelete.push(row.rowIndex);
        }
    });

    if (rowsToDelete.length === 0) {
        console.log('✅ No rows to delete from Sheets');
        return;
    }

    console.log(`⚠️ Found ${rowsToDelete.length} rows to delete from Sheets: ${rowsToDelete.join(', ')}`);

    // Sort descending to delete from bottom up (so indices don't shift for remaining targets)
    rowsToDelete.sort((a, b) => b - a);

    const sheets = await getGoogleSheetsClient();

    // Process deletions in batches or one by one. 
    // batchUpdate with deleteDimension is best.

    const requests = rowsToDelete.map(rowIndex => ({
        deleteDimension: {
            range: {
                sheetId: 0, // Assuming first sheet. If not, need to fetch sheetId.
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // API is 0-based
                endIndex: rowIndex
            }
        }
    }));

    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            resource: {
                requests: requests
            }
        });
        console.log('✨ Successfully deleted rows from Google Sheets');
    } catch (error) {
        console.error('❌ Failed to delete rows from Sheets:', error);
        // Don't exit process, continue to sync new items
    }
}

// 기존 항목 이미지 업데이트
async function updateExistingItemImages(sheetData) {
    console.log('🖼️ Updating images for existing items...');

    // 시트 데이터를 created_at 기준으로 매핑
    const sheetImageMap = {};
    for (const row of sheetData) {
        let imageUrl = '';

        // 시트의 imageUrl 컬럼 확인
        if (row.imageUrl && row.imageUrl.trim()) {
            imageUrl = row.imageUrl.trim();
        } else {
            // payload에서 확인
            try {
                const payload = JSON.parse(row.payload || '{}');
                imageUrl = payload.imageUrl || payload.image || '';
            } catch (e) { }
        }

        if (imageUrl && row.created_at) {
            imageUrl = convertGoogleDriveUrl(imageUrl);
            sheetImageMap[row.created_at] = imageUrl;
        }
    }

    // Firestore의 기존 항목 업데이트
    const snapshot = await db.collection('updates')
        .where('source', '==', 'shortcut')
        .get();

    let updated = 0;
    const defaultImage = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb';

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (!sheetRowId) continue;

        // sheetRowId에서 created_at 추출
        const createdAtMatch = sheetRowId.match(/sheet_(?:\d+_)?(.+)/);
        const createdAt = createdAtMatch ? createdAtMatch[1] : null;

        if (!createdAt) continue;

        // 시트에서 이미지 찾기
        const newImageUrl = sheetImageMap[createdAt];

        // 이미지가 없거나 기본 이미지인 경우에만 업데이트
        if (newImageUrl && (!data.image || data.image.includes('unsplash.com'))) {
            console.log(`   📸 Updating image for: ${data.title}`);
            await db.collection('updates').doc(doc.id).update({
                image: newImageUrl
            });
            updated++;
        }
    }

    console.log(`   ✅ Updated ${updated} items with images`);
}

// 메인 동기화 함수
async function syncSheetsToFirestore() {
    console.log('🔄 Starting sync from Google Sheets to Firestore...');

    try {
        // 1. 시트 데이터 가져오기
        const sheetData = await getSheetData();
        console.log(`📊 Found ${sheetData.length} rows in sheet`);

        // 2. Reverse Sync: 먼저 삭제 처리 (행이 밀리기 전에)
        if (sheetData.length > 0) {
            await syncDeletionsToSheets(sheetData);
        }

        // 재조회 (삭제 후 데이터 변경되었을 수 있음)
        // 효율성을 위해 삭제된 행만 제외하거나, 안전하게 다시 읽기
        // 다시 읽는 것이 가장 안전함.
        const freshSheetData = await getSheetData();
        if (freshSheetData.length === 0) {
            console.log('No data to sync');
            return;
        }

        // 3. 이미 동기화된 항목 확인
        const syncedIds = await getSyncedItemIds();
        console.log(`✅ Already synced: ${syncedIds.size} items`);

        // 4. 삭제된 항목 확인 (재동기화 방지)
        const deletedIds = await getDeletedItemIds();

        // 5. 새 항목 필터링
        const newItems = freshSheetData.filter(row => {
            // Generate stable ID for comparison
            const rowId = `sheet_${row.created_at}`;

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

        // 5.5 기존 항목 이미지 업데이트
        await updateExistingItemImages(freshSheetData);

        if (newItems.length === 0) {
            console.log('No new items to sync');
            return;
        }

        // 6. 다음 인덱스 가져오기
        let nextIndex = await getNextIndex();
        console.log(`📍 Starting index: ${nextIndex}`);

        // 7. 새 항목 추가
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

        // 8. 배치 커밋
        await batch.commit();
        console.log(`✨ Successfully added ${addedCount} items to Firestore`);

    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

// 실행
syncSheetsToFirestore();
