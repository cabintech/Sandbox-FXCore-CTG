import { FXCoreMP } from './FXCoreMP.js';
import { Util } from './Util.js';

import fs from 'fs';		// NodeJS
import path from 'path';	// NodeJS

/**
 * Copyright (c) Cabintech Global LLC
 *
 * This implements a command-line utility to run the FXCoreMP macro/TOON
 * expander. This must be run as a NodeJS program and will read/write files on the
 * local file system.
 */

// Get command-line arguments passed to this script (excluding 'node' and 'run.js')
const args = process.argv.slice(2);

// If no arguments were passed, provide usage instructions
if (args.length === 0) {
  console.log("No command line arguments supplied. Usage:");
  console.log("  node run.js <input_file> <output_file> [options]\n");
  console.log("Example:");
  console.log("  node FXCoreMPRun.js test.toon test.asm --annotate\n");
  process.exit(1);
}

// Prepare options for FXCoreMP

let doAnnotation = false;
let reverse = false;
const mpEnv = {};
let msgLevel = "info";

const argsList = [...args];
for (let i = 0; i < argsList.length; i++) {
	const arg = argsList[i];
	if (arg.toLowerCase() === "--annotate") {
		doAnnotation = true;
		argsList.splice(i--, 1);
		continue;
	}

	if (arg.toLowerCase() === "--reversetoon") { // Run asm2toon (no macros)
		reverse = true;
		argsList.splice(i--, 1);
		continue;
	}

	if (arg.toLowerCase() === "--version" || arg.toLowerCase() === "--help") { // Show version and exit
		if (Constants.VERSION === "__VERSION__" || Constants.VERSION.trim().length === 0) {
			console.log("FXCoreMP version is unknown (this is not an official release build)");
		}
		else {
			console.log("FXCoreMP version: " + Constants.VERSION);
		}
		process.exit(0);
	}

	if (arg.startsWith("-E")) { // Env variable for $ifenv
		const v = Util.jsSubstring(arg, 2);
		if (v.length === 0) continue; // Skip empty -E arg
		const vs = Util.split(v, "=");
		if (vs.length !== 2) {
			console.error("Invalid -E cmd arg, expecting '-Ename=true|false'");
			process.exit(1);
		}
		if (vs[1] !== "true" && vs[1] !== "false") {
			console.error("Invalid -E cmd arg, value must be true or false");
			process.exit(1);
		}
		mpEnv[vs[0].toLowerCase()] = vs[1];
		argsList.splice(i--, 1);
		continue;
	}

	if (arg.toLowerCase().startsWith("--debug")) { // Debug output level
		const parts = Util.split(arg, "=");
		if (parts.length < 2) {
			msgLevel = "debug";
		} else {
			msgLevel = parts[1].toLowerCase();
		}
		argsList.splice(i--, 1);
		continue;
	}

	if (arg.trim().length === 0) { // Batch files can pass empty args
		argsList.splice(i--, 1);
		continue;
	}
}

// First 2 args are required
if (argsList.length < 2) {
	console.error("No input and output files specified");
	process.exit(1);
}

const srcFile = path.resolve(argsList[0]);
const outFile = path.resolve(argsList[1]);

if (!fs.existsSync(srcFile)) {
	console.log("Input file '" + srcFile + "' not found.");
	process.exit(1);
}

// Prepare options for processing
const options = {};
options[FXCoreMP.OPTION_SOURCE_NAME] = path.basename(srcFile);
options[FXCoreMP.OPTION_SOURCE_PATH] = path.dirname(srcFile);
options[FXCoreMP.OPTION_INCLUDE_PATH] = path.dirname(srcFile); // Search for $include files in same location as source
options[FXCoreMP.OPTION_ANNOTATE] = doAnnotation;
options[FXCoreMP.OPTION_REVERSE] = reverse;
options[FXCoreMP.OPTION_VERBOSE] = msgLevel;
options[FXCoreMP.OPTION_ENV] = mpEnv;

// Read source file and invoke the FXCoreMP processor

try {
	const sourceCode = fs.readFileSync(srcFile, 'utf-8');
	const result = await FXCoreMP.process(sourceCode, options);

	const status = result[FXCoreMP.RESULTS_STATUS];
	const messages = result[FXCoreMP.RESULTS_MSGS];

	if (messages != null && messages.length > 0) {
		process.stdout.write(messages);
	}

	if ("error" === status) {
		process.exit(1);
	}

	if (msgLevel != 'non') {
		process.stdout.write(result[FXCoreMP.RESULTS_SUMMARY]);
	}

	const output = result[FXCoreMP.RESULTS_OUTPUT];
	if (output != null) {
		fs.writeFileSync(outFile, output, 'utf-8');
		if (msgLevel==="debug" || msgLevel==="info") {
			console.log("FXCoreMP output written to: ", outFile);
		}
	}

} catch (t) {
	console.log("Unexpected program error:");
	console.error(t);
	process.exit(3);
}

process.exit(0);
