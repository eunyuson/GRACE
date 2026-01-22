/**
 * Google Sheets → Firestore 동기화 스크립트
 * 
 * 이 스크립트는 GitHub Actions에서 실행되어
 * Google Sheets의 데이터를 Firestore에 갤러리 아이템으로 추가합니다.
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';

// 환경 변수 또는 로컬 키 파일 사용
import { readFileSync, existsSync } from 'fs';

let GOOGLE_SERVICE_ACCOUNT = {};
let FIREBASE_SERVICE_ACCOUNT = {};

try {
    const googleKeyPath = '/Users/shinik/Downloads/google-service-account.json';
    const firebaseKeyPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } else if (existsSync(googleKeyPath)) {
        GOOGLE_SERVICE_ACCOUNT = JSON.parse(readFileSync(googleKeyPath, 'utf8'));
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (existsSync(firebaseKeyPath)) {
        FIREBASE_SERVICE_ACCOUNT = JSON.parse(readFileSync(firebaseKeyPath, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load credentials', e);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1y1mJ-t_t-j-r-e-a-d-s-p-r-e-a-d-s-h-e-e-t-i-d'; // Use ENV or placeholder. 
// Note: Requires SHEET_ID env var or hardcoded. I don't see it in env dump. 
// Wait, I don't have SHEET_ID. 
// I should check if it's in the previous versions of the script or user provided it.
// Actually, `sync-sheets-to-firestore.js` line 14: `const SHEET_ID = process.env.GOOGLE_SHEET_ID;`
// If I assume the user ran this before via GH actions, they have it there.
// I don't have it locally unless I find it.
// Checking .github/workflows/sync-sheets.yml might reveal it if it was secret or hardcoded.
// But wait, Step 404 line 41 `spreadsheetId: SHEET_ID`.
// If I don't have SHEET_ID, I CANNOT RUN `sync-sheets-to-firestore.js` locally to fetch fresh data.
// BUT `updateExistingItemImages` (Step 377) REQUIRES `sheetData` which comes from `getSheetData` which needs `SHEET_ID`.
// I MUST FIND SHEET_ID.
// Let's check .github/workflows/sync-sheets.yml.

// Firebase 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
    });
}

const db = admin.firestore();

// Google Sheets API 초기화
async function getGoogleSheetsClient() {
    console.log('🚀 Sync Script Version: 2.0.1 (New ID Format & Source Fix)');

    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_SERVICE_ACCOUNT,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
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

// Helper: Extract timestamp from ID for comparison
// Handles both formats:
// - "sheet_16_2026-01-20T04:02:39.829Z" -> "2026-01-20T04:02:39.829Z"
// - "sheet_2026-01-20T04:02:39.829Z" -> "2026-01-20T04:02:39.829Z"
function normalizeId(id) {
    if (!id) return null;
    // Extract timestamp (ISO 8601 format)
    const match = id.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    return match ? match[1] : id;
}

// Firestore에서 기존 동기화된 항목 ID 및 제목 가져오기
async function getSyncedItemIds() {
    const snapshot = await db.collection('updates')
        .where('source', '==', 'shortcut')
        .get();

    const timestamps = new Set();
    const titles = new Set();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.sheetRowId) {
            // Store normalized ID to compare against new stable IDs
            timestamps.add(normalizeId(data.sheetRowId));
        }
        // Also store title for duplicate detection
        if (data.title) {
            titles.add(data.title.trim().toLowerCase());
        }
    });

    return { timestamps, titles };
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

// Helper: Convert Google Drive URL to direct view URL using lh3.googleusercontent.com
// This format is more reliable and doesn't have CORS issues
function convertGoogleDriveUrl(url) {
    if (!url) return url;

    // Already in lh3 format - return as is
    if (url.includes('lh3.googleusercontent.com')) {
        return url;
    }

    // Regular Google Drive File link: /file/d/FILE_ID/...
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
    }

    // Format: ?id=FILE_ID or &id=FILE_ID
    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
    }

    // Already converted to uc?export=view format - extract ID and convert to lh3
    const ucMatch = url.match(/uc\?export=view&id=([a-zA-Z0-9_-]+)/);
    if (ucMatch && ucMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${ucMatch[1]}`;
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
    // 3. payload 안에 있는 images 배열의 첫 번째
    // 4. body 내의 markdown 이미지 링크 Extract
    let imageUrl = '';

    // 시트의 imageUrl 컬럼 확인
    if (row.imageUrl && row.imageUrl.trim()) {
        imageUrl = row.imageUrl.trim();
    }
    // payload 안의 데이터 확인
    else {
        if (payload.imageUrl && payload.imageUrl.trim()) imageUrl = payload.imageUrl.trim();
        else if (payload.image && payload.image.trim()) imageUrl = payload.image.trim();
        else if (Array.isArray(payload.images) && payload.images.length > 0) imageUrl = payload.images[0];
    }

    // Convert Google Drive URL if present
    imageUrl = convertGoogleDriveUrl(imageUrl);

    // Fallback: Default placeholder if no image found (avoid 'none' logging)
    const defaultImage = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop';

    console.log(`📸 Image for "${payload.title}": ${imageUrl ? 'Found' : 'Not Found (Using Default)'} - Raw: ${imageUrl || '(empty)'}`);

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

        // 시트에 이미지가 있고, 현재 이미지와 다르면 업데이트
        if (newImageUrl && newImageUrl !== data.image) {
            console.log(`   📸 Updating image for: ${data.title}`);
            console.log(`      Old: ${data.image?.substring(0, 60) || '(none)'}...`);
            console.log(`      New: ${newImageUrl.substring(0, 60)}...`);
            await db.collection('updates').doc(doc.id).update({
                image: newImageUrl
            });
            updated++;
        }
    }

    console.log(`   ✅ Updated ${updated} items with images`);
}


// 갤러리 오염 정리 (source: shortcut 삭제)
async function cleanupGalleryPollution() {
    console.log(' Cleaning up gallery pollution...');
    const gallerySnapshot = await db.collection('gallery').where('source', '==', 'shortcut').get();

    if (gallerySnapshot.empty) return;

    const batch = db.batch();
    let count = 0;

    gallerySnapshot.forEach(doc => {
        batch.delete(doc.ref);
        count++;
    });

    if (count > 0) {
        await batch.commit();
        console.log(`✅ Removed ${count} shortcut items from gallery`);
    }
}

// 중복 제거 및 이미지 보존
async function fixDuplicatesAndPreserveImages(sheetData) {
    console.log('🔧 Running deduplication and image preservation...');

    // Create image map from sheet data
    const sheetImages = {};
    for (const row of sheetData) {
        let imageUrl = '';
        if (row.imageUrl && row.imageUrl.trim()) {
            imageUrl = row.imageUrl.trim();
        } else {
            try {
                const payload = JSON.parse(row.payload || '{}');
                imageUrl = payload.imageUrl || payload.image || '';
            } catch (e) { }
        }

        if (imageUrl && row.created_at) {
            sheetImages[row.created_at] = convertGoogleDriveUrl(imageUrl);
        }
    }

    const snapshot = await db.collection('updates').get();

    // Timestamp별로 그룹화 (sheet_ID 형식 변경 대응)
    const byTimestamp = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        const sheetRowId = data.sheetRowId;

        if (sheetRowId) {
            // Extract timestamp using regex to handle both formats:
            // sheet_34_2026... and sheet_2026...
            const match = sheetRowId.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
            const timestamp = match ? match[1] : sheetRowId; // Fallback to full ID if no match

            if (timestamp) {
                if (!byTimestamp[timestamp]) {
                    byTimestamp[timestamp] = [];
                }
                byTimestamp[timestamp].push({ id: doc.id, data, createdAt: data.createdAt });
            }
        }
    });

    let deletedCount = 0;
    let updatedCount = 0;

    for (const [timestamp, docs] of Object.entries(byTimestamp)) {
        if (docs.length > 1) {
            // Sort by createdAt desc
            docs.sort((a, b) => {
                const timeA = a.createdAt?.toDate?.() || new Date(0);
                const timeB = b.createdAt?.toDate?.() || new Date(0);
                return timeB - timeA;
            });

            const survivor = docs[0];
            let survivorHasImage = survivor.data.image && !survivor.data.image.includes('unsplash.com');

            // 1. Try to recover image from duplicates if survivor misses it
            if (!survivorHasImage) {
                for (let i = 1; i < docs.length; i++) {
                    const victim = docs[i];
                    const victimImage = victim.data.image;
                    if (victimImage && !victimImage.includes('unsplash.com')) {
                        console.log(`   ♻️ Recovering image from duplicate for: ${survivor.data.title}`);
                        await db.collection('updates').doc(survivor.id).update({
                            image: victimImage
                        });
                        updatedCount++;
                        survivorHasImage = true;
                        break;
                    }
                }
            }

            // 2. Try to recover from Sheet if still no image
            if (!survivorHasImage) {
                const match = timestamp.match(/sheet_(?:\d+_)?(.+)/); // timestamp itself is the ID-like suffix? No, timestamp is just date-string? 
                // Wait, byTimestamp keys ARE the timestamps (e.g. 2026-01-21...). 
                // So we can look up directly in sheetImages.

                if (timestamp && sheetImages[timestamp]) {
                    const sheetImg = sheetImages[timestamp];
                    if (sheetImg) {
                        console.log(`   ✨ Restoring image from Sheet for: ${survivor.data.title}`);
                        await db.collection('updates').doc(survivor.id).update({ image: sheetImg });
                        updatedCount++;
                    }
                }
            }

            // Delete duplicates
            for (let i = 1; i < docs.length; i++) {
                await db.collection('updates').doc(docs[i].id).delete();
                deletedCount++;
            }
        }
    }
    console.log(`✅ Deduplication complete: ${deletedCount} deleted, ${updatedCount} images restored`);
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

        // 3. 이미 동기화된 항목 확인 (타임스탬프 + 제목)
        const { timestamps: syncedTimestamps, titles: syncedTitles } = await getSyncedItemIds();
        console.log(`✅ Already synced: ${syncedTimestamps.size} items by timestamp, ${syncedTitles.size} titles`);

        // 4. 삭제된 항목 확인 (재동기화 방지)
        const deletedIds = await getDeletedItemIds();

        // 5. 새 항목 필터링 (타임스탬프 + 제목으로 비교)
        const newItems = freshSheetData.filter(row => {
            // Extract timestamp for comparison (same as normalizeId)
            const timestamp = row.created_at;
            const title = row.title?.trim().toLowerCase() || '';

            if (syncedTimestamps.has(timestamp)) {
                return false; // 이미 동기화됨 (타임스탬프 매칭)
            }
            if (title && syncedTitles.has(title)) {
                console.log(`⏭️ Skipping duplicate title: ${row.title}`);
                return false; // 이미 동기화됨 (제목 매칭)
            }
            if (deletedIds.has(timestamp)) {
                console.log(`⏭️ Skipping deleted item: ${timestamp}`);
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

        // 9. 정리 및 중복 제거 실행
        await cleanupGalleryPollution();
        await fixDuplicatesAndPreserveImages(freshSheetData);


    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

// 실행
syncSheetsToFirestore();
