/**
 * @author Mark McMillan
 * Copyright (c) Cabintech Global LLC
 *
 * An instance of this class represents a macro definition create with the $macro statement.
 * Static methods implement macro evaluation (expansion). See the macro definition language
 * reference at https://github.com/cabintech/FXCoreMP/wiki/Macro-Language-Reference for the
 * macro syntax.
 *
 * Note the argument evaluation syntax "${argname}" is different than the syntax for evaluating
 * a macro "$macroname()"
 *
 * Macro definitions ($macro statements) and $include statements are not allowed in a macro definition. The
 * definition may include substitution (evaluation) of other macros and of the macro argument values supplied
 * for the evaluation. Since the $macroname() invocation syntax is different than the ${argname} syntax, a macro
 * can have an arg name the the same as a macro used in the definition.
 *
 * TODO: BUG: This source line:
 * $_log(after: $_count(nextmr,get,))
 * fools the processor which sees it as a label, not a macro invocation.
 *
 * TODO: BUG: Comments in multiline macro definitions attempt substitution, e.g.
 * $macro XXX(abd, def) ++
 * ; This causes an error but should not, this comment should be ignored: ${NoSuchAArg}
 * $endmacro
 *
 * TODO: For counters, $_count(mycounter,add,xxx) allow xxx to be an expression, not just a numeric literal, e.g.
 * .equ V 12
 * $_count(mycounter,add,V-1)
 *
 * e.g. implement as if $_count(mycounter,add,$_eval(xxx))
 *
 * TODO: Idea 1 -------------------------------------------------------------------------
 * In keeping with TOON concepts, support separation of macro inputs and outputs into an assignment, e.g.
 * for a macro defined like:
 * $macro ABC(in1<=, in2<=, out1=>, out2=>) ++
 *  ...
 * $endmacro
 *
 * Support this invocation syntax:
 * (out1, out2) = $ABC(in1, in2)
 *
 * this looks like a mutil-return value function call. Might need to constrain macro definition
 *  - must use in/out designations (maybe this becomes reqmt on all macro definitions)
 *  - maybe require grouping ins and outs
 *
 * syntax needs to be distinct enough to be easily recognized
 *
 * this is more high-level language like
 *
 * note this is just syntatic sugar, still inputs and outputs are declared but not verified
 *
 * TODO: Idea 2 ---------------------------------------------------------------------------
 * Remove requirement for "++" on multiline macro definitions. Problem is line-by-line gathering
 * uses '++' to gather all the lines of a macro which are passed as a list to Macro ctor. So
 * higher level code needs to properly distinguish.
 *
 * TODO: Idea 3 ----------------------------------------------------------------------------
 * Allow macro args to be omitted without using extra ",". So a simple macro with two args
 * $macro XYZ(a, b) ...
 * could be invoked with 2, 1, or zero args. Of course the macro has to be able to handle that.
 *
 * -----------------------------------------------------------------------------------------------------
 *
 * TODO: Could allow $include in a macro defn, but requires handling in the macro expander.
 */

import { Constants } from './Constants.js';
import { MacroParm } from './MacroParm.js';
import { Stmt } from './Stmt.js';
import { SyntaxException } from './SyntaxException.js';
import { Util } from './Util.js';
import { CaseInsensitiveMap } from './CaseInsensitiveMap.js';
import { FXCoreMP } from './FXCoreMP.js';

// Create a single expression parser instance and register some custom functions to
// imrpove compatibiity with Java EvalEx package.

const expParser = Util.getExpressionParser(); // A single instance to be reused for each expression


export class Macro {
	macroName = null;							// Macro name
	argNames = [];								// List of argument name/direction
	macroLines = [];							// List of lines (one or more)
	static equMap = new Map();					// Map of symbols and expressions created by .equ statements
	static counterMap = new Map();				// Map of counter names to current values
	sourceFile = null;
	rootSourceFile = "";

	static lastUnique = 0; // Last used ${:unique} macro-scope virtual arg value

	/**
	 * Creates a Macro from a set of source statements, the first of which is the $macro statement.
	 * @param {Array<Stmt>} defStmts
	 * @param {string} rootSourceName
	 */
	constructor(defStmts, rootSourceName = "") {
		this.rootSourceFile = rootSourceName;

		// The first line of the definition must contain the macro name and any arg names
		const stmt1 = defStmts[0];
		this.sourceFile = stmt1.getFileName();
		let line1 = stmt1.getText();
		line1 = Util.jsSubstring(line1, 7).trim(); // Remove "$macro "
		if (line1.endsWith("++")) {
			line1 = Util.jsSubstring(line1, 0, line1.length - 3).trim(); // Remove multi-line continuation marker
		}
		line1 = line1.replace(/\t/g, " ").trim();

		// Find end of macro name
		const padded = line1 + " ";
		let afterName = 0;
		while (/[a-zA-Z0-9_$]/.test(padded.charAt(afterName))) {
			afterName++;
		}

		// Find open paren of arg list
		//int blank = line1.indexOf(' ');
		//int paren1 = line1.indexOf('(');
		//int paren2 = line1.indexOf(')');
		//if (paren1 < 0) {
		if (padded.charAt(afterName) !== '(') {
			// No opening paren, presume no args and remaining text is macro text
			const i = line1.indexOf(' ');
			if (i < 0) {
				// No spaces, so entire line is the macro name and no args
				this.macroName = line1.trim();
			}
			else {
				// Macro name followed by macro text
				this.macroName = Util.jsSubstring(line1, 0, i).trim();
				this.macroLines.push(new Stmt(Util.jsSubstring(line1, i + 1).trim(), stmt1.getLineNum(), stmt1.getFileName()));
			}
		}
		else {
			// Macro has arg list
			const paren1 = line1.indexOf('(');
			const paren2 = line1.indexOf(')');
			if (paren2 < 1 || paren1 > paren2) {
				throw new SyntaxException("Invalid macro definition, missing or invalid argument list.", stmt1);
			}
			this.macroName = Util.jsSubstring(line1, 0, paren1).trim(); // Up to first paren is macro name
			if (paren2 > paren1 + 1) {
				// Non-empty arg list
				const argNameList = Util.jsSubstring(line1, paren1 + 1, paren2).trim();
				if (argNameList.length > 0) {
					// Extract comma separated list of arg names
					const names = argNameList.split(",");
					for (let name of names) {
						// Check if arg name has direction indicator (prefix or postfix is allowed)
						name = name.trim();
						let dir = Constants.DIR_ANY;
						if (name.endsWith(Constants.DIR_INOUT_TEXT) || name.startsWith(Constants.DIR_INOUT_TEXT)) {
							dir = Constants.DIR_INOUT;
							if (name.endsWith(Constants.DIR_INOUT_TEXT)) {
								name = Util.jsSubstring(name, 0, name.length - 3);
							}
							else {
								name = Util.jsSubstring(name, 3);
							}
						}
						else if (name.endsWith(Constants.DIR_IN_TEXT) || name.startsWith(Constants.DIR_IN_TEXT)) {
							dir = Constants.DIR_IN;
							if (name.endsWith(Constants.DIR_IN_TEXT)) {
								name = Util.jsSubstring(name, 0, name.length - 2);
							}
							else {
								name = Util.jsSubstring(name, 2);
							}
						}
						else if (name.endsWith(Constants.DIR_OUT_TEXT) || name.startsWith(Constants.DIR_OUT_TEXT)) {
							dir = Constants.DIR_OUT;
							if (name.endsWith(Constants.DIR_OUT_TEXT)) {
								name = Util.jsSubstring(name, 0, name.length - 2);
							}
							else {
								name = Util.jsSubstring(name, 2);
							}
						}
						//console.log("Macro defn: "+name+" direction "+dir);
						this.argNames.push(new MacroParm(name.trim(), dir));
					}
				}
			}
			// If there is non-blank text after the closing parent, it is the first line of macro text
			// Any "++" continuation symbol has already been removed
			if (line1.length > paren2 + 1) {
				this.macroLines.push(new Stmt(Util.jsSubstring(line1, paren2 + 1), stmt1.getLineNum(), stmt1.getFileName()));
			}
		}

		// Enforce macro names so we can reliably parse them in source lines
		if (this.macroName.includes("$"))
			throw new SyntaxException("Macro name cannot contain '$' symbol.", stmt1);
		for (let i = 0; i < this.macroName.length; i++) {
			const c = this.macroName.charAt(i);
			if (!/[a-zA-Z0-9_$]/.test(c)) throw new SyntaxException("Macro name contains invalid character '" + c + "'.", stmt1);
		}

		// Any additional statements are just macro text, do some sanity checking
		// now rather than at eval() time.
		for (let i = 1; i < defStmts.length; i++) {
			const s = defStmts[i];
			const line = s.getText();
			if (line.startsWith("$macro ")) {
				throw new SyntaxException("Nested macro definition not allowed (maybe missing $endmacro before this?)", s);
			}
			if (line.startsWith("$include ")) {
				throw new SyntaxException("Include not allowed in macro definition.", s);
			}
			this.macroLines.push(s);
		}
	}

	toString() {
		return "Macro '" + this.macroName + "', " + this.macroLines.length + " lines, args " + JSON.stringify(this.argNames);
	}

	/**
	 * Returns an unmodifiable list of argument names exactly as given on the $macro statement
	 * @return {Array<MacroParm>}
	 */
	getArgNames() {
		return Object.freeze([...this.argNames]);
	}

	/**
	 * Returns the number of args for this macro as defined by the $macro statement.
	 * @return {number}
	 */
	getArgCount() {
		return this.argNames.length;
	}

	getName() {
		return this.macroName;
	}

	/**
	 * Evaluates the macro and returns its content with substitution of the given args and
	 * evaluating any macros this macro contains.
	 * @param {Map<string,MacroParm>|Object} argValueMap
	 * @param {Stmt} context
	 * @param {Map<string,Macro>} macroMap
	 * @return {Array<string>}
	 */
	eval(argValueMap, context, macroMap) {
		// Use case-insensitive map for arg names
		const treeMap = new CaseInsensitiveMap(argValueMap);

		// All args must be supplied and match definition arg names
		if (treeMap.size !== this.argNames.length) {
			throw new SyntaxException("Invocation of macro '" + this.macroName + "' has incorrect number of args.", context);
		}
		for (const argName of this.argNames) {
			const argValue = treeMap.get(argName.getString().toLowerCase());
			if (argValue == null) {
				throw new SyntaxException("Invocation of macro '" + this.macroName + "' missing argument named '" + argName.getString() + "'.", context);
			}
			//v1.1 Args must also match direction (positional args are DIR_ANY and match any direction)
			if (argName.getDirection() !== argValue.getDirection()) {
				if (argName.getDirection() !== Constants.DIR_ANY && argValue.getDirection() !== Constants.DIR_ANY) {
					throw new SyntaxException("IN/OUT direction mismatch on argument '" + argName.getString() + "' of macro '" + this.macroName + "'.", context);
				}
			}
		}

		// Add virtual args
		Macro.lastUnique++; // Unique ID at the macro-invocation scope
		treeMap.set(":unique", new MacroParm(Macro.lastUnique + "", Constants.DIR_ANY));
		treeMap.set(":sourcefile", new MacroParm(this.sourceFile, Constants.DIR_ANY));
		treeMap.set(":sourcefile_root", new MacroParm(this.rootSourceFile, Constants.DIR_ANY));

		// Do argument substitution on each line of the macro defn
		const genCode = [];
		for (const s of this.macroLines) {
			//TODO: Should only do substitution in statement text, not comments, but using s.getText() here
			// breaks multiline invocations inside a macro definition (WHY?). As is, if a ${...} is in a comment
			// it tries to do the substitution and if it fails flags a syntax error (which is wrong).
			const substText = this.doArgSubst(s.getFullText(), treeMap, s);
			const substStmt = new Stmt(substText, s.getLineNum(), s.getFileName());
			genCode.push(substStmt);
		}

		// Expand macros (possibly multiple lines)
		return Macro.doMacroEval(genCode, macroMap);
	}

	/**
	 * Do macro argument substitution of the form ${arg-name}. There is no nested
	 * substitution, this is simple replacement of the macro with the value of a
	 * macro argument. This is a single pass substitution, the result of an argument
	 * substitution cannot be another argument substitution (but it may be a macro
	 * invocation, which will be evaluated later).
	 *
	 * @param {string} text
	 * @param {Map<string,MacroParm>} argMap
	 * @param {Stmt} stmt
	 * @return {string}
	 */
	doArgSubst(text, argMap, stmt) {
		// Crude, but since there are only a few args this is ok.
		//TODO: Does not handle whitespace like "${ myargname }"
		//TODO: This is case sensitive
		for (const argName of this.argNames) {
			const name = argName.getString();
			const param = argMap.get(name.toLowerCase());
			if (param) {
				text = Util.replaceAll(text, "${" + name + "}", param.getString());
			}
		}

		// Virtual args (pre-defined substitutions)
		text = text.replace(/\$\{:unique\}/g, argMap.get(":unique").getString());
		text = text.replace(/\$\{:sourcefile\}/g, argMap.get(":sourcefile").getString());
		text = text.replace(/\$\{:sourcefile_root\}/g, argMap.get(":sourcefile_root").getString());

		// If there are any unresolved macro args then it is an error
		const i = text.indexOf("${");
		if (i >= 0) {
			let argName = "<unknown>";
			const j = text.indexOf("}", i);
			if (j > i) {
				argName = Util.jsSubstring(text, i + 2, j);
			}
			throw new SyntaxException("Macro argument named '" + argName + "' is used but does not appear in the macro argument list.", stmt);
		}

		return text;
	}

	/**
	 * Expand all macro invocations in the source lines, returns expanded code. All macro
	 * definitions have been removed from the source and included files have been expanded
	 * in-place.
	 *
	 * @param {Array<Stmt>} sourceLines
	 * @param {Map<string,Macro>} macroMap
	 * @return {Array<string>}
	 */
	static doMacroEval(sourceLines, macroMap) {
		const expanded = []; // Expanded macro lines output of this method
		const multiLines = [];

		for (let stmt of sourceLines) {

			if (stmt.isIgnore()) {
				// Do not process this line (part of a block comment), just copy it to the output
				expanded.push(stmt.getFullText());
				continue;
			}

			if (stmt.isContinued()) {
				multiLines.push(stmt);
				continue;
			}

			if (!stmt.isContinued() && multiLines.length > 0) {
				// List line of multiline, collapse them all into one
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

			// Macro form: $mac-name<white-space> or $mac-name() or $mac-name(args)

			let text = stmt.getText(); // Get trimmed text with comments removed
			text = text + " "; // Insure line ends in white space to simplify indexing

			let start = text.lastIndexOf('$'); // Right-to-left scanning will insure we process nested macros inside-out
//			if (start < 0) {
//				// No macros to expand, copy full statement to output and continue with next stmt
//				expanded.add(stmt.getFullText());
//				continue;
//			}

			let expansionOccured = false;
			while (start >= 0) {
				// We expect the macro name is next, it ends at first non-identifier char
				let macroName = "";
				let c = ' ';
				let nameEnd = start + 1;
				expansionOccured = true; // At least one expansion has been done

				// Build up macro name until non-valid identifier char. Since we added a blank to
				// the end we will always find a non-valid char before the end of the text.

				for (; nameEnd < text.length; nameEnd++) {
					c = text.charAt(nameEnd);
					if (/[a-zA-Z0-9_]/.test(c) && c !== '$') { // '$' is never in a macro name
						macroName = macroName + c;
						continue; // Keep moving over the macro name
					}
					else {
						break; // Stop at first non-identifier char
					}
				}
				if (macroName.length < 1) {
					throw new SyntaxException("Missing or invalid macro name in '" + text + "'.", stmt);
				}

				// c is the first char after the macro name

				let end = 0; // Index of end of the macro invocation text
				let args = [];
				let rawArgs = "";
				if (c === '(') {
					// The macro invocation has an arg list. Since we are evaluating macros inside-out, the arg
					// list has no macros in it, just literal text.
					rawArgs = Macro.extractArgList(text, nameEnd);
					if (rawArgs == null) throw new SyntaxException("Invalid macro argument list, missing closing paren: '" + text + "'.", stmt);
					args = Util.split(rawArgs, ",");
					end = nameEnd + rawArgs.length + 2; // start + name + args + parens + $ char
				}
				else {
					// No-arg invocation
					end = nameEnd; // End is right after the macro name
				}

				// Expand the macro
				const macExpanded = Macro.evalMacroInvocation(macroName, args, rawArgs, stmt, macroMap);

				// The first line of expansion replaces the macro invocation in the current line. Any additional lines are added immediately following
				if (macExpanded.length === 0) {
					text = Util.jsSubstring(text, 0, start) + Util.jsSubstring(text, end); // Macro expanded to nothing
					if (stmt.getComment().length > 0) text = text + " " + stmt.getComment();
				}
				else if (macExpanded.length === 1) {
					text = Util.jsSubstring(text, 0, start) + macExpanded[0] + Util.jsSubstring(text, end); // Single string result replaced macro invocation
					//if (stmt.getComment().length > 0) text = text + " " + stmt.getComment();
				}
				else {
					// Any multi-line expansion replaces the source line without any farther nested expansion
					text = ""; // Current line is replaced
					expanded.push(";--- BEGIN MACRO: " + macroName + " " + stmt.getComment());
					expanded.push(...macExpanded);
					expanded.push(";--- END MACRO: " + macroName);
				}

				// Scan (leftward) for more macro invocations
				start = text.lastIndexOf('$');
			}

			// After macros have been expanded, keep track of assembler .equ statements that give symbolic names to expressions
			// so those symbolic names can be used in $_eval() expressions.
			const tokenList = Util.split(text, "\\p{Space}+", 3); // Tokenize on white space including tabs
			if (tokenList.length === 3 && tokenList[0].toLowerCase() === ".equ") {
				// Syntax: .equ symbolic-name expression
				// Try to evaluate the expression now so it can be used in subsequent expressions since
				// our $_eval() function does not operate recursively. If we cannot evaluate it (FXCore assembler
				// EQU expressions may not match the capability of our expression evaluator), then just store
				// it as the raw string and hope it is not used in an $_eval() expression.

				// Javascript note: expr-eval library is case sensative, unlike the Java EvalEx package. So we have to
				// fold the entire expression string to lower case, and fold all EQU keys as well. This could change the
				// result of string expressions that would result in upper case values in Java but will be lower case
				// in this Javascript.
				 
				const symbol = tokenList[1].toUpperCase();
				const exprStr = tokenList[2].toUpperCase();
				//console.log("----- EQU symbol "+symbol+", Expression: "+exprStr);
				try {
				  const valuesObj = {};
				  Macro.equMap.forEach((v, k) => { valuesObj[k.toLowerCase()] = v; }); 
				  const expr = expParser.parse(exprStr.toLowerCase());
				  const result = expr.evaluate(valuesObj);
				  //console.log("Putting symbol "+symbol+" with evaluated value "+result);
				  Macro.equMap.set(symbol, result);
				  
				  //const value = Parser.evaluate(exprStr, valuesObj);
				  //Macro.equMap.set(symbol, value);
				} catch (t) {
				  // If for any reason the expression cannot be evaluated, just store it as its string representation
				  Macro.equMap.set(symbol, exprStr);
				  //console.log("Putting symbol "+symbol+" with unprocessed value "+exprStr);
				}
			}

			if (!expansionOccured) {
				expanded.push(stmt.getFullText()); // Did nothing here, copy full text to output
			}
			else {
				expanded.push(text.trim()); // Output expanded line
			}
		}

		return expanded;
	}

	/**
	 * Extract the arg list from "macroname(arg1, arg2)" where 'from' is the
	 * index of the opening paren. Although there are no nested macro invocations
	 * in the args, there could be parens as part of literal arguments.e.g.
	 *
	 * $ADD(27, (8+4))
	 *
	 * Any parens used in arg values me must be balanced or we cannot reliably
	 * find the end of the arg list (e.g. the closing paren).
	 *
	 * Returns null if the parens are missing or unbalanced.
	 * @param {string} text
	 * @param {number} from
	 * @return {string|null}
	 */
	static extractArgList(text, from) {
		let nestLevel = 0;
		let argStr = "";
		from++; // Skip opening paren

		// Loop until we find a matching closing paren, or end of string (which is an error and returns null)
		while (true) {
			if (text.charAt(from) === ')') {
				if (nestLevel === 0) { // Found matching closing paren
					return argStr;
				}
				nestLevel--; // Go up one nesting level
			}
			else if (text.charAt(from) === '(') {
				nestLevel++; // Go down one nesting level
			}
			if (from === text.length - 1) { // Reached end of text without finding matched closing paren
				return null; // Error
			}
			argStr = argStr + text.charAt(from); // Add to arg string
			from++; // Move to next char
		}
	}

	/**
	 * Given a built-in function name, returns the evaluation of the function with the given args. Note that
	 * any macros in the args have already been expanded so the args are simple strings.
	 * @param {string} funcName
	 * @param {Array<string>} args
	 * @param {string} rawArgs
	 * @param {Stmt} stmt
	 * @return {Array<string>}
	 */
	static evalBuiltInFunction(funcName, args, rawArgs, stmt) {
		const result = [];

		switch (funcName.toLowerCase()) {
		case "_log":
			// Syntax: $_log(arg1,arg2,...), result (evaluation) is always empty
			// Note an macros in the args have already been expanded, so they are just simple strings
			// We treat all the args as a single output. The parser has broken them into seperate args[]
			// elements if there were any commas. We output a single re-constructed string that includes
			// those commas, so from a users point of view it is a single argument.
			FXCoreMP.logMacroMsgs += "Log macro: " + args.join(",")+"\n";
			break;
		case "_count":
			// Syntax: $_count(name, [add,set,get], value)

			if (args.length < 2) throw new SyntaxException("Expected 2 or 3 arguments for _count() built-in macro but found only " + args.length + ".", stmt);
			const counterName = args[0].trim().toLowerCase();
			const operation = args[1].trim().toLowerCase();
			let parameter = "0";
			if (operation !== "get") { // GET does not require 3rd arg, all others do
				if (args.length < 3) throw new SyntaxException("Expected 3rd argument for _count() built-in macro but found only " + args.length + ".", stmt);
				parameter = args[2].trim();
			}
			if (!Macro.counterMap.has(counterName)) { // New counter never seen before, create and init a new one
				Macro.counterMap.set(counterName, 0);
			}

			let currentValue = Macro.counterMap.get(counterName);
			let parmValue = parameter.includes('.') ? parseFloat(parameter) : parseInt(parameter, 10);

			switch (operation) {
			case "add":
				result.push(currentValue.toString()); // Only diff with INC is that ADD returns the current value (before adding, e.g. postfix behavior)
			case "inc":
				currentValue = currentValue + parmValue;
				Macro.counterMap.set(counterName, currentValue);
				break;
			case "set":
				// Set counter to specified value, no result
				Macro.counterMap.set(counterName, parmValue);
				break;
			case "get":
				// Just return current value
				result.push(currentValue.toString());
				break;
			default:
				throw new SyntaxException("Count operation '" + operation + "' is not recognized, must be one of GET,SET,ADD,INC.", stmt);
			}
			break; // _count

		case "_eval":
			try {
			  // Javascript note: This may behave differently than the Java version which is based on the
			  // Java EvalEx package. (For one, we have to fold everything to lower case because this
			  // expression evaluation is case sensative).
			  const valuesObj = {};
			  Macro.equMap.forEach((v, k) => { valuesObj[k.toLowerCase()] = v; });
			  //console.log("All symbols: "+JSON.stringify(valuesObj));
			  
			  const expr = expParser.parse(rawArgs.toLowerCase());
			  const value = expr.evaluate(valuesObj);
			  result.push(value.toString());
			  
			} catch (t) {
			  throw new SyntaxException(`_eval() failed: ${t.message}`, stmt);
			}
			break; // _eval

		default:
			throw new SyntaxException("Build-in function named '" + funcName + "' is not recognized.", stmt);
		}

		return result;
	}

	/**
	 * Given a macro name and list of argument specifications, return the evaluation of the
	 * named macro with the given arg values. The arg values must be simple comma delimited literal text with no embedded
	 * substitutions. MacroParm specs can be named arguments 'argname1=value1, argname2=value2' or positional 'value1, value2'.
	 *
	 * @param {string} macroName
	 * @param {Array<string>} args
	 * @param {string} rawArgs
	 * @param {Stmt} stmt
	 * @param {Map<string,Macro>} macroMap
	 * @return {Array<string>}
	 */
	static evalMacroInvocation(macroName, args, rawArgs, stmt, macroMap) {
		
		// Built in functions have the same syntax as macros but start with underscore
		if (macroName.startsWith("_")) {
			return Macro.evalBuiltInFunction(macroName, args, rawArgs, stmt);
		}

		// Find macro to be evaluated
		const m = macroMap.get(macroName);
		if (m == null) {
			throw new SyntaxException("No definition found for macro '" + macroName + "'.", stmt);
		}

		// Verify number of args
		if (args.length !== m.getArgCount()) {
			throw new SyntaxException("Number of arguments (" + args.length + ") does not match macro definition (" + m.getArgNames().length + ") of macro '" + macroName + "'.", stmt);
		}

		// Build map of arg names to values
		const argNameValueMap = new Map();
		let argsType = 0; // 0=unknown, 1=positional, 2=named

		for (let argNum = 0; argNum < args.length; argNum++) {
			let argText = args[argNum].trim();
			const emptyArg = (argText.length == 0);
			// Support named and positional args. All args must be one or the other but not mixed.
			if ((argText.indexOf('=') < 0) ||
					argText.startsWith("<=>") ||
					argText.startsWith("<=") ||
					argText.startsWith("=>") ||
					argText.startsWith("=")
				)
				{
				// No equal sign or arg starts with a direction indicator, so this is positional MACRO(value0, value1, ...) match each arg, in order, to macro definition arg names
				if (!emptyArg) {
					if (argsType==2) throw new SyntaxException("The form of the '" + macroName + "' macro arguments appear have both named and positional styles which is not allowed.", stmt);
					argsType = 1; // All non-empty args must be positional
				}
				const defName = m.getArgNames()[argNum].getString();		// Name from macro definition
				const defDir = m.getArgNames()[argNum].getDirection();
				let argDir = Constants.DIR_ANY;
				if (argText.startsWith("<=>")) {
					argDir = Constants.DIR_INOUT;
					argText = Util.jsSubstring(argText, 3);
				} else if (argText.startsWith("<=")) {
					argDir = Constants.DIR_IN;
					argText = Util.jsSubstring(argText, 2);
				} else if (argText.startsWith("=>")) {
					argDir = Constants.DIR_OUT;
					argText = Util.jsSubstring(argText, 2);
				} else if (argText.startsWith("=")) {
					argDir = Constants.DIR_ANY;
					argText = Util.jsSubstring(argText, 1);
				}
				// If macro defn and invocation arg have direction indicators, make sure they match
				if ((argDir !== Constants.DIR_ANY) && (defDir !== Constants.DIR_ANY) && (argDir !== defDir))
					throw new SyntaxException("Direction indicator of '" + argText.trim() + "' does not match '" + defName + "' argument of '" + macroName + "' macro definition.", stmt);

				argNameValueMap.set(defName, new MacroParm(argText.trim(), argDir));	// Value is the argument text, positional args are always DIR_ANY
			}
			else {
				// Named argument of the form 'argname=argvalue'.
				if (!emptyArg) {
					if (argsType==1) throw new SyntaxException("The form of the '" + macroName + "' macro arguments appear have both named and positional styles which is not allowed.", stmt);
					argsType = 2; // All non-empty args must be named
				}				

				//v1.1 Allow in/out direction indicators
				let dir = Constants.DIR_INOUT;
				let namevalue = Util.split(argText, "<=>");
				if (namevalue.length < 2) {
					dir = Constants.DIR_IN;
					namevalue = Util.split(argText, "<=");
					if (namevalue.length < 2) {
						dir = Constants.DIR_OUT;
						namevalue = Util.split(argText, "=>");
						if (namevalue.length < 2) {
							dir = Constants.DIR_ANY;
							namevalue = Util.split(argText, "=");
						}
					}
				}

				if (namevalue.length < 2 || namevalue[0].trim().length === 0) { // || namevalue[1].trim().length()==0) {
					throw new SyntaxException("Invalid argName=argValue specification '" + argText + "'.", stmt);
				}

				const argName = namevalue[0].trim(); // Name is left of equal
				const argValue = namevalue[1].trim(); // Value is right of equal

				//console.log(argName + " is direction " + dir);
				argNameValueMap.set(argName, new MacroParm(argValue, dir));
			}
		}

		// Invoke the macro to evaluate itself with the given arguments
		return m.eval(argNameValueMap, null, macroMap);
	}
}