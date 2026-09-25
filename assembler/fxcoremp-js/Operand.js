import { Util } from './Util.js';
import { Toon } from './Toon.js';

/**
 * Represents a TOON statement operand. It may be the left or right side
 * of an assignment, or either side of an expression.
 */
export class Operand {
  constructor(text) {
    this.text = text; // Preserve original text as-is
    this.opText = text.toUpperCase(); // By default, operand is the original text
    this.resolvedName = null;

    // Internal state variables prefixed with '_' to prevent collisions with getter methods
    this._isDMIndirect = false;    // Delay memory indirect operand (x)
    this._isAbsDMIndirect = false; // Absolute delay memory indirect operand #(x)
    this._isMRIndirect = false;   // Memory register indirect operand [x]
    this._isModUpper = false;     // Has ".U" postfix modifier
    this._isModLower = false;     // Has ".L" postfix modifier
    this._isModSat = false;       // Has ".SAT" postfix modifier
    this._isAcc32 = false;        // Operand is ACC32
    this._isAcc32R15 = false;     // Operand is ACC32,R15
    this._isAcc64 = false;        // Operand is ACC64
    this._isCR = false;           // Core register (Rnn, ACC32, FLAGS)
    this._isMR = false;           // Memory register (MRnnn)
    this._isSFR = false;          // Special function register

    // Delay memory indirect "(x)"
    if (this.opText.startsWith("(") && text.endsWith(")")) {
      this._isDMIndirect = true;
      this.opText = Util.jsSubstring(this.opText, 1, this.opText.length - 1);
    }
    // Delay memory absolute indirect "#(x)"
    else if (this.opText.startsWith("#(") && text.endsWith(")")) {
      this._isAbsDMIndirect = true;
      this.opText = Util.jsSubstring(this.opText, 2, this.opText.length - 1);
    }
    // Memory register indirect "[x]"
    else if (this.opText.startsWith("[") && text.endsWith("]")) {
      this._isMRIndirect = true;
      this.opText = Util.jsSubstring(this.opText, 1, this.opText.length - 1);
    }
    // Upper postfix modifier
    else if (this.opText.endsWith(".U")) {
      this._isModUpper = true;
      this.opText = Util.jsSubstring(this.opText, 0, this.opText.length - 2);
    }
    // Lower postfix modifier
    else if (this.opText.endsWith(".L")) {
      this._isModLower = true;
      this.opText = Util.jsSubstring(this.opText, 0, this.opText.length - 2);
    }
    // Saturation postfix modifier
    else if (this.opText.endsWith(".SAT")) {
      this._isModSat = true;
      this.opText = Util.jsSubstring(this.opText, 0, this.opText.length - 4);
    }

    // See if the operand is a renamed (.rn) symbol
    if (Toon.rnMap.has(this.opText)) {
      this.resolvedName = Toon.rnMap.get(this.opText);
    }

    // Determine if operand is a register type (using resolved name)
    const rn = this.getResolvedName();
    this._isMR = /^MR[0-9]+$/.test(rn);
    this._isCR = rn === "ACC32" || /^R[0-9]+$/.test(rn) || rn === "FLAGS" || rn === "ACC32,R15";
    this._isAcc32 = rn === "ACC32";
    this._isAcc32R15 = rn === "ACC32,R15";
    this._isAcc64 = rn === "ACC64";
    this._isSFR = Toon.SrfNameSet.has(rn.toLowerCase());
  }

  static getType(op) {
    op = op.toUpperCase();
    const rn = Toon.rnMap.has(op) ? Toon.rnMap.get(op) : op;
    if (/^MR[0-9]+$/.test(rn)) return "mr";
    if (rn === "ACC32" || /^R[0-9]+$/.test(rn) || rn === "FLAGS") return "cr";
    if (rn === "ACC64") return "acc64";
    if (Toon.SrfNameSet.has(rn.toLowerCase())) return "sfr";
    return "";
  }

  /**
   * Returns true if this operand is a CR, MR, or SFR.
   * @returns {boolean}
   */
  isReg() {
    return this._isMR || this._isCR || this._isSFR;
  }

  /**
   * Returns true if this operand has any type of indirection.
   * @returns {boolean}
   */
  isIndirect() {
    return this._isAbsDMIndirect || this._isDMIndirect || this._isMRIndirect;
  }

  /**
   * Returns true if this operand is modified with a .U, .L or .SAT postfix.
   * @returns {boolean}
   */
  isModified() {
    return this._isModLower || this._isModUpper || this._isModSat;
  }

  /**
   * Returns true if this operand has no indirection and no modifiers.
   * @returns {boolean}
   */
  isPlain() {
    return !this.isIndirect() && !this.isModified();
  }

  getText() {
    return this.text;
  }

  getOpText() {
    return this.opText;
  }

  getResolvedName() {
    return this.resolvedName === null ? this.getOpText() : this.resolvedName;
  }

  isDMIndirect() {
    return this._isDMIndirect;
  }

  isAbsDMIndirect() {
    return this._isAbsDMIndirect;
  }

  isMRIndirect() {
    return this._isMRIndirect;
  }

  isModUpper() {
    return this._isModUpper;
  }

  isModLower() {
    return this._isModLower;
  }

  isModSat() {
    return this._isModSat;
  }

  isAcc32() {
    return this._isAcc32;
  }

  isAcc32R15() {
    return this._isAcc32R15;
  }

  isAcc64() {
    return this._isAcc64;
  }

  isCR() {
    return this._isCR;
  }

  isMR() {
    return this._isMR;
  }

  isSFR() {
    return this._isSFR;
  }
}