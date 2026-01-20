
// Mock normalizedId function
function normalizeId(id) {
    if (!id) return null;
    return id.replace(/^sheet_\d+_/, 'sheet_');
}

// Test cases
const testCases = [
    { input: 'sheet_2_2024-01-01T12:00:00', expected: 'sheet_2024-01-01T12:00:00' },
    { input: 'sheet_2024-01-01T12:00:00', expected: 'sheet_2024-01-01T12:00:00' },
    { input: 'sheet_123_2024-01-01', expected: 'sheet_2024-01-01' },
    { input: 'sheet_10_random_string', expected: 'sheet_random_string' },
    { input: 'sheet_no_index', expected: 'sheet_no_index' }
];

console.log('Running Tests...');
let passed = 0;
testCases.forEach(test => {
    const result = normalizeId(test.input);
    if (result === test.expected) {
        console.log(`✅ [PASS] ${test.input} -> ${result}`);
        passed++;
    } else {
        console.error(`❌ [FAIL] ${test.input} -> Expected: ${test.expected}, Got: ${result}`);
    }
});

if (passed === testCases.length) {
    console.log('All tests passed!');
} else {
    console.log(`Failed ${testCases.length - passed} tests.`);
}
