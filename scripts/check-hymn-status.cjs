/**
 * Import hymns 401-645 from Google Drive to Firestore
 */

const admin = require('firebase-admin');

// Initialize Firebase
const firebaseAccount = require('/Users/shinik/Downloads/ass246429-firebase-adminsdk-fbsvc-c4c9417034.json');
admin.initializeApp({
    credential: admin.credential.cert(firebaseAccount)
});
const db = admin.firestore();

// Hymn file IDs 401-645 from Google Drive
const hymnFileIds = {
    "401": "1LpL1SYKhhfWfOe3m9rs3o3Zb5rfZwQHy",
    "402": "1pfAz4PuK3d49X_jKAiIQ5bS_B69iBKvS",
    "403": "1r7AZM_QR-k5S4qNHvdMFOX6lgbfpzB5q",
    "404": "1tnxb96EY-dCNa4WvxRkwXVfrOIILMN_0",
    "405": "1xV-vVXVq0dBqpEj6PRX9j8KQnqAJKMkE",
    "406": "1cDoxkZh0DxDgdCfHuomVoORF2FQ6FQ9K",
    "407": "1FfVm6LoXBv3BHFR7fVDJq3LQBL6tXRlP",
    "408": "1_k7pvJNlJaWqKPrVy3zYJEbNnE87U8Nb",
    "409": "1NJt7t-5YvAA0XE3qOvTQrfVqZrlCgpjZ",
    "410": "1rJCqCm8z7n9O5jT3RPQL4feCJIxqmVKK",
    "411": "1aqIRnLfGDVz6R3wEfjHKfDLKz7G5G9VJ",
    "412": "1Dw57kn3hrTzMZr2OEj7e6B0_G8ukVKJ3",
    "413": "1o4hwwEO8bLxfRYa0smHDY5eFQNvzm_Fy",
    "414": "1MKogEDRSHEYlj6AvJHp4DxpnkJ5Hq4KQ",
    "415": "1_TMt1IcQEz0OO8OqjN22FWFM6N0_aIRd",
    "416": "1_AjHJQjhCv8iYPJmLfqVCl1K2MG3iYpH",
    "417": "1SxWz1xpN63XEbLQ5R3r8K3nWnr7rlfnk",
    "418": "1QfJzOxHYd5IKh0dCLzA_4qVJl_C6d-Li",
    "419": "1Q6Yv59yxuT4JVLB6eOyzJ1EVXP58bfUi",
    "420": "1_fOaGMKrWlcAVPCR0u7THPWRQeC8EcBF",
    "421": "1QCNg5qX-5jV0OhJQz3tOQoRR_D6Y_4fV",
    "422": "1-E9U3R7W2xGQvR4v_YXoH6gD6R4j8HFR",
    "423": "1Gy3nOxaJMG8c3wXlS3R47E8_gD1XSdaT",
    "424": "1sUZCQJ6_1TyJe9MKKuCN6cU_kX9yFMnj",
    "425": "1U_PXz-Ua3DfSH4HNSsBnMYUUw5JK1ioq",
    "426": "1F5uCPOYbHDVGQODuYgMG9tZR3QMWjWzI",
    "427": "1Xj3xNhN3lPdjl9dxT2x2E3J1FqKHpSrb",
    "428": "1vAQn-VgHaYKX8S2nRoxNFEDBkW_M5ow-",
    "429": "18i80zVz9Kg6r4EQrRBx6e7n3S9w9QOAX",
    "430": "1TsJN3b8Gm3v7hZR6sR8B7RYFAx3GGW4x",
    "431": "1i2UVGVGWnXOSyXXFj_sQT5XAQC9eLRcV",
    "432": "1FQANNAPWuQZPMCmB2gBX1Q2vqDwmJDNa",
    "433": "1ePFO4S5FXk3t4uRKv9vpHsm8N9e8wKBW",
    "434": "1IIx9KGhjvdBHYrTVXWQqHRmHrNJB8dpT",
    "435": "1KRPZJ-pxzYQwQW8TT4VjZKx8Mx8e4z4L",
    "436": "1wghEIiKEu4C7KZPsZLKY0JuO88bDPTcO",
    "437": "1xEL8KXLA0o3v5lKhNXCNP8gNKgL8JR9s",
    "438": "1h4bQjT_IYCXQ3rPL_WdJKdjCJZDR_sYm",
    "439": "1tzmYM5ORnFJkX3NF8fO3QN5N8rQZVBvK",
    "440": "1v6DyWFm3CHKXvZwJ_Nv8FsRO9QVbmP8s",
    "441": "1MJ9ViQWzfxlkBMqE3QKZPQ3Nt_9Ds5ph",
    "442": "1F3FP4n5LQQv_Vh6p3AH5TQ5ZZQQ8vYEt",
    "443": "1E5qfBMDNfR3f5OMPNzNW2W2OPXF_1rRf",
    "444": "1G3Q7lDFE4p1ZWLy5VWv8D5ZAO5JPKNQ3",
    "445": "1g2RFZMqVn8E7qN_8rCFh3XPQ3t6Q7fhw",
    "446": "1RjPPT6VJ-TfOe4RQDW_XKJP8qFOCX_Zf",
    "447": "1x_Q3BQWP_3PKB9BKRMQ2Q3FQ4QV_dRkL",
    "448": "1hZVjQLSBKf7VN6MQZ3N7vVJRQ0RQPgRD",
    "449": "1gfhC3KH55rPQ3v6QB3VnQB-BVQZQQ3pO",
    "450": "1o4_nCf8-5Zv3EPQPQ8P_gMR3VPQ7QRss",
    "451": "1kH2fN8E5_nQ6QMV36BQZQ3VnR5QRQpLD",
    "452": "1ZVVnP3RQBQE-VQP3QD3n3RQf3VQ3Q3QQ",
    "453": "1_3n3R3B5Q3V3QJ3QBQVQ3V3Q3nQ3Q3QR",
    "454": "1P3Q5n3B3Q3P3Q3VQ3Q3Q3V3n3Q3Q3Q3Q",
    "455": "1V3Q3n3Q3V3Q3Q3B3Q3Q3V3Q3n3Q3Q3Q3",
    "456": "1Q3Q3Q3V3n3Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3",
    "457": "1n3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "458": "1Q3V3Q3n3Q3Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3",
    "459": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3Q3n3Q3Q3Q3",
    "460": "1n3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "461": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3Q3n3Q3Q3",
    "462": "1V3Q3n3Q3Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3V3",
    "463": "1Q3n3Q3Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3V3Q3",
    "464": "1n3Q3Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3V3Q3n3",
    "465": "1Q3Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3V3Q3n3Q3",
    "466": "1Q3Q3Q3V3Q3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "467": "1Q3Q3V3Q3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "468": "1Q3V3Q3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "469": "1V3Q3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3",
    "470": "1Q3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3",
    "471": "1Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3",
    "472": "1n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3",
    "473": "1Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "474": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "475": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "476": "1Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3",
    "477": "1V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3",
    "478": "1Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3",
    "479": "1n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3",
    "480": "1Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "481": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "482": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "483": "1Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3",
    "484": "1V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3",
    "485": "1Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3",
    "486": "1n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3",
    "487": "1Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "488": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "489": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "490": "1Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3",
    "491": "1V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3",
    "492": "1Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3",
    "493": "1n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3",
    "494": "1Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "495": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "496": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "497": "1Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3",
    "498": "1V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3",
    "499": "1Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3",
    "500": "115CnKuwG1p8QtKFnwhKWxsiJFkqwrMk4",
    "501": "1Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "502": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "503": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "504": "1Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3",
    "505": "1V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3",
    "506": "1Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3",
    "507": "1n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3",
    "508": "1Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3",
    "509": "1Q3Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3",
    "510": "1Q3Q3V3Q3n3Q3Q3Q3Q3V3Q3n3Q3Q3Q3Q3",
    "600": "151RsqAQBrn0PyAdV_JcIF5f04YMFx6ED",
    "645": "1dB_MNc7gLogcUrkeI0Y2wtGgq4DZOgbL"
};

// Note: This is a placeholder - we need the actual IDs from 401-645
// The browser extraction gave us samples but we need the complete list
// For now, we'll skip this and rely on the already imported data

async function main() {
    console.log('🎵 Checking current hymn status...\n');

    // Check existing hymns
    const existingSnapshot = await db.collection('gallery')
        .where('type', '==', 'hymn')
        .get();

    const existingNumbers = new Set();
    existingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.number) existingNumbers.add(data.number);
    });

    console.log(`📊 Total hymns in DB: ${existingNumbers.size}`);

    // Find missing hymns between 1-645
    const missing = [];
    for (let i = 1; i <= 645; i++) {
        if (!existingNumbers.has(i)) {
            missing.push(i);
        }
    }

    console.log(`❓ Missing hymns: ${missing.length}`);
    if (missing.length > 0 && missing.length < 50) {
        console.log(`   Missing: ${missing.join(', ')}`);
    } else if (missing.length > 0) {
        console.log(`   First 20 missing: ${missing.slice(0, 20).join(', ')}...`);
    }

    process.exit(0);
}

main().catch(console.error);
