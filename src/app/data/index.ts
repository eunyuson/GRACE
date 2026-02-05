// Combined hymn data with search and filter functionality
import { hymnData as data1, HymnInfo } from './hymnData';
import { hymnData2 as data2 } from './hymnData2';
import { hymnData3 as data3 } from './hymnData3';

export type { HymnInfo };

// Merge all hymn data
export const allHymnData: HymnInfo[] = [...data1, ...data2, ...data3];

// Get unique categories for tag filtering
export const getAllCategories = (): string[] => {
    const cats = new Set(allHymnData.map(h => h.category));
    return Array.from(cats).filter(c => c && c !== '-').sort();
};

// Search hymns by number, title, code, or category
export const searchHymns = (
    query: string,
    categoryFilter?: string
): HymnInfo[] => {
    let results = allHymnData;

    // Filter by category first
    if (categoryFilter) {
        results = results.filter(h => h.category === categoryFilter);
    }

    // Then filter by search query
    if (!query) return results;

    const q = query.toLowerCase().trim();

    // Check if query is a number (for hymn number search)
    const numQuery = parseInt(q);
    const isNumeric = !isNaN(numQuery) && q === numQuery.toString();

    return results.filter(h => {
        // Number prefix match (progressive)
        if (isNumeric && h.number.toString().startsWith(q)) {
            return true;
        }
        // Title match
        if (h.title.toLowerCase().includes(q)) {
            return true;
        }
        // Code match (exact, case-insensitive)
        if (h.code.toLowerCase() === q) {
            return true;
        }
        // Category match
        if (h.category.toLowerCase().includes(q)) {
            return true;
        }
        return false;
    });
};

// Get hymn info by number
export const getHymnByNumber = (num: number): HymnInfo | undefined => {
    return allHymnData.find(h => h.number === num);
};
