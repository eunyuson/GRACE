
function convertGoogleDriveUrl(url) {
    if (!url) return url;

    // Regular Google Drive File link
    // https://drive.google.com/file/d/1-aSMRWuemK_jqAWmfvSACrFckqes3NhQ/view?usp=drivesdk
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
    }

    // Older format or open?id= format
    // https://drive.google.com/open?id=1-aSMRWuemK_jqAWmfvSACrFckqes3NhQ
    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${idParamMatch[1]}`;
    }

    return url;
}

const testCases = [
    {
        input: 'https://drive.google.com/file/d/1-aSMRWuemK_jqAWmfvSACrFckqes3NhQ/view?usp=drivesdk',
        expected: 'https://drive.google.com/uc?export=view&id=1-aSMRWuemK_jqAWmfvSACrFckqes3NhQ'
    },
    {
        input: 'https://drive.google.com/file/d/1yZ4K-W25q2hERS5iKo7OUKn7y2MnLM8I/view?usp=sharing',
        expected: 'https://drive.google.com/uc?export=view&id=1yZ4K-W25q2hERS5iKo7OUKn7y2MnLM8I'
    },
    {
        input: 'https://drive.google.com/open?id=18gGfgMV04Mw6YMTd5KSB36EZcnyPf2qm',
        expected: 'https://drive.google.com/uc?export=view&id=18gGfgMV04Mw6YMTd5KSB36EZcnyPf2qm'
    },
    {
        input: 'https://example.com/image.jpg',
        expected: 'https://example.com/image.jpg'
    },
    {
        input: '',
        expected: ''
    }
];

console.log('Running Drive URL Tests...');
let passed = 0;
testCases.forEach((test, index) => {
    const result = convertGoogleDriveUrl(test.input);
    if (result === test.expected) {
        console.log(`✅ [TEST ${index + 1}] PASS`);
        passed++;
    } else {
        console.error(`❌ [TEST ${index + 1}] FAIL`);
        console.error(`   Input:    ${test.input}`);
        console.error(`   Expected: ${test.expected}`);
        console.error(`   Got:      ${result}`);
    }
});

if (passed === testCases.length) {
    console.log('All tests passed!');
} else {
    process.exit(1);
}
