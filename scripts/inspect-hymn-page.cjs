const axios = require('axios');
const cheerio = require('cheerio');

async function checkPage(pageNum) {
    const category1 = encodeURIComponent('찬양...악보');
    const category2 = encodeURIComponent('찬송가');
    const url = `https://hoibin.tistory.com/category/${category1}/${category2}?page=${pageNum}`;

    console.log(`Checking ${url}`);

    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);

        console.log('List items count:', $('.list_article li').length); // Tistory standard
        console.log('Post items count:', $('.post_item').length);
        console.log('Link thumb count:', $('.link_thumb').length);

        // Try to grab any large text
        const sampleText = $('h3, .title').map((i, el) => $(el).text().trim()).get().slice(0, 5);
        console.log('Sample titles:', sampleText);
    } catch (e) {
        console.error(e.message);
    }
}

checkPage(82);
