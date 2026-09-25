import { SafeMap } from './SafeMap.js';
import { Stmt } from './Stmt.js';
import { Toon } from './Toon.js';
import { Macro } from './Macro.js';
import { MacroPreprocessor } from './MacroPreprocessor.js';
import { SyntaxException } from './SyntaxException.js';

/**
 * Copyright (c) Cabintech Global LLC
 *
 * This class contains the main entry point for the FXCoreMP tools. These tools enhance FXCore assembly
 * language programming with a flexible and parameterized macro processor, and a TOON language
 * translator that supports a high-level-language-like syntax. The input source may freely mix the use
 * of macros, TOON statements, and plain FXCore assembly statements. The output will be FXCore
 * assembly code ready for input to the FXCore assembler.
 *
 * These tools may be run as a command-line utility via the main() method for easy integration into
 * scripted tool chains. It may also be fully integrated into a tools suite via the API
 * process() method.
 *
 * @author Mark
 * Ported from Java Sept 2026.
 */
export class FXCoreMP {

	// Keys for the options properties
	static OPTION_SOURCE_NAME = "source-name";		// (String) Simple name of source file. If a file name, do not include the full path. Defaults to "Unknown-Source"
	static OPTION_SOURCE_PATH = "source-path";		// (String) Location of the source file. May be HTTP URL or a file path. [optional]
	static OPTION_INCLUDE_PATH = "include-path";    // (String) Location to find $include files, may be HTTP URL or a file path. Required if source contains any $include statements.
	static OPTION_ANNOTATE = "annotate";			// (String) Add comments to output code generated from TOON statements that show original TOON source. Defaults to FALSE.
	static OPTION_REVERSE = "reverse";				// (Boolean) [Experimental] If TRUE, TOON translation is reversed, input is FXCore ASM code, output is new TOON equivalent source. Defaults to FALSE.
	static OPTION_VERBOSE = "verbose";				// (String) Level of output messages, one of "none" (quiet), "info" (summary), "debug" (debugging messages). Defaults to "none".
	static OPTION_ENV = "env";						// (Object) Properties with $env names and boolean values [optional]

	// Keys for the results properties
	static RESULTS_STATUS = "status";				// (string) Final status of processing, ['success', 'error']. If 'error' there is no OUTPUT, may or may not be STATS.
	static RESULTS_OUTPUT = "output";				// (string) Assembler source code (or TOON source if OPTION_REVERSE==true)
	static RESULTS_MSGS = "messages";				// (string) Messages (w/new-lines). Generally empty on success. Note $_log messages will appear here.
	static RESULTS_SUMMARY = "summary";				// (string) A readable summary of macro/TOON expansion results (w/new-lines). Maybe missing if status!=success
	static RESULTS_STATS = "stats";					// (object) Properties with various stats: 
	static STATS_INSTR = "instructions";			//		(int) Number of FXCore executable instructions generated
	static STATS_ASSIGNED_MRS = "assignedMRs";		//		(int) Number of auto-assigned MRs via the $nextMR() macro
	static STATS_ERRORS = "errors";					//		(int) Error count
	static STATS_INCLUDES = "includes";				//		(int) Number of (unique) $include files processed
	static STATS_MACROS = "macros";					//		(int) Number of macro definitions found
	static STATS_LINES = "lines";					//		(int) Numbe of lines generated (output)
	
	static verbose = "none";						// For access by all the code base
	static logMacroMsgs = "";						// Accumulates $_log macro messages
	static isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'; // In a few places we need to know if browser or NodeJS


	constructor() {
		// All methods are static, no instance required
	}

	/**
	 * This method implements an API to expand macros and translate TOON statements to FXCore assembler code. This can be used when
	 * this capability is embedded in an tools suite and can integrate more tightly than running via a command-line
	 * (e.g. main() method). This method will not throw any exceptions, errors are indicated in the returned
	 * map.
	 *
	 * This method takes 2 arguments: (sourceCode) the TOON/macro/assembler source code to be processed and (options) a 
	 * set of option properties that control the process.  All options are optional, defaults will be assumed if
	 * they are not specified. See the OPTION_XXXX constants above for the keys and expected values.
	 *
	 * This API returns a set of properties which contains the RESULTS_XXX keys explained above.
	 *
	 * @param {string} sourceCode Source text which may contain FXCore assembly instructions, macro definitions, macro invocations, and TOON statements
	 * @param {Object} options A map of options that control the process (see above)
	 * @return {Map<string, Object>}
	 */
	static async process(sourceCode, options) {

		FXCoreMP.logMacroMsgs = ""; // Reset each time
		const results = {}

		// Process options
		FXCoreMP.verbose 	= String(options[FXCoreMP.OPTION_VERBOSE] ?? "none"); // global
		const doAnnotation 		= !!(options[FXCoreMP.OPTION_ANNOTATE] ?? false);
		const reverse 			= !!(options[FXCoreMP.OPTION_REVERSE] ?? false);
		const sourceName 		= String(options[FXCoreMP.OPTION_SOURCE_NAME] ?? "Unknown-Source");
		const envObject 		= options[FXCoreMP.OPTION_ENV] ?? {};
		let sourcePath 			= String(options[FXCoreMP.OPTION_SOURCE_PATH] ?? "");
		let includePath 		= String(options[FXCoreMP.OPTION_INCLUDE_PATH] ?? "");

		// Normalize paths for URLs and Files
		//TODO: Implement for local file names without dependency on NodeJS path module
		sourcePath = (sourcePath.startsWith("http") && !sourcePath.endsWith("/")) ? sourcePath + "/" : sourcePath;
		//sourcePath = (!sourcePath.startsWith("http") && !sourcePath.endsWith(path.sep)) ? sourcePath + path.sep : sourcePath;

		includePath = (includePath.startsWith("http") && !includePath.endsWith("/")) ? includePath + "/" : includePath;
		//includePath = (!includePath.startsWith("http") && !includePath.endsWith(path.sep)) ? includePath + path.sep : includePath;

		// Populate envMap if provided with lower case keys and validated values
		const envMap = new SafeMap();
		const entries = Object.entries(envObject);
		for (const [key, val] of entries) {
			const value = val.toString().toLowerCase();
			if (value !== "true" && value !== "false") {
				results[FXCoreMP.RESULTS_STATUS] = "error";
				results[FXCoreMP.RESULTS_MSGS] = "Invalid macro processor env value of '" + value + "' for '" + key + "'. Env values must be TRUE or FALSE.";
				return results;
			}
			envMap.put(key.toLowerCase(), value);
		}

		// Sanity check
		if (sourceCode == null || sourceCode.trim().length === 0) {
			results[FXCoreMP.RESULTS_STATUS] = "error";
			results[FXCoreMP.RESULTS_MSGS] = "Source code is missing or empty.";
			return results;
		}

		const newSource = [];			// Output of macro definition scanner, list of all assembler/toon statements (macro definitions removed, $include files inlined)
		const includedFiles = [];		// Output of macro definition scanner, list of all (unique) $include files processed
		const macroMap = new Map();		// Output of macro definition scanner, list of all macro definitions keyed by macro name
		let outSource = [];			// Output of macro evaluation, expanded assembler/toon source code

		const tooner = new Toon(doAnnotation);

		try {
			//---------------------------------------------------------------
			// Macro processing
			//---------------------------------------------------------------
			try {
				// Pass 1, find all $macro definitions and process all$include files
				await MacroPreprocessor.macroScan(sourceCode, sourceName, includePath, envMap, newSource, includedFiles, macroMap);
				//console.log("Macro map after scan: \n",macroMap);
				// Pass 2, now expand all $my_macro() invocations in the source code
				outSource = Macro.doMacroEval(newSource, macroMap);
			} catch (se) {
				if (se instanceof SyntaxException) {
					// Stop on macro errors
					results[FXCoreMP.RESULTS_STATUS] = "error";
					results[FXCoreMP.RESULTS_MSGS] = "Macro processing error:\n  " + se.message + "\n  " + se.getStmtMessage();
					return results;
				}
				throw se;
			}

			//---------------------------------------------------------------
			// TOON processing
			//---------------------------------------------------------------
			let syntaxErrors = 0;
			let pc = 0; // Program (instruction) counter
			let lineCnt = 0;
			let inBlockComment = false;
			let logMessages = "";
			const toonOutput = [];

			//TODO: Because the macro process produces textual source instead of Stmt objects, we
			// lose original source file context (e.g. line numbers).

			for (let s of outSource) { // Process each line that was output from the macro processor
				lineCnt++;
				try {
					if (!reverse) {
						const stmt = new Stmt(s, lineCnt, sourceName);
						if (stmt.isBlockCommentEnd()) {
							inBlockComment = false;
						}
						s = inBlockComment ? "; " + s : tooner.toonToAsm(stmt);
						if (stmt.isBlockCommentStart()) {
							inBlockComment = true;
						}
						if (!inBlockComment) {
							const t = stmt.getText();
							if ((t.length > 0) && !t.startsWith(".") && !t.endsWith(":") && t.toLowerCase() !== "endif" && t.toLowerCase() !== "then") {
								const newlineCount = (s.match(/\n/g) || []).length;
								pc = pc + 1 + newlineCount;
							}
						}
					} else {
						// Reverse the translation... from ASM to TOON
						s = tooner.asmToToon(s);
					}
				} catch (se) {
					if (se instanceof SyntaxException) {
						syntaxErrors++;
						logMessages += "TOON processing error:\n";
						logMessages += "  " + se.message + "\n";
						logMessages += "  " + se.getStmtMessage() + "\n";
					} else {
						throw se;
					}
				}
				toonOutput.push(s);
			}

			// Unclosed IF statement check
			if (Toon.ifStmtStack.length > 0) {
				const stmt = Toon.ifStmtStack[Toon.ifStmtStack.length - 1].startedAt;
				logMessages += "ERROR: Missing ENDIF to IF statement started at " +
						   stmt.getLineNum() + " in " + stmt.getFileName() + "\n";
				syntaxErrors++;
			}

			// Instruction storage checks
			if (pc > 1024) {
				logMessages += "ERROR: Too many instructions, using " + pc + " of 1024 available instructions.\n";
			} else if (pc > 819) {
				logMessages += "WARNING: Using " + pc + " of 1024 available instructions (" +
						   Math.floor((pc / 1024.0) * 100) + "%).\n";
			}

			// Stats compilation
			const stats = {
				[FXCoreMP.STATS_INSTR]:  pc,
				[FXCoreMP.STATS_ASSIGNED_MRS]: Macro.counterMap.has("nextmr") ? Macro.counterMap.get("nextmr") : 0,
				[FXCoreMP.STATS_ERRORS]: syntaxErrors,
				[FXCoreMP.STATS_INCLUDES]: includedFiles.length,
				[FXCoreMP.STATS_MACROS]: macroMap.size,
				[FXCoreMP.STATS_LINES]: toonOutput.length
			}

			results[FXCoreMP.RESULTS_STATS] = stats;
			results[FXCoreMP.RESULTS_OUTPUT] = toonOutput.join("\n");

			// Status Determination
			if (syntaxErrors > 0 || pc > 1024) {
				results[FXCoreMP.RESULTS_STATUS] = "error";
			} else {
				results[FXCoreMP.RESULTS_STATUS] = "success";
			}

			// Create summary
			let summary = "";
				summary += "FXCoreMP(JS) macro and TOON language processing completed\n";
				summary += `  Source              : ${sourcePath}${sourceName}\n`;
				summary += `  FXCore instructions : ${stats[FXCoreMP.STATS_INSTR]} used of 1024 available\n`;
				summary += `  Auto assigned MRs   : ${(stats[FXCoreMP.STATS_ASSIGNED_MRS] > 0 ? stats[FXCoreMP.STATS_ASSIGNED_MRS] + " used of 128 available" : "None")}\n`;
				summary += `  Errors              : ${stats[FXCoreMP.STATS_ERRORS]}\n`;
				summary += `  Included files      : ${stats[FXCoreMP.STATS_INCLUDES]}\n`;
				summary += `  Macro definitions   : ${stats[FXCoreMP.STATS_MACROS]}\n`;
				summary += `  Output lines        : ${stats[FXCoreMP.STATS_LINES]}\n`;

			results[FXCoreMP.RESULTS_SUMMARY] = summary;
			results[FXCoreMP.RESULTS_MSGS] =  logMessages + FXCoreMP.logMacroMsgs;

		} catch (t) {
			results[FXCoreMP.RESULTS_STATUS] = "error";
			results[FXCoreMP.RESULTS_MSGS] = "Unexpected macro/toon procssing error: " + t.message + "\n" + (t.stack || "");
		}

		return results;
	}
}
