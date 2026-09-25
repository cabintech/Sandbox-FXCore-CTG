import { SourceContext } from './SourceContext.js';
import { Stmt } from './Stmt.js';
import { Macro } from './Macro.js';
import { SyntaxException } from './SyntaxException.js';
import { Util } from './Util.js';
import { FXCoreMP } from './FXCoreMP.js';

export class MacroPreprocessor {

	/**
	 * Scans source code and processes all $include and $macro definition statements and returns (via
	 * mutable args):
	 *   - (writer) a list of Stmt objects that represent the non-macro source statements
	 *   - (includedFiles) a list of $include files that have been processed
	 *   - (macroDefMap) a map of all Macro definitions found during the scan
	 *
	 * Each Stmt in the output writer list will have the full context of the statement including the
	 * file and line number where it originated. This can be useful for debugging to relate a
	 * generated FXCore assembler instruction back to the source file+line that generated it.
	 *
	 * This method calls itself recursively to process $include files.
	 *
	 * An exception is thrown on any $macro or $include errors.
	 *
	 * @param {string} inSource
	 * @param {string} sourceFileName
	 * @param {string} includePath
	 * @param {SafeMap} envMap
	 * @param {Array<Stmt>} writer
	 * @param {Array<string>} includedFiles
	 * @param {Map<string,Macro>} macroDefMap
	 */
	static async macroScan(inSource, sourceFileName, includePath, envMap, writer, includedFiles, macroDefMap) {

		// Keep track of what file we are processing
		SourceContext.startFile(sourceFileName);

		let lineNum = 0;
		// Process the input file one line at a time
		try {
			const srcLines = inSource.split(/\r?\n/);

			// Add a blank line at the end to insure any multi-line macro at the end
			// of the file is terminated
			srcLines.push("");

			let inDefine = false;
			let inIf = false;
			let ifCondition = false;
			let blockCommentStartStmt = null; // Statement that started a block comment
			const macroLines = [];
			const multiLines = [];
			for (const inLine of srcLines) {
				let omitOutput = false; // Do not write the current statement to the output stream
				lineNum++;
				SourceContext.atLine(lineNum);
				let stmt = new Stmt(inLine, lineNum, sourceFileName);

				// Parse out the first word (and remainder) with tabs converted to blanks
				const parsed = Util.getFirstAndRemainder(stmt.getText().replace(/\t/g, " "));

				// If we are in a multiline comment, just output it and skip all processing. This takes
				// precedence over all other source code processing.

				if (blockCommentStartStmt != null) {
					// This line is part of a block comment, ignore it for processing purposes.
					// Do nothing, just output as usual below.
					stmt.setIgnore(true);
				}

				//-------------------------------------------------------------------
				// IF processing, precludes all other except block comments
				//-------------------------------------------------------------------

				else if (parsed.firstWord === "$endenv" || parsed.firstWord === "$endif") { // '$endif' is legacy, keeping for backward compatibility
					inIf = false;
					omitOutput = true; // Nothing to output
				}

				else if (inIf && ifCondition === false) {
					omitOutput = true; // Skip lines in FALSE $if block
				}

				else if (parsed.firstWord === "$ifenv" || parsed.firstWord === "$if") { // '$if' is legacy, keeping for backward compatibility
					// Condition section '$ifenv envname=xxx'
					if (inIf) throw new SyntaxException("Nested $ifenv statements are not supported.", stmt);

					// Remove parens (legacy syntax) if present
					let conditionExp = parsed.remainder;
					if (conditionExp.startsWith("(") && conditionExp.endsWith(")")) {
						conditionExp = Util.jsSubstring(conditionExp, 1, conditionExp.length - 1);
					}

					const expParts = Util.split(conditionExp, "="); // Note if this is "!=" the ! stays with the left operand
					if (expParts.length !== 2) throw new SyntaxException("Invalid $ifenv expression.", stmt);
					let operator = true;
					if (expParts[0].endsWith("!")) {
						operator = false;
						expParts[0] = Util.jsSubstring(expParts[0], 0, expParts[0].length - 1); // Trim off the "!" from left operand
					}

					inIf = true;
					ifCondition = envMap.getStr(expParts[0].toLowerCase().trim()).toLowerCase() === expParts[1].trim().toLowerCase(); // TRUE if expression matches env setting
					if (!operator) {
						ifCondition = !ifCondition; // Invert for "!=" operator
					}
					omitOutput = true; // Do not output the $if statement itself
				}

				//-----------------------------------------
				// $include
				//-----------------------------------------

				else if (parsed.firstWord === "$include") {
					const incFileName = parsed.remainder.replace(/"/g, "");
					if (incFileName.length === 0) {
						throw new SyntaxException("Invalid $include statement, no file specified.", stmt);
					}

					if (!includedFiles.includes(incFileName)) { // Only include a file once
						// Recursive call to process the #include'd file
						includedFiles.push(incFileName);
						writer.push(new Stmt(";--- BEGIN INCLUDE: " + incFileName, stmt.getLineNum(), stmt.getFileName()));
						let incFilePath = "";
						let incFileData = "";
						// Handle URLs and local file names
						if (includePath.startsWith("//http")) {
							//TODO: Implement URL $include processing
						}
						else {
							if (FXCoreMP.isBrowser) throw new SyntaxException("$include of local files is not available in the browser environment.", stmt);
							// Note must avoid static reference to NodeJS dependencies that don't exist in a browser
							const fs = await import('node:fs');
							const path = await import('node:path');
							incFilePath = path.join(includePath, incFileName);
							incFileData = fs.readFileSync(incFilePath, 'utf-8');
						}
						await MacroPreprocessor.macroScan(incFileData, incFileName, includePath, envMap, writer, includedFiles, macroDefMap);
						writer.push(new Stmt(";--- END INCLUDE: " + incFileName, stmt.getLineNum(), stmt.getFileName()));
					}
					omitOutput = true; // Nothing to write for this input line, just continue with next line
				}

				//-------------------------------------------------------------------
				// Macro definition processing
				//-------------------------------------------------------------------

				else if (inDefine && parsed.firstWord === "$endmacro") {
					const m = new Macro(macroLines, sourceFileName);
					const macroName = m.getName();
					if (macroDefMap.has(macroName)) {
						throw new SyntaxException("Macro name '" + m.getName() + "' is already defined.", stmt);
					}
					macroDefMap.set(macroName, m);
					inDefine = false;
					macroLines.length = 0;
					omitOutput = true; // Nothing to output for this line
				}

				// Accumulating lines of a multi-line macro?
				else if (inDefine) {
					macroLines.push(stmt);
					omitOutput = true; // Nothing to output for a macro definition
				}

				else if (stmt.isContinued()) {
					multiLines.push(stmt);
					omitOutput = true; // Nothing to output until end of multiline
				}

				else if (parsed.firstWord === "$macro") { // Start of macro definition
					if (parsed.remainder.endsWith("++")) {
						// Start of multi-line macro definition
						macroLines.length = 0;
						inDefine = true;
						macroLines.push(stmt);  // Add first line of macro
						omitOutput = true; // Do not output macro definition lines
					}
					else {
						// Single line macro definition
						macroLines.length = 0;
						inDefine = false;
						macroLines.push(stmt); // Add first and only line to macro
						const m = new Macro(macroLines, sourceFileName);
						const macroName = m.getName();
						if (macroDefMap.has(macroName)) {
							throw new SyntaxException("Macro name '" + m.getName() + "' is already defined.", stmt);
						}
						macroDefMap.set(macroName, m);
						omitOutput = true; // Do not output macro definition lines
					}
				}

				//-----------------------------------------
				// $set
				//-----------------------------------------
				else if (parsed.firstWord === "$setenv" || parsed.firstWord === "$set") { // '$set' is legacy, keeping for backward compatibility
					// Expected format: $set env-var-name=value
					const parts = Util.split(parsed.remainder, "=");
					if (parts.length !== 2) {
						throw new SyntaxException("$setenv statement invalid expression syntax", stmt);
					}
					envMap.put(parts[0].trim().toLowerCase(), parts[1].trim()); // Store (or override) in env map
					omitOutput = true; // Do not output the $set statement
				}
				//-----------------------------------------
				// Output the current line
				//-----------------------------------------
				if (!stmt.isContinued() && multiLines.length > 0) {
					// end of continued (multiline) stmt
					multiLines.push(stmt);
					let mergedText = "";
					for (const s of multiLines) {
						mergedText = mergedText + s.getText() + " ";
					}

					// Update the first line of the continued set with the merged statement text
					const line1 = multiLines[0];
					line1.replaceText(mergedText);

					// Replace the current statement with the merged (line1)
					stmt = line1;

					// Reset multiline buffer
					multiLines.length = 0;
				}


				// If this line ends a block comment, output the comment ender and then process (output)
				// the rest of this line normally.
				if (stmt.isBlockCommentEnd()) {
					blockCommentStartStmt = null; // Leaving multi-line comment block
					const cmtEnd = new Stmt(stmt.getComment(), lineNum, sourceFileName, false);
					cmtEnd.setIgnore(true);
					stmt.removeComment(); // Original comment starter is now a duplicate, so remove it
					writer.push(cmtEnd); // Emit block comment end as an ignored line
				}

				// Output the current line unless it is to be omitted
				if (!omitOutput) writer.push(stmt);

				// If this line began a block comment, process and output the non-comment part normally,
				// then output the comment starter, and skip all future lines until we find the end-block marker.
				if (stmt.isBlockCommentStart()) {
					blockCommentStartStmt = stmt; // Note we are in a multi-line block comment section
					const cmtStart = new Stmt(stmt.getComment(), lineNum, sourceFileName, false);
					cmtStart.setIgnore(true);
					stmt.removeComment(); // Original comment ender is now a duplicate, so remove it
					writer.push(cmtStart); // Emit block comment start as an ignored line
				}
			}

			if (inDefine) {
				throw new Error("Unterminated macro definition, missing $endmacro in file " + sourceFileName);
			}

			SourceContext.endFile();
		}
		catch (t) {
			console.log("Error at line " + lineNum + " in '" + sourceFileName + "': " + t.message);
			throw t;
		}

	}

}