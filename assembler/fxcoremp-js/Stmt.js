import { Util } from './Util.js';

export class Stmt {
  constructor(line, lineNum, fileName, parse = true) {
    this.lineNum = lineNum;
    this.fileName = fileName;
    this.fullText = line;
    this.text = this.fullText.trim();
    this.label = "";
    this.cmnt = "";
    
    // Internal state variables prefixed with '_' to prevent name collisions with getter methods
    this._isBlockCommentStart = false;
    this._isBlockCommentEnd = false;
    this._isContinued = false;
    this._ignore = false;

    if (!parse) return;

    let i = this.text.indexOf("/*");
    let j = this.text.indexOf("*/");

    if (i >= 0) {
      if (j > 0) {
        this.cmnt = Util.jsSubstring(this.text, i, j + 2);
        this.text = Util.jsSubstring(this.text, 0, i) + Util.jsSubstring(this.fullText, j + 3);
      } else {
        this.cmnt = Util.jsSubstring(this.text, i);
        this.text = Util.jsSubstring(this.text, 0, i);
        this._isBlockCommentStart = true;
      }
    } else {
      if (j >= 0) {
        this.cmnt = Util.jsSubstring(this.text, 0, j + 2);
        this.text = Util.jsSubstring(this.text, j + 2);
        this._isBlockCommentEnd = true;
      }
    }

    i = this.text.indexOf(';');
    if (i >= 0) {
      if (!this._isBlockCommentEnd && !this._isBlockCommentStart) this.cmnt = Util.jsSubstring(this.text, i);
      this.text = Util.jsSubstring(this.text, 0, i);
    } else {
      i = this.text.indexOf("//");
      if (i >= 0) {
        if (!this._isBlockCommentEnd && !this._isBlockCommentStart) this.cmnt = Util.jsSubstring(this.text, i);
        this.text = Util.jsSubstring(this.text, 0, i);
      }
    }

    this.text = this.text.trim();
    let labIndex = this.text.indexOf(':');
    if (labIndex > 0) {
      let potentialLabel = Util.jsSubstring(this.text, 0, labIndex);
      if (!potentialLabel.includes(" ") && !potentialLabel.includes("\t")) {
        this.label = potentialLabel + ": ";
        this.text = Util.jsSubstring(this.text, labIndex + 1).trim();
      }
    }

    if (this.text.endsWith("+") && !this.text.endsWith("++")) {
      this.text = Util.jsSubstring(this.text, 0, this.text.length - 1);
      this._isContinued = true;
    }
  }

  // Getter and Setter Methods
  isContinued() { return this._isContinued; }
  getText() { return this.text; }
  getFullText() { return this.fullText; }
  getLineNum() { return this.lineNum; }
  getFileName() { return this.fileName; }
  getComment() { return this.cmnt; }
  getLabel() { return this.label; }
  isBlockCommentStart() { return this._isBlockCommentStart; }
  isBlockCommentEnd() { return this._isBlockCommentEnd; }
  setIgnore(ignore) { this._ignore = ignore; }
  isIgnore() { return this._ignore; }

  removeComment() {
    this.cmnt = "";
    this.fullText = this.text;
  }

  replaceText(newText) {
    this.text = newText;
    this.fullText = (this.label.length > 0 ? this.label + ": " : "") + newText + (this.cmnt.length > 0 ? " ; " + this.cmnt : "");
  }

  toString() {
    return this.getFullText();
  }
}