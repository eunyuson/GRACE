const admin = require('firebase-admin');
const serviceAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');
const axios = require('axios');
const cheerio = require('cheerio');
const { getStorage } = require('firebase-admin/storage');

// ==========================================
// CONFIGURATION
// ==========================================
const START_PAGE = 1;
const END_PAGE = 81; // Adjust if needed

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'ass246429.firebasestorage.app'
});

const db = admin.firestore();
const bucket = getStorage().bucket();

// ==========================================
// CRAWLER
// ==========================================

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeHymnPage(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);

        // Extract Title & Number
        const titleRaw = $('meta[property="og:title"]').attr('content') || $('title').text();
        const numberMatch = titleRaw.match(/(\d+)장/);
        const number = numberMatch ? parseInt(numberMatch[1], 10) : null;

        if (!number) {
            return null;
        }

        // Extract Image
        // Selector found by browser inspection: .article_cont img or data-filename
        let imageUrl = '';

        // Iterate images to find the one that looks like a score (usually large or specific filename pattern if possible, but taking first large image in content is safe guess)
        $('.article_cont img').each((i, el) => {
            if (imageUrl) return; // found
            const src = $(el).attr('src');
            // Check if it's a valid Kakaocdn/Tistory image
            if (src && (src.includes('kakaocdn.net') || src.includes('tistory.com'))) {
                imageUrl = src;
            }
        });

        // Extract Lyrics
        let lyrics = '';
        $('.article_cont p').each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5 && !text.includes('Tistory')) {
                lyrics += text + '\n';
            }
        });

        lyrics = lyrics.replace(/새찬송가 \d+장.*/g, '').trim();

        if (!imageUrl) return null;

        return {
            number,
            title: titleRaw.replace(/새찬송가악보PPT가사|ppt|악보|가사/gi, '').trim(),
            sourceImageUrl: imageUrl,
            lyrics
        };

    } catch (e) {
        console.error(`Error scraping ${url}: ${e.message}`);
        return null;
    }
}

async function processPage(pageNum) {
    console.log(`\n📄 Processing List Page ${pageNum}...`);
    // Correct URL found: https://hoibin.tistory.com/category/%EC%B0%AC%EC%96%91...%EC%95%85%EB%B3%B4/%EC%B0%AC%EC%86%A1%EA%B0%80
    const category1 = encodeURIComponent('찬양...악보');
    const category2 = encodeURIComponent('찬송가');
    const listUrl = `https://hoibin.tistory.com/category/${category1}/${category2}?page=${pageNum}`;

    try {
        const { data } = await axios.get(listUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);

        // Find post links using selector found by browser: .list_article .link_thumb
        const links = [];
        $('.list_article .link_thumb').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                links.push(`https://hoibin.tistory.com${href}`);
            }
        });

        const uniqueLinks = [...new Set(links)];
        console.log(`Found ${uniqueLinks.length} posts on page ${pageNum}`);

        for (const link of uniqueLinks) {
            await sleep(1000);
            const hymnData = await scrapeHymnPage(link);

            if (hymnData) {
                // Check DB
                const existing = await db.collection('hymns').where('number', '==', hymnData.number).get();
                if (!existing.empty) {
                    process.stdout.write(`[${hymnData.number} Skip] `);
                    continue;
                }

                console.log(`\n📥 Downloading #${hymnData.number}: ${hymnData.title}`);

                try {
                    const imageBuffer = await axios.get(hymnData.sourceImageUrl, { responseType: 'arraybuffer' });
                    const fileName = `hymns/${hymnData.number}.jpg`;
                    const file = bucket.file(fileName);

                    await file.save(imageBuffer.data, {
                        metadata: { contentType: 'image/jpeg' },
                        public: true
                    });

                    // Use standard public URL
                    // Note: This relies on manual public access or token, but let's try standard format
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

                    await db.collection('hymns').add({
                        number: hymnData.number,
                        title: hymnData.title,
                        imageUrl: publicUrl,
                        lyrics: hymnData.lyrics,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        originalUrl: link
                    });
                } catch (err) {
                    console.error(`Failed to save #${hymnData.number}: ${err.message}`);
                }
            }
        }

    } catch (e) {
        console.error(`Error processing page ${pageNum}:`, e.message);
    }
}

async function main() {
    console.log('🚀 Starting Hymn Scraper (Fixed URL & Selectors)...');

    for (let i = START_PAGE; i <= END_PAGE; i++) {
        await processPage(i);
    }

    console.log('🎉 Done!');
}

main();
