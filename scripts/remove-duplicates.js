/**
 * Remove duplicate items from updates collection
 * 
 * 중복된 sheetRowId를 가진 항목 중 최신 것만 유지
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const firebaseAccount = JSON.parse(readFileSync('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(firebaseAccount) });
}
const db = admin.firestore();

async function removeDuplicates() {
    console.log('🔧 중복 제거 시작...\n');

    const snapshot = await db.collection('updates').get();
    console.log(`총 ${snapshot.size}개 항목 확인\n`);

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

    // 중복 제거 - 가장 최신 것만 유지
    let deletedCount = 0;

    for (const [sheetRowId, docs] of Object.entries(bySheetRowId)) {
        if (docs.length > 1) {
            // createdAt 기준 정렬 (최신 우선)
            docs.sort((a, b) => {
                const timeA = a.createdAt?.toDate?.() || new Date(0);
                const timeB = b.createdAt?.toDate?.() || new Date(0);
                return timeB - timeA;
            });

            console.log(`중복: ${docs[0].data.title} (${docs.length}개 -> 1개 유지)`);

            // 첫 번째(최신) 제외하고 삭제
            for (let i = 1; i < docs.length; i++) {
                await db.collection('updates').doc(docs[i].id).delete();
                deletedCount++;
            }
        }
    }

    console.log(`\n✅ ${deletedCount}개 중복 항목 삭제 완료`);

    // 최종 상태
    const finalSnapshot = await db.collection('updates').get();
    console.log(`\n최종: ${finalSnapshot.size}개 항목`);
}

removeDuplicates().catch(console.error);
