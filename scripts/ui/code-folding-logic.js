// scripts/ui/code-folding-logic.js

// Regex moved from integrated-code-viewer.js
const FOLDABLE_KEYWORDS_REGEX = /^\s*(?:pub(?:\([^)]*\))?\s*)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?(?:async\s+)?(fn|struct|impl|enum|trait|mod)\b/;

/**
 * Identifies foldable regions in a given code text.
 * This function is designed to be complex and handle various Rust syntax nuances
 * for determining logical code blocks that can be folded.
 * @param {string} codeText The raw Rust code.
 * @returns {Array<Object>} An array of region objects. Each object includes:
 *  - startLine: The starting line number of the foldable region (1-indexed).
 *  - endLine: The ending line number of the foldable region (1-indexed).
 *  - level: The nesting level of the region.
 *  - type: The type of the region (e.g., 'fn', 'struct', 'consolidated_use_block').
 *  - actualBraceLine: For regions defined by braces, the line number of the opening brace.
 *  - isFolded: Boolean indicating if the region should initially be folded.
 *  - count: (For 'consolidated_use_block') The number of original use statements.
 *  - originalLinesDetails: (For 'consolidated_use_block') Details of original use statements.
 */
export function identifyFoldableRegions(codeText) {
    const lines = codeText.split(/\r\n|\r|\n/);
    const regions = [];
    const stack = [];
    let potentialKeywordStart = null;

    let originalUseStatementsDetails = [];

    let inMultiLineComment = false;
    let inString = false;
    let stringChar = null;

    // --- Pass 1: Identify all 'use' statements and their extents ---
    let currentUseBlockLines = [];
    let useBlockStartLine = -1;
    let useBraceLevel = 0;
    let useAttributeLines = 0;

    for (let i = 0; i < lines.length; i++) {
        const lineContent = lines[i];
        const lineNumber = i + 1;
        let trimmedLine = lineContent.trimStart();
        
        let tempInMlComment = inMultiLineComment;
        let tempInString = false; 
        let tempStringChar = null;
        let tempInSlComment = false;
        let useKeywordFoundOnLine = false;
        let isAttributeLine = false;

        if (trimmedLine.startsWith("#[")) { 
            isAttributeLine = true;
        }

        for (let charIdx = 0; charIdx < lineContent.length; charIdx++) {
            const char = lineContent[charIdx];
            const nextChar = lineContent[charIdx + 1];

            if (tempInMlComment) {
                if (char === '*' && nextChar === '/') { tempInMlComment = false; charIdx++; }
                continue;
            }
            if (tempInSlComment) break; 

            if (tempInString) {
                if (char === '\\' && nextChar) { charIdx++; continue; }
                if (char === tempStringChar) tempInString = false;
                continue;
            }

            if (char === '/' && nextChar === '/') { tempInSlComment = true; break; }
            if (char === '/' && nextChar === '*') { tempInMlComment = true; charIdx++; continue; }
            if (char === '"' || char === "'") { tempInString = true; tempStringChar = char; continue; }
            
            if (lineContent.substring(charIdx).startsWith("use ") && 
                (charIdx === 0 || /\s|[(#]/.test(lineContent[charIdx-1]))) {
                useKeywordFoundOnLine = true;
                break; 
            }
        }
        inMultiLineComment = tempInMlComment; 

        if (useKeywordFoundOnLine) {
            if (useBlockStartLine === -1) {
                useBlockStartLine = lineNumber - useAttributeLines; 
            }
            currentUseBlockLines.push(lineContent);
            useAttributeLines = 0; 

            for (const char of lineContent) { 
                if (char === '{') useBraceLevel++;
                if (char === '}') useBraceLevel--;
            }
            if (lineContent.includes(';') && useBraceLevel === 0) {
                originalUseStatementsDetails.push({
                    startLine: useBlockStartLine,
                    endLine: lineNumber,
                });
                currentUseBlockLines = []; useBlockStartLine = -1;
            }
        } else if (isAttributeLine && useBlockStartLine === -1) {
            useAttributeLines++;
            currentUseBlockLines.push(lineContent); 
        } else if (useBlockStartLine !== -1) { 
            currentUseBlockLines.push(lineContent);
            useAttributeLines = 0; 
            for (const char of lineContent) {
                if (char === '{') useBraceLevel++;
                if (char === '}') useBraceLevel--;
            }
            if (lineContent.includes(';') && useBraceLevel === 0) {
                originalUseStatementsDetails.push({
                    startLine: useBlockStartLine,
                    endLine: lineNumber,
                });
                currentUseBlockLines = []; useBlockStartLine = -1;
            } else if (useBraceLevel < 0) { 
                 originalUseStatementsDetails.push({ startLine: useBlockStartLine, endLine: lineNumber});
                 currentUseBlockLines = []; useBlockStartLine = -1; useBraceLevel = 0;
            }
        } else {
            useAttributeLines = 0; 
            if (currentUseBlockLines.length > 0 && useBlockStartLine === -1) {
                currentUseBlockLines = [];
            }
        }
    }
    if (useBlockStartLine !== -1 && currentUseBlockLines.length > 0) { 
        originalUseStatementsDetails.push({
            startLine: useBlockStartLine,
            endLine: lines.length,
        });
    }

    if (originalUseStatementsDetails.length > 0) {
        regions.push({
            startLine: 0, endLine: 0, type: 'consolidated_use_block',
            count: originalUseStatementsDetails.length, 
            isFolded: true, level: -1, 
            originalLinesDetails: originalUseStatementsDetails
        });
    }

    inMultiLineComment = false; 
    inString = false; 
    stringChar = null;
    let inSingleLineCommentThisLine = false; 

    lines.forEach((lineContent, index) => {
        const lineNumber = index + 1;
        inSingleLineCommentThisLine = false; 
        let trimmedLine = lineContent.trimStart();

        let skipThisLineForKeywordParsing = false;
        for(const useDetail of originalUseStatementsDetails) {
            if (lineNumber >= useDetail.startLine && lineNumber <= useDetail.endLine) {
                skipThisLineForKeywordParsing = true;
                break;
            }
        }
        
        let currentLineInMlComment = inMultiLineComment;
        let currentLineInString = inString;
        let currentLineStringChar = stringChar;

        for (let i = 0; i < lineContent.length; i++) {
            const char = lineContent[i]; const nextChar = lineContent[i+1];
            if (currentLineInMlComment) { if (char === '*' && nextChar === '/') { currentLineInMlComment = false; i++; } continue; }
            if (inSingleLineCommentThisLine) break;
            if (currentLineInString) { if (char === '\\' && nextChar) { i++; continue; } if (char === currentLineStringChar) { currentLineInString = false; currentLineStringChar = null; } continue; }
            if (char === '/' && nextChar === '/') { inSingleLineCommentThisLine = true; break; }
            if (char === '/' && nextChar === '*') { currentLineInMlComment = true; i++; continue; }
            if (!skipThisLineForKeywordParsing && (char === '"' || char === "'" || (char === 'r' && (nextChar === '"' || (nextChar === '#' && lineContent[i+2] === '"'))))) {
                currentLineInString = true; currentLineStringChar = '"'; if (char === "'") currentLineStringChar = "'";
                if (char === 'r') { /* simplified raw string handling */ }
                continue;
            }
            if (!skipThisLineForKeywordParsing && !currentLineInMlComment && !currentLineInString && !inSingleLineCommentThisLine) {
                if (char === '{') {
                    let type = 'generic_block'; let startLineForRegion = lineNumber; let keywordForRegion = null;
                    if (potentialKeywordStart) {
                        if (potentialKeywordStart.keywordLine === lineNumber || 
                            ['struct', 'enum', 'impl', 'mod', 'trait'].includes(potentialKeywordStart.keyword) ||
                            (potentialKeywordStart.keyword === 'fn' && !potentialKeywordStart.endsWithSemicolon)) {
                            type = potentialKeywordStart.keyword; 
                            startLineForRegion = potentialKeywordStart.keywordLine;
                            keywordForRegion = potentialKeywordStart.keyword;
                        }
                        potentialKeywordStart = null; 
                    }
                    stack.push({
                        keywordLine: startLineForRegion, keyword: keywordForRegion,
                        level: stack.length, actualBraceLine: lineNumber
                    });
                } else if (char === '}') {
                    if (stack.length > 0) {
                        const openBraceInfo = stack.pop();
                        if (openBraceInfo.keyword && ['fn', 'struct', 'impl', 'enum', 'trait', 'mod'].includes(openBraceInfo.keyword)) {
                            if (lineNumber >= openBraceInfo.actualBraceLine) { 
                                let defaultFoldState = true; 
                                if (['impl', 'mod', 'trait'].includes(openBraceInfo.keyword)) { 
                                    defaultFoldState = false;
                                }
                                regions.push({
                                    startLine: openBraceInfo.keywordLine, endLine: lineNumber,
                                    level: openBraceInfo.level, type: openBraceInfo.keyword,
                                    actualBraceLine: openBraceInfo.actualBraceLine,
                                    isFolded: defaultFoldState
                                });
                            }
                        }
                    }
                }
            }
        }
        inMultiLineComment = currentLineInMlComment; 
        inString = currentLineInString;             
        stringChar = currentLineStringChar;

        if (skipThisLineForKeywordParsing) return; 

        if (!inMultiLineComment && !inString && !inSingleLineCommentThisLine) { 
            const match = trimmedLine.match(FOLDABLE_KEYWORDS_REGEX);
            if (match) {
                let isRealKeyword = true;
                const keywordIndexInOriginal = lineContent.indexOf(match[1]);
                if (keywordIndexInOriginal > -1) { 
                    let tempSl = false, tempMl = false, tempStr = false, tempStrChar = null;
                    for (let k = 0; k < keywordIndexInOriginal; k++) {
                        const c = lineContent[k], nc = lineContent[k+1];
                        if(tempMl) { if(c === '*' && nc === '/') tempMl = false; continue; }
                        if(tempSl) continue;
                        if(tempStr) { if(c === '\\' && nc) k++; else if(c === tempStrChar) tempStr = false; continue; }
                        if(c === '/' && nc === '/') tempSl = true;
                        else if(c === '/' && nc === '*') tempMl = true;
                        else if(c === '"' || c === "'") { tempStr = true; tempStrChar = c; }
                    }
                    if(tempSl || tempMl) isRealKeyword = false;
                }
                if (isRealKeyword) {
                    const endsWithSemicolon = trimmedLine.endsWith(';');
                    if (match[1] === 'fn' && endsWithSemicolon) {
                        potentialKeywordStart = null; 
                    } else {
                        potentialKeywordStart = { 
                            keywordLine: lineNumber, 
                            keyword: match[1],
                            endsWithSemicolon: endsWithSemicolon 
                        };
                    }
                }
            }
        }

        if (potentialKeywordStart && potentialKeywordStart.keywordLine === lineNumber) {
            if (potentialKeywordStart.endsWithSemicolon) { 
                potentialKeywordStart = null;
            } else if (!lineContent.includes('{') && 
                       !['struct', 'enum', 'impl', 'mod', 'trait'].includes(potentialKeywordStart.keyword) &&
                       potentialKeywordStart.keyword === 'fn' && 
                       !trimmedLine.endsWith('->') && !trimmedLine.endsWith(',') &&
                       !trimmedLine.endsWith('(') && !trimmedLine.endsWith('where') &&
                       !trimmedLine.endsWith(')') && !trimmedLine.endsWith('>')) {
                potentialKeywordStart = null;
            }
        }
    });

    regions.sort((a, b) => {
        if (a.startLine !== b.startLine) return a.startLine - b.startLine;
        return b.endLine - a.endLine; // Larger regions (outer) first for same start line
    });
    return regions;
}

// Further breakdown of identifyFoldableRegions can be done here if needed,
// for example, by extracting the 'use' statement parsing logic into its own function,
// and the main keyword/brace matching loop into another.
// For now, the existing structure is kept but moved to this file.