/**
 * Represents a TOON language syntax error.
 * If a Stmt object is included in the constructor, it will be accessible for 
 * later formation of more usable output messages.
 */
export class SyntaxException extends Error {
  /**
   * @param {string} [message] - Error message.
   * @param {Object} [options] - Optional parameters or cause.
   * @param {import('./Stmt.js').Stmt|null} [stmt] - The Stmt instance associated with this error.
   */
  constructor(message = "", options = {}, stmt = null) {
    // Handle overloaded parameter signatures flexibly
    let causeOption;

    // If options is directly a Stmt instance, shift parameters
    if (options && typeof options.getText === 'function') {
      stmt = options;
      options = undefined;
    } else if (options instanceof Error) {
      causeOption = { cause: options };
    } else {
      causeOption = options;
    }

    super(message, causeOption);

    this.name = "SyntaxException";
    this.stmt = stmt;

    // Maintains proper stack trace in V8 environments (Node.js, Chrome)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SyntaxException);
    }
  }

  /**
   * Returns the Stmt associated with this exception.
   * @returns {import('./Stmt.js').Stmt|null}
   */
  getStmt() {
    return this.stmt;
  }

  /**
   * Returns the context of this exception with respect to a supplied Stmt.
   * @returns {string}
   */
  getStmtMessage() {
    return this.stmt == null
      ? "No source information available"
      : `Line ${this.stmt.getLineNum()} (${this.stmt.getFileName()}): ${this.stmt.getFullText()}`;
  }
}