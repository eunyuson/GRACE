/**
 * Google Sheets → Firestore 동기화 스크립트
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';

const GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT)
  });
}

const db = admin.firestore();

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_SERVICE_ACCOUNT,
    scopes: ['[https://www.googleapis.com/auth/spreadsheets.readonly'](https://www.googleapis.com/auth/spreadsheets.readonly')]
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function getSheetData() {
  const sheets = await getGoogleSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Inbox!A:D'
  });
  
  const rows = response.data.values;
  if (!rows || rows.length <= 1) return [];
  
  const headers = rows[0];
  return rows.slice(1).map((row, index) => {
    const obj = {};
    headers.forEach((header, i) => { obj[header] = row[i] || ''; });
    obj.rowIndex = index + 2;
    return obj;
  });
}

async function getNextIndex() {
  const snapshot = await db.collection('gallery').orderBy('index', 'desc').limit(1).get();
  if (snapshot.empty) return '01';
  const lastIndex = parseInt(snapshot.docs[0].data().index, 10) || 0;
  return String(lastIndex + 1).padStart(2, '0');
}

function convertToGalleryItem(row, index) {
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch { return null; }
  
  return {
    index,
    title: payload.title || 'Untitled',
    subtitle: payload.summary || '',
    image: '[https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200'](https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200'),
    type: 'image',
    descTitle: payload.title || 'Untitled',
    desc: payload.summary || '',
    content: [{ id: 'main', keyword: 'CONTENT',
