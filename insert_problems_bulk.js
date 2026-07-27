import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const data = {
  "Opposite End Pointers": [
    "26. Remove Duplicates from Sorted Array",
    "27. Remove Element",
    "88. Merge Sorted Array",
    "125. Valid Palindrome",
    "344. Reverse String",
    "345. Reverse Vowels of a String",
    "680. Valid Palindrome II",
    "167. Two Sum II - Input Array Is Sorted",
    "11. Container With Most Water",
    "16. 3Sum Closest",
    "15. 3Sum",
    "42. Trapping Rain Water"
  ],
  "Group Transitions": [
    "1047. Remove All Adjacent Duplicates In String",
    "1209. Remove All Adjacent Duplicates in String II"
  ],
  "Merge Style": [
    "283. Move Zeroes",
    "633. Sum of Square Numbers",
    "88. Merge Sorted Array II (in-place backward)",
    "977. Squares of a Sorted Array",
    "524. Longest Word in Dictionary through Deleting",
    "1855. Maximum Distance Between a Pair of Values"
  ],
  "In Place Manipulation": [
    "1089. Duplicate Zeros",
    "283. Move Zeroes",
    "26. Remove Duplicates from Sorted Array",
    "1299. Replace Elements with Greatest Element on Right Side",
    "443. String Compression"
  ],
  "Dutch National Flag Algorithm": [
    "75. Sort Colors",
    "905. Sort Array by Parity",
    "922. Sort Array By Parity II",
    "2161. Partition Array According to Given Pivot",
    "324. Wiggle Sort II"
  ],
  "Monotonic \\ Directional Array Patterns": [
    "896. Monotonic Array",
    "941. Valid Mountain Array",
    "162. Find Peak Element",
    "376. Wiggle Subsequence",
    "26. Remove Duplicates from Sorted Array",
    "392. Is Subsequence",
    "674. Longest Continuous Increasing Subsequence",
    "1752. Check if Array Is Sorted and Rotated"
  ],
  "String Simulation\\ Reverse Engineering": [
    "779. K-th Symbol in Grammar",
    "3307. Find the K-th Character in String Game II",
    "3614. Process String with Special Operations II",
    "880. Decoded String at Index"
  ]
};

function generateSlug(title) {
  let cleanTitle = title.replace(/^\d+\.\s*/, '');
  cleanTitle = cleanTitle.replace(/\s*\(.*\)/, '');
  return cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  try {
    console.log("Fetching existing slugs...");
    const existingRes = await pool.query('SELECT slug FROM dsa_problems');
    const existingSlugs = new Set(existingRes.rows.map(r => r.slug));
    console.log(`Fetched ${existingSlugs.size} existing slugs.`);

    const patternMap = {
      "Opposite End Pointers": 1,
      "Group Transitions": 3,
      "Merge Style": 5,
      "In Place Manipulation": 6,
      "Dutch National Flag Algorithm": 7,
      "Monotonic \\ Directional Array Patterns": 8,
      "String Simulation\\ Reverse Engineering": 67
    };

    const rowsToInsert = [];
    
    for (const [patternName, problems] of Object.entries(data)) {
      const patternId = patternMap[patternName];
      if (!patternId) {
        console.error("Pattern ID not found for", patternName);
        continue;
      }

      for (const title of problems) {
        let baseSlug = generateSlug(title);
        let slug = baseSlug;
        let counter = 1;

        while (existingSlugs.has(slug)) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        existingSlugs.add(slug);

        const problemLink = `https://leetcode.com/problems/${baseSlug}/`;
        rowsToInsert.push([patternId, title, problemLink, slug]);
      }
    }

    if (rowsToInsert.length === 0) {
      console.log("No rows to insert.");
      return;
    }

    console.log(`Preparing to insert ${rowsToInsert.length} problems...`);
    
    let queryText = 'INSERT INTO dsa_problems (pattern_id, title, problem_link, slug) VALUES ';
    let values = [];
    let placeholders = [];
    
    for (let i = 0; i < rowsToInsert.length; i++) {
      const offset = i * 4;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      values.push(...rowsToInsert[i]);
    }
    
    queryText += placeholders.join(', ');
    
    const insertRes = await pool.query(queryText, values);
    console.log(`Successfully inserted ${insertRes.rowCount} problems.`);
    
  } catch (err) {
    console.error("Error inserting problems:", err);
  } finally {
    await pool.end();
  }
}

main();
