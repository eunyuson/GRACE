import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const excelPath = path.join(__dirname, '../worship.xlsx');
const serviceAccountPath = '/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json';

if (!existsSync(serviceAccountPath)) {
    console.error('Service account key not found at:', serviceAccountPath);
    process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function updatePraiseData() {
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Get header row
    const header = rows[0];
    console.log('Header:', header);

    // Header format: ['제목(정리)', '조성(모음)', '번호(모음)', '주제(목차)']
    // Mapping: title = col0, code = col1, number = col2, category = col3

    // Remove header row
    const dataRows = rows.slice(1);
    console.log(`Found ${dataRows.length} rows in Excel.`);

    // Fetch existing praise songs
    console.log('Fetching existing praise songs from Firestore...');
    const praiseSnapshot = await db.collection('gallery')
        .where('type', '==', 'praise')
        .get();

    const existingDocsMap = new Map(); // Map<number, DocumentReference>
    praiseSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.number !== undefined) {
            existingDocsMap.set(Number(data.number), doc.ref);
        }
    });
    console.log(`Found ${existingDocsMap.size} existing praise songs.`);

    let batch = db.batch();
    let operationCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of dataRows) {
        // Excel columns: [제목, 조성, 번호, 주제]
        const title = row[0] ? String(row[0]).trim() : '';
        const code = row[1] ? String(row[1]).trim() : '';
        const number = Number(row[2]);
        const category = row[3] ? String(row[3]).trim() : '';

        if (!number || isNaN(number)) {
            console.warn(`Skipping row with invalid number: ${row}`);
            skippedCount++;
            continue;
        }

        const docData = {
            number: number,
            title: title || `Praise ${number}`,
            code: code,
            category: category,
            type: 'praise',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        let docRef;
        if (existingDocsMap.has(number)) {
            docRef = existingDocsMap.get(number);
            batch.update(docRef, docData);
            updatedCount++;
        } else {
            docRef = db.collection('gallery').doc(); // Auto-ID
            const newDocData = {
                ...docData,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                imageUrl: '', // Initialize empty for new docs
                imageUrls: [],
                lyrics: '',
                youtubeLinks: []
            };
            batch.set(docRef, newDocData);
            createdCount++;
        }

        operationCount++;
        if (operationCount >= 400) { // Limit batch size
            console.log(`Committing batch of ${operationCount} operations...`);
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
        }
    }

    if (operationCount > 0) {
        console.log(`Committing final batch of ${operationCount} operations...`);
        await batch.commit();
    }

    console.log('\nUpdate complete.');
    console.log(`Created: ${createdCount}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
}

updatePraiseData().catch(console.error);
