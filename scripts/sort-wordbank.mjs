// One-off maintenance script: sorts each word-array block alphabetically by
// word, in place, without touching anything else in the file (comments,
// imports, surrounding structure). Entries are assumed to be one per line,
// e.g.:  { word: "AT", clue: "..." },
import fs from "node:fs";

function sortArrayBlocks(filePath, arrayNames) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const out = [...lines];

  for (const name of arrayNames) {
    const startPattern = new RegExp(`^export const ${name}: WordEntry\\[\\] = \\[$`);
    const startIdx = out.findIndex((l) => startPattern.test(l));
    if (startIdx === -1) throw new Error(`Could not find array ${name} in ${filePath}`);

    let endIdx = -1;
    for (let i = startIdx + 1; i < out.length; i++) {
      if (/^\];$/.test(out[i])) {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) throw new Error(`Could not find end of array ${name} in ${filePath}`);

    const entryLines = out.slice(startIdx + 1, endIdx);
    const sorted = [...entryLines].sort((a, b) => {
      const wa = (a.match(/word:\s*"([^"]*)"/) || [])[1] || "";
      const wb = (b.match(/word:\s*"([^"]*)"/) || [])[1] || "";
      return wa.localeCompare(wb);
    });

    out.splice(startIdx + 1, entryLines.length, ...sorted);
  }

  fs.writeFileSync(filePath, out.join("\n"));
}

sortArrayBlocks("src/lib/wordbank.ts", ["WORDS_2", "WORDS_3", "WORDS_4", "WORDS_5"]);
sortArrayBlocks("src/lib/wordbankGenerated.ts", ["GENERATED_WORDS_3", "GENERATED_WORDS_4", "GENERATED_WORDS_5"]);
console.log("Sorted word arrays in wordbank.ts and wordbankGenerated.ts");
