import { FXCoreMP } from './FXCoreMP.js';

//import { Parser } from 'expr-eval'; // Expression evaluation library (npm install expr-eval)
import { Parser } from './expr-eval.js'; // Local copy of index.mjs from the expr-eval package

/**
 * Holds the results of parsing an input string and extracting 2 groups
 * of characters - the first 'word' (defined as anything that is not
 * blank or parens), and everything remaining in the input after that first word.
 */
export class FirstAndRemainder {
  constructor(firstWord, remainder) {
    this.firstWord = firstWord;
    this.remainder = remainder;
  }
}

export class Util {
  // Regex pattern to extract 2 groups from a string:
  // Group 1: The first word (not space, not parentheses, not equals)
  // Group 2: The rest of the string
  static PATTERN_FIRST_AND_REMAINDER = /^\s*([^ ()=]+)(.*)/s;

  /**
   * Emulates JavaScript's substring method safely without throwing index errors.
   */
  static jsSubstring(s, index1, index2 = s.length) {
    index1 = Math.min(s.length, Math.max(0, index1));
    index2 = Math.min(s.length, Math.max(0, index2));

    if (index1 === index2) return "";
    if (index1 > index2) {
      return s.substring(index2, index1);
    }
    return s.substring(index1, index2);
  }

  /**
   * Splits a string using a regex pattern while preserving empty-input behavior
   * and Java's `split(regex, maxParts)` semantics.
   */
  static split(s, regex, maxParts = -1) {
    if (s == null || s.trim().length === 0) return [];

    // Convert Java-style regex escape sequences to JS regex syntax
    const jsRegexPattern = regex.replace(/\\p\{Space\}/g, "\\s");
    const re = new RegExp(jsRegexPattern);

    if (maxParts <= 0) {
      return s.split(re);
    }

    const parts = s.split(re);
    if (parts.length <= maxParts) {
      return parts;
    }

    const result = parts.slice(0, maxParts - 1);
    const rest = parts.slice(maxParts - 1).join('');
    result.push(rest);
    return result;
  }

  static info(infoStr) {
    if (FXCoreMP.verbose === "info" || FXCoreMP.verbose === "debug") {
      console.log(infoStr);
    }
  }

  static debug(infoStr) {
    if (FXCoreMP.verbose === "debug") {
      console.log(infoStr);
    }
  }

  /**
   * Case-insensitive literal string replacement.
   */
  static replaceAll(source, target, replacement) {
    // Escape special regex characters in literal target string
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return source.replace(new RegExp(escapedTarget, 'gi'), () => replacement);
  }

  /**
   * Splits the input string into the first word and the remainder.
   */
  static getFirstAndRemainder(inputString, foldFirstWord = true) {
    if (inputString == null || inputString.length === 0) {
      return new FirstAndRemainder("", "");
    }

    const matcher = inputString.match(Util.PATTERN_FIRST_AND_REMAINDER);

    if (matcher) {
      const firstWord = matcher[1];
      const remainder = matcher[2].trim();

      return new FirstAndRemainder(
        foldFirstWord ? firstWord.toLowerCase() : firstWord,
        remainder
      );
    } else {
      return new FirstAndRemainder("", "");
    }
  }
  
  /**
   * Returns a expr-eval Parser which has been configured for (some) compatibility with
   * the Java EvalEx expression parser. This instance may be reused for multiple expressions.
   * Each call to this method creates a new instance of the Parser.
   */
  static getExpressionParser() {
	// Create a single expression parser instance and register some custom functions to
	// imrpove compatibiity with Java EvalEx package. Note (unlike EvalEx) these funtion names are
	// case sensitive so some of them we register both upper and lowercase versions. Ugh.

	const expParser = new Parser();
	
	// String functions
	expParser.functions.str_starts_with = function(str, prefix) {
		return str.startsWith(prefix);
	}
	expParser.functions.str_substring = function(str, startIdx, endIdx) {
		return str.substring(startIdx, endIdx);
	}
	expParser.functions.str_left = function(str, n) {
		return str.slice(0,n);
	}
	expParser.functions.str_right = function(str, n) {
		return str.slice(-n);
	}
	expParser.functions.str_length = function(str) {
		return str.length;
	}
	expParser.functions.str_lower = function(str) {
		return str.toLowerCase();
	}
	expParser.functions.str_upper = function(str) {
		return str.toUpperCase();
	}
	expParser.functions.str_matches = function(str, regex) {
		return str.match(regex);
	}
	expParser.functions.str_split = function(str, splitter) {
		return str.split(splitter);
	}
	expParser.functions.str_trim = function(str) {
		return str.trim();
	}
	
	// Math functions, most are the same
	expParser.functions.CEILING = Math.ceil; // ceiling -> ceil
	expParser.functions.ceiling = Math.ceil;
	
	//TODO: Date/time functions DT_XXX
	
	return expParser;
	
  }

  static main(args = []) {
    const input1 = "  $if(condition) { body }";
    const result1 = Util.getFirstAndRemainder(input1);
    console.log("Input: '" + input1 + "'");
    console.log("  Word: '" + result1.firstWord + "'");
    console.log("  Remainder: '" + result1.remainder + "'");

    console.log("---");

    const input2 = "   variable=value; // Comment";
    const result2 = Util.getFirstAndRemainder(input2);
    console.log("Input: '" + input2 + "'");
    console.log("  Word: '" + result2.firstWord + "'");
    console.log("  Remainder: '" + result2.remainder + "'");

    console.log("---");

    const input3 = "onlyWord";
    const result3 = Util.getFirstAndRemainder(input3);
    console.log("Input: '" + input3 + "'");
    console.log("  Word: '" + result3.firstWord + "'");
    console.log("  Remainder: '" + result3.remainder + "'");
  }
}