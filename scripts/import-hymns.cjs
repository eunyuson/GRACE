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
const CONCURRENCY = 5; // Parallel downloads

// Initialize Firebase Admin
// Note: We assume the default bucket name based on project ID often works, 
// if not invalid, replace with 'ass246429.appspot.com' or check Firebase Console.
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Try standard bucket name patterns
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
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Extract Title & Number
        // Titles are usually like "314장 새찬송가 악보 PPT 가사..."
        const titleRaw = $('meta[property="og:title"]').attr('content') || $('title').text();
        const numberMatch = titleRaw.match(/(\d+)장/);
        const number = numberMatch ? parseInt(numberMatch[1], 10) : null;

        if (!number) {
            console.log(`❌ Could not parse number from title: ${titleRaw}`);
            return null;
        }

        // Extract Image
        // Tistory usually puts the main image in <figure> or .imageblock
        let imageUrl = '';

        // Try standard selectors
        const img = $('.contents_style figure img, .contents_style .imageblock img, .tt_article_useless_p_margin figure img').first();
        if (img.length) {
            imageUrl = img.attr('src');
        }

        // Extract Lyrics
        // Usually in p tags in contents_style
        let lyrics = '';
        $('.contents_style p').each((i, el) => {
            const text = $(el).text().trim();
            if (text && !text.includes('Tistory') && text.length > 10) {
                lyrics += text + '\n';
            }
        });

        // Clean Lyrics
        lyrics = lyrics.replace(/새찬송가 \d+장.*/g, '').trim();

        if (!imageUrl) {
            // Try searching any large image if selector failed
            // Fallback strategy
            return null;
        }

        return {
            number,
            title: titleRaw.replace(/새찬송가악보PPT가사/g, '').trim(),
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
    const listUrl = `https://hoibin.tistory.com/category/찬양...악보/찬송가?page=${pageNum}`;

    try {
        const { data } = await axios.get(listUrl);
        const $ = cheerio.load(data);

        // Find post links
        // Tistory list items usually have a link class or structure
        const links = [];
        $('#content .post-item a, #content .list_content a, .category_list a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('/entry')) {
                links.push(`https://hoibin.tistory.com${href}`);
            }
        });

        // Deduplicate
        const uniqueLinks = [...new Set(links)];
        console.log(`Found ${uniqueLinks.length} posts on page ${pageNum}`);

        for (const link of uniqueLinks) {
            // Check if already exists in DB to skip
            // Note: We rely on checking via title or number after scraping, 
            // but to be faster we'll check number inside scraping or after.
            // Let's scrape first.

            await sleep(500); // Politeness delay
            const hymnData = await scrapeHymnPage(link);

            if (hymnData) {
                // Check DB for existence
                const existing = await db.collection('hymns').where('number', '==', hymnData.number).get();
                if (!existing.empty) {
                    console.log(`⏭️ Hymn ${hymnData.number} already exists. Skipping.`);
                    continue;
                }

                console.log(`📥 Downloading Hymn ${hymnData.number}: ${hymnData.title}`);

                // Download Image
                const imageBuffer = await axios.get(hymnData.sourceImageUrl, { responseType: 'arraybuffer' });
                const fileName = `hymns/${hymnData.number}.jpg`;
                const file = bucket.file(fileName);

                await file.save(imageBuffer.data, {
                    metadata: { contentType: 'image/jpeg' },
                    public: true // Make public
                });

                // Get Public URL
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

                // Save to Firestore
                await db.collection('hymns').add({
                    number: hymnData.number,
                    title: hymnData.title,
                    imageUrl: publicUrl,
                    lyrics: hymnData.lyrics,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    originalUrl: link
                });

                console.log(`✅ Saved Hymn ${hymnData.number}`);
            }
        }

    } catch (e) {
        console.error(`Error processing page ${pageNum}:`, e.message);
    }
}

async function main() {
    console.log('🚀 Starting Hymn Scraper...');

    // Check if bucket is accessible
    try {
        const [exists] = await bucket.exists();
        if (!exists) {
            console.error('❌ Bucket does not exist or permission denied. Check configuration.');
            // Try alternate domain if default fails
            // process.exit(1);
        } else {
            console.log(`Connected to bucket: ${bucket.name}`);
        }
    } catch (e) {
        console.warn('⚠️ Bucket check warning (might still work):', e.message);
    }

    for (let i = START_PAGE; i <= END_PAGE; i++) {
        await processPage(i);
    }

    console.log('🎉 Done!');
}

main();
