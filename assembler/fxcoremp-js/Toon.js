import { Util } from './Util.js';
import { Stmt } from './Stmt.js';
import { Operand } from './Operand.js';
import { SyntaxException } from './SyntaxException.js';
import { IfStmtRecord } from './IfStmtRecord.js';





export class Toon {
  /**
   * All ASM opcodes that translate to a simple TOON assignment stmt
   */
  static ToonableCopySet = new Set([
    "cpy_cm", "cpy_mc", "cpy_cs", "cpy_sc", "cpy_cc", "cpy_cmx",
    "wrdld", "rdacc64u", "rdacc64l", "sat64", "ldacc64u", "ldacc64l",
    "rddel", "wrdel", "rddelx", "wrdelx", "rddirx", "wrdirx", "interp"
  ]);

  /**
   * FXCore mnemonics with 2 operands
   */
  static ToonableOpsSet = new Set([
    "addi", "add", "adds", "addsi", "sub", "subs", "sl", "slr", "sls", "slsr",
    "sr", "srr", "sra", "srar", "or", "ori", "and", "andi", "xor", "xori",
    "multrr", "multri", "macrr", "macri", "macrd", "macid", "machrr", "machri",
    "machrd", "machid"
  ]);

  // Conditional branching
  static ToonableBranchSet = new Set([
    "jgez", "jneg", "jnz", "jz", "jzc", "jmp"
  ]);

  // Operations with 1 operand
  static ToonableUnarySet = new Set([
    "inv", "abs", "neg", "log2", "exp2"
  ]);

  // 2 operand instructions that target ACC32 'acc32 = x instr y'
  static Ops2ArgAcc32Set = new Set([
    "addi", "add", "+", "adds", "addsi", "++", "sub", "-", "subs", "--",
    "sl", "slr", "<<", "sls", "slsr", "<<<", "sr", "srr", ">>", "sra", "srar",
    ">>>", "or", "ori", "|", "and", "andi", "&", "xor", "xori", "^",
    "multrr", "multri", "mult", "*", "allpass"
  ]);

  // 1 operand instructions that target ACC32 'acc32 = instr x'
  static Ops1ArgAcc32Set = new Set([
    "inv", "abs", "neg", "log2", "exp2", "interp", "chorus"
  ]);

  // 2 operand instructions that target ACC64 'acc64 = x instr y'
  static Ops2ArgAcc64Set = new Set([
    "macrr", "macri", "macrd", "macid", "machrr", "machri", "machrd", "machid",
    "macr", "macd", "machr", "machd"
  ]);

  // Map of allowed conditional expression operators for IF statements into target FXCore branch mnemonics.
  static CondJmpExpr = new Map([
    ["=", "jz"],
    [">=", "jgez"],
    ["<", "jneg"],
    ["!=", "jnz"],
    ["<>", "jnz"],
    ["neg", "jneg"],
    ["jneg", "jneg"],
    ["jgez", "jgez"],
    ["nz", "jnz"],
    ["gez", "jgez"],
    ["jnz", "jnz"],
    ["z", "jz"],
    ["jz", "jz"],
    ["!=acc32.sign", "jzc"],
    ["zc", "jzc"],
    ["jzc", "jzc"]
  ]);

  // Map of allowed condition expression operators for IF statements, into negation of FXCore branch mnemonics.
  static CondJmpNegate = new Map([
    ["=", "jnz"],
    [">=", "jneg"],
    ["<", "jgez"],
    ["!=", "jz"],
    ["<>", "jz"]
  ]);

  // All FXCore Special Function Registers
  static SrfNameSet = new Set([
    "in0", "in1", "in2", "in3", "out0", "out1", "out2", "out3", "pin", "switch",
    "pot0_k", "pot1_k", "pot2_k", "pot3_k", "pot4_k", "pot5_k", "pot0", "pot1",
    "pot2", "pot3", "pot4", "pot5", "pot0_smth", "pot1_smth", "pot2_smth",
    "pot3_smth", "pot4_smth", "pot5_smth", "lfo0_f", "lfo1_f", "lfo2_f", "lfo3_f",
    "ramp0_f", "ramp1_f", "lfo0_s", "lfo0_c", "lfo1_s", "lfo1_c", "lfo2_s",
    "lfo2_c", "lfo3_s", "lfo3_c", "ramp0_r", "ramp1_r", "maxtempo", "taptempo",
    "samplecnt", "noise", "bootstat", "tapstkrld", "tapdbrld", "swdbrld",
    "prgdbrld", "oflrld"
  ]);

  static LfoNames = new Set(["LFO0", "LFO1", "LFO2", "LFO3"]);

  // Track assembler .rn statements
  static rnMap = new Map();
  static ifStmtStack = [];

  static SEP1 = "\t\t";   // Separator between output instruction and first operand
  static SEP2 = "\t\t\t"; // Separator between output statement text and comment
  static SEP3 = "\t\t";   // Separator before '=' in generated TOON statements (asmToToon)

  constructor(annotate = true) {
    this.annotate = annotate;
    this.ifCounter = 1;
  }

  rebuildStatement(stmtText, stmt, tokens, remainderIndex) {
    let s = stmt.getLabel(); // Start with label, if any (includes ': ' separator)
    s += stmtText;

    if (tokens != null) {
      for (let i = remainderIndex; i < tokens.length; i++) {
        s += " " + tokens[i];
      }
      s += Toon.SEP2;
    }

    if (this.annotate) {
      s += " /* " + stmt.getText() + " */ ";
    }

    if (stmt.getComment().length > 0) {
      s += Toon.SEP1 + stmt.getComment();
    }

    return s;
  }

  allTokensFrom(tokens, startAt) {
    let sb = "";
    if (tokens != null) {
      for (let i = startAt; i < tokens.length; i++) {
        sb += tokens[i];
      }
    }
    return sb;
  }

  static insertElement(a, index, newS) {
    if (index >= a.length) {
      throw new Error(`Index value ${index} is larger the array max index ${a.length}`);
    }
    const list = [];
    for (let i = 0; i < index; i++) {
      list.push(a[i]);
    }
    list.push(newS);
    for (let i = index; i < a.length; i++) {
      list.push(a[i]);
    }
    return list;
  }
  
  /**
     * Takes a TOON source string (with embedded new-lines) and returns the
     * corresponding FXCore assembler source.
     *
     * @param {string} toonSource
     * @returns {string}
     */
    toonToAsm(toonSource) {
      // If passed a Stmt instance instead of a string, delegate to the single-statement method
      if (typeof toonSource !== 'string') {
        return this.toonToAsmStmt(toonSource);
      }

      // Convert string to lines array
      const toonLines = toonSource.split(/\r?\n/);

      let lineCnt = 0;
      let pc = 0; // Program (instruction) counter
      let syntaxErrors = 0; // Toon syntax errors

      const toonOutput = [];
      let inBlockComment = false;

      // Process each input line
      for (let s of toonLines) {
        lineCnt++;
        try {
          // Create a Stmt so any errors can have context (e.g. line number, etc)
          const stmt = new Stmt(s, lineCnt, "SourceString");
          if (stmt.isBlockCommentEnd()) {
            inBlockComment = false;
          }

          s = inBlockComment ? "; " + s : this.toonToAsmStmt(stmt);

          if (stmt.isBlockCommentStart()) {
            inBlockComment = true;
          }

          if (!inBlockComment) {
            const t = stmt.getText();
            if (
              t.length > 0 &&
              !t.startsWith(".") &&
              !t.endsWith(":") &&
              t.toLowerCase() !== "endif" &&
              t.toLowerCase() !== "then"
            ) {
              // Number of physical lines is presumed to be number of FXCore instructions
              const newlineCount = (s.match(/\n/g) || []).length;
              pc = pc + 1 + newlineCount;
            }
          }
        } catch (se) {
          if (se instanceof SyntaxException) {
            syntaxErrors++;
            console.log("TOON processing error:");
            console.log("  " + se.message);
            if (typeof se.getStmtMessage === 'function') {
              console.log("  " + se.getStmtMessage());
            }
          } else {
            throw se;
          }
        }
        toonOutput.push(s);
      }

      return toonOutput.join("\n"); // Return assembler source code
    }

  toonToAsmStmt(stmt) {
    let tokenList = Util.split(stmt.getText(), "\\p{Space}+");
    let tokenCnt = tokenList.length;

    for (let tokenNum = 0; tokenNum <= Math.min(1, tokenCnt - 1); tokenNum++) {
      if (tokenNum === 0 && tokenList[0].toUpperCase() === "IF") {
        break;
      }

      if (tokenList[tokenNum] === "=" || tokenList[tokenNum] === "+=") continue;

      let token = tokenList[tokenNum];

      if (token.endsWith("=")) {
        tokenList[tokenNum] = Util.jsSubstring(token, 0, token.length - 1);
        tokenList = Toon.insertElement(tokenList, 1, "=");
        tokenCnt = tokenList.length;
      } else if (token.startsWith("=")) {
        tokenList[tokenNum] = Util.jsSubstring(token, 1);
        tokenList = Toon.insertElement(tokenList, 1, "=");
        tokenCnt = tokenList.length;
      } else if (token.includes("=")) {
        let parts = Util.split(token, "=");
        if (parts.length !== 2) throw new SyntaxException("Invalid assignment syntax.", stmt);
        let list = [parts[0], "=", parts[1]];
        for (let i = 1; i < tokenList.length; i++) {
          list.push(tokenList[i]);
        }
        tokenList = list;
        tokenCnt = tokenList.length;
      }
    }

    if (tokenCnt >= 3 && tokenList[0].toLowerCase() === ".rn") {
      Toon.rnMap.set(tokenList[1].toUpperCase(), tokenList[2].toUpperCase());
      return stmt.getFullText();
    }

    if (tokenCnt < 1) return stmt.getFullText();

    if (tokenList[0].toLowerCase() === "if") {
      if (tokenCnt < 3) {
        throw new SyntaxException(`Invalid IF statement syntax, expected at least 3 tokens but found only ${tokenCnt}.`, stmt);
      }

      let condToken = tokenList[2].toLowerCase();
      if (condToken.endsWith("0")) {
        condToken = Util.jsSubstring(condToken, 0, condToken.length - 1);
        let tList = [...tokenList];
        tList.splice(3, 0, "0");
        tokenList = tList;
        tokenCnt = tokenList.length;
      }

      let cond = Toon.CondJmpExpr.get(condToken);
      if (!cond) {
        throw new SyntaxException(`Invalid IF statement syntax, condition '${tokenList[2]}' not recognized.`, stmt);
      }

      let gotoLabel = null;
      switch (tokenCnt) {
        case 4:
          break;
        case 5:
          if (tokenList[4].toLowerCase() !== "then") {
            gotoLabel = tokenList[4];
          }
          break;
        case 6:
          if (tokenList[4].toLowerCase() === "goto") {
            gotoLabel = tokenList[5];
          } else {
            throw new SyntaxException(`Invalid IF statement syntax, unexpected token '${tokenList[5]}'.`, stmt);
          }
          break;
        case 7:
          if (tokenList[4].toLowerCase() === "then" && tokenList[5].toLowerCase() === "goto") {
            gotoLabel = tokenList[6];
          }
          break;
        default:
          break;
      }

      if (gotoLabel !== null) {
        let target = new Operand(tokenList[1]);
        if (!target.isCR()) throw new SyntaxException(`Invalid IF statement syntax, operand '${tokenList[1]}' must be a CR.`, stmt);
        if (!target.isPlain()) throw new SyntaxException(`Invalid IF statement syntax, operand '${tokenList[1]}' cannot have modifiers.`, stmt);
        if (tokenList[3].toLowerCase() === "acc32.sign") {
          if (cond !== "jnz") {
            throw new SyntaxException("Invalid IF statement, the only ACC32.SIGN test allowed for IF...GOTO is '!='.", stmt);
          }
          cond = "jzc";
        }

        return this.rebuildStatement(cond + Toon.SEP1 + target.getText() + "," + gotoLabel, stmt, null, 0);
      }

      if (tokenCnt > 4) {
        if (tokenList[4].toLowerCase() !== "then") {
          let tList = [...tokenList];
          tList.splice(4, 0, "then");
          tokenList = tList;
          tokenCnt = tokenList.length;
        }
      }

      cond = Toon.CondJmpNegate.get(condToken);
      if (!cond) {
        throw new SyntaxException(`Invalid IF statement syntax, condition '${tokenList[2]}' not recognized.`, stmt);
      }

      if (tokenList[3].toLowerCase() === "acc32.sign") {
        if (cond !== "jnz") {
          throw new SyntaxException("Invalid IF statement, the only ACC32.SIGN test allowed for IF...THEN blocks is '='.", stmt);
        }
        cond = "jzc";
      }

      let elseLabel = "_else_" + this.ifCounter;
      let endLabel = "_endif_" + this.ifCounter;
      this.ifCounter++;

      let ifRecord = new IfStmtRecord(stmt, condToken, elseLabel, endLabel);
      Toon.ifStmtStack.push(ifRecord);

      let rebuild = this.rebuildStatement(cond + Toon.SEP1 + tokenList[1] + "," + elseLabel, stmt, null, 0);

      if (tokenCnt > 5) {
        let afterThen = tokenList.slice(5).join(" ");
        let asmText = this.toonToAsm(new Stmt(afterThen, stmt.getLineNum(), stmt.getFileName(), true));
        rebuild = rebuild + "\n" + this.rebuildStatement(asmText, stmt, null, 0);

        rebuild = rebuild + "\n" + this.rebuildStatement(ifRecord.elseLabel + ":", stmt, null, 0);
        Toon.ifStmtStack.pop();
      }

      return rebuild;
    }

    if (tokenList[0].toLowerCase() === "then") {
      if (Toon.ifStmtStack.length === 0) {
        throw new SyntaxException("Invalid THEN statement, there is no enclosing IF statement.", stmt);
      }

      if (tokenCnt > 1) {
        let afterThen = tokenList.slice(1).join(" ");
        let asmText = this.toonToAsm(new Stmt(afterThen, stmt.getLineNum(), stmt.getFileName(), true));
        return this.rebuildStatement(asmText, stmt, null, 0);
      }

      return this.rebuildStatement("", stmt, null, 0);
    }

    if (tokenList[0].toLowerCase() === "else") {
      if (Toon.ifStmtStack.length === 0) {
        throw new SyntaxException("Invalid ELSE statement, there is no enclosing IF statement.", stmt);
      }

      let ifRecord = Toon.ifStmtStack[Toon.ifStmtStack.length - 1];
      ifRecord.elseTaken = true;

      let rebuild = this.rebuildStatement("jmp " + ifRecord.endLabel + "\n" + ifRecord.elseLabel + ":" + Toon.SEP1, stmt, null, 0);

      if (tokenCnt > 1) {
        let afterElse = tokenList.slice(1).join(" ");
        let asmText = this.toonToAsm(new Stmt(afterElse, stmt.getLineNum(), stmt.getFileName(), true));
        rebuild = rebuild + "\n" + this.rebuildStatement(asmText, stmt, null, 0);
      }

      return rebuild;
    }

    if (tokenList[0].toLowerCase() === "endif") {
      if (tokenCnt > 1) throw new SyntaxException(`Invalid ENDIF statement syntax, expected a single token but found ${tokenCnt}.`, stmt);

      if (Toon.ifStmtStack.length === 0) {
        throw new SyntaxException("Invalid ENDIF statement, there is no enclosing IF statement.", stmt);
      }

      let s = "";
      let ifRecord = Toon.ifStmtStack.pop();
      if (!ifRecord.isElseTaken()) {
        s = ifRecord.elseLabel + ":\n";
      }
      ifRecord.elseTaken = true;
      return this.rebuildStatement(s + ifRecord.endLabel + ":" + Toon.SEP1, stmt, tokenList, 1);
    }

    if ((tokenCnt > 1) && (tokenList[0].toUpperCase() === "JMP" || tokenList[0].toUpperCase() === "GOTO")) {
      return this.rebuildStatement("jmp" + Toon.SEP1 + tokenList[1], stmt, tokenList, 2);
    }

    if ((tokenCnt > 2) && (tokenList[1] === "=" || tokenList[1] === "+=")) {
      if (tokenCnt < 3) throw new SyntaxException("Invalid TOON instruction format, missing right side of assignment.", stmt);

      let left = new Operand(tokenList[0]);
      let right = new Operand(tokenList[2]);

      if (tokenList[1] === "+=") {
        if (!left.isAcc64()) throw new SyntaxException("Summing operator '+=' is only valid for ACC64 assignments.", stmt);
        if (!left.isPlain()) throw new SyntaxException("Indirect and modifications on ACC64 is not valid for summing operator '+=' assignments.", stmt);
        if (!Toon.Ops2ArgAcc64Set.has(tokenList[3].toLowerCase())) throw new SyntaxException(`Summing operator is not valid for '${tokenList[3]}' instruction.`, stmt);
        tokenList[1] = "=";
      }

      if (left.isAcc64() && tokenCnt === 3) {
        if (!right.isCR()) throw new SyntaxException("Right side of ACC64 assignment must be a CR.", stmt);
        let UL = left.isModLower() ? 'l' : (left.isModUpper() ? 'u' : '?');
        if (UL === '?') throw new SyntaxException("ACC64 must have .U or .L (Upper/Lower) postfix.", stmt);
        return this.rebuildStatement("ldacc64" + UL + Toon.SEP1 + right.getOpText(), stmt, tokenList, 3);
      }

      if (right.isAcc64() && tokenCnt === 3) {
        if (!left.isCR()) throw new SyntaxException("Left side of ACC64 assignment must be a CR.", stmt);
        let opCode = right.isModLower() ? "rdacc64l" : (right.isModUpper() ? "rdacc64u" : (right.isModSat() ? "sat64" : null));
        if (opCode === null) throw new SyntaxException("ACC64 must have .U or .L (Upper/Lower) or .SAT (Saturated) postfix.", stmt);
        return this.rebuildStatement(opCode + Toon.SEP1 + left.getOpText(), stmt, tokenList, 3);
      }

      if ((tokenCnt >= 3) && Toon.Ops1ArgAcc32Set.has(tokenList[2].toLowerCase())) {
        if (tokenCnt < 4) throw new SyntaxException(`Invalid assignment, missing expected operand after '${tokenList[2]}'.`, stmt);
        right = new Operand(tokenList[3]);

        if (!left.isAcc32() && !left.isAcc32R15()) throw new SyntaxException(`Target of assignment for '${tokenList[2]}' function must be ACC32.`, stmt);

        if (tokenList[2].toLowerCase() === "chorus") {
          if (tokenCnt < 4) {
            throw new SyntaxException("CHORUS statement is missing arguments.");
          }
          let remainder = this.allTokensFrom(tokenList, 3).replace(/ /g, "");
          let parts = Util.split(remainder, ",", 0);
          if (parts.length !== 4) throw new SyntaxException("CHORUS must have 4 arguments '... CHORUS depth,lfo,+/-/sin/cos,(addr)'.", stmt);

          let depth = new Operand(parts[0]);
          let lfo = new Operand(parts[1]);
          let sincos = new Operand(parts[2]);
          let addr = new Operand(parts[3]);

          if (!(addr.isDMIndirect() && !addr.isReg())) throw new SyntaxException("CHORUS delay memory address (4th arg) must be indirect constant, e.g. '(200)'.", stmt);
          if (!((depth.isCR() || depth.isMR() || (!depth.isReg() && depth.isPlain()))))
            throw new SyntaxException(`CHORUS depth (1st arg) must be CR, MR, or constant. Found '${depth.getOpText()}'.`, stmt);
          if (!Toon.LfoNames.has(lfo.getOpText())) {
            throw new SyntaxException(`CHORUS lfo (2nd arg) must be one of LFO0, LFO1, LFO2, or LFO3. Found '${lfo.getOpText()}'.`, stmt);
          }
          if (depth.getOpText() !== "R15" && !left.isAcc32R15()) {
            throw new SyntaxException("CHORUS will target R15 as well as ACC32. Left side of assignment must be 'ACC32,R15'.", stmt);
          } else if (depth.getOpText() === "R15" && left.isAcc32R15()) {
            throw new SyntaxException("CHORUS will not target (update) R15. Left side of assignment must be only 'ACC32'.", stmt);
          }

          let phase = sincos.getOpText();
          let sign = phase.startsWith("-") ? "1" : "0";
          if (phase.startsWith("+") || phase.startsWith("-")) {
            phase = Util.jsSubstring(phase, 1);
          }
          if (phase !== "SIN" && phase !== "COS") {
            throw new SyntaxException("CHORUS phase (3nd arg) must be one of SIN or COS (with optional leading '+' or '-').", stmt);
          }

          let instrs = "";

          if (depth.isCR() || depth.isMR()) {
            if (depth.getOpText() !== "R15") {
              instrs = this.toonToAsm(new Stmt("R15 = " + depth.getOpText() + Toon.SEP1 + "; Get depth into R15", stmt.getLineNum(), stmt.getFileName(), true)) + "\n";
            }
          } else {
            instrs = this.toonToAsm(new Stmt("R15.U = " + depth.getOpText() + Toon.SEP1 + ";Load depth to R15 upper half", stmt.getLineNum(), stmt.getFileName(), true)) + "\n";
          }

          return instrs + this.rebuildStatement("chr" + Toon.SEP1 + lfo.getOpText() + "|" + phase + "|" + sign + "," + addr.getOpText(), stmt, null, 0);
        }

        if (!left.isAcc32()) {
          throw new SyntaxException(`The function '${tokenList[2]}' targets only ACC32. Left side of assignment must be 'ACC32'.`, stmt);
        }

        if (tokenList[2].toLowerCase() === "interp") {
          if (!right.isDMIndirect()) throw new SyntaxException("INTERP operand must be indirect '(CR)' or '(CR+constant)'. Expected parens not found.", stmt);
          let isStr = right.getOpText();
          let parts = Util.split(isStr, "\\+", 2);
          if (parts.length < 1) throw new SyntaxException("INTERP operand must be of the form '(CR)' or '(CR+constant)'.", stmt);
          let p1 = new Operand(parts[0]);
          let p2 = new Operand("0");
          if (parts.length === 2) {
            p2 = new Operand(parts[1]);
          }
          if (!p1.isCR()) throw new SyntaxException("INTERP operand must be of the form '(CR)' or '(CR+constant)'. CR not found.", stmt);
          if (p2.isReg()) throw new SyntaxException("INTERP operand must be of the form '(CR)' or '(CR+constant)'. Constant not found.", stmt);
          return this.rebuildStatement("interp" + Toon.SEP1 + p1.getOpText() + "," + p2.getOpText(), stmt, tokenList, 4);
        }

        if (!left.isPlain() || !right.isPlain()) throw new SyntaxException("This assignment operation does not support indirection or modifiers.", stmt);
        if (!right.isCR()) throw new SyntaxException("Source for assignment operation must be a CR.", stmt);
        return this.rebuildStatement(tokenList[2] + Toon.SEP1 + right.getOpText(), stmt, tokenList, 4);
      }

      if ((tokenCnt >= 4) && Toon.Ops2ArgAcc32Set.has(tokenList[3].toLowerCase())) {
        let func = tokenList[3].toLowerCase();
        if (tokenCnt < 5) throw new SyntaxException(`Invalid assignment, missing expected operand after '${func}'.`, stmt);
        let op1 = new Operand(tokenList[2]);
        let op2 = new Operand(tokenList[4]);

        if (!left.isAcc32() && !left.isAcc32R15()) throw new SyntaxException(`Target of assignment for '${func}' function must be ACC32.`, stmt);
        if (!left.isPlain()) throw new SyntaxException("This assignment operation does not support indirection or modifiers on ACC32.", stmt);
        if (!op1.isCR()) {
          throw new SyntaxException(`Left operand for function '${func}' must be a CR.`, stmt);
        }

        if (func === "allpass") {
          if (left.isAcc32()) {
            throw new SyntaxException("ALLPASS will target R15 as well as ACC32. Left side of assignment must be 'ACC32,R15'.", stmt);
          }

          let remainder = this.allTokensFrom(tokenList, 4).replace(/ /g, "");
          let parts = Util.split(remainder, ",", 0);
          if (parts.length < 2 || parts.length > 4) throw new SyntaxException("ALLPASS must have 2 or 3 arguments '... ALLPASS <coeff>,<head>,[<tail>]'.", stmt);

          let coeff = new Operand(parts[0]);
          let head = new Operand(parts[1]);
          let tail = parts.length > 2 ? new Operand(parts[2]) : new Operand(parts[1]);

          if (head.isMR()) {
            if (head.getOpText() !== tail.getOpText()) {
              throw new SyntaxException("ALLPASS with MR head, tail argument must be the same.", stmt);
            }
            if (!coeff.isCR()) {
              throw new SyntaxException("ALLPASS with MR head, must have CR for coeff.", stmt);
            }
            return (
              this.rebuildStatement("apma" + Toon.SEP1 + coeff.getOpText() + "," + tail.getOpText(), stmt, null, 0) + "\n" +
              this.rebuildStatement("apmb" + Toon.SEP1 + coeff.getOpText() + "," + head.getOpText(), stmt, null, 0)
            );
          }

          if (coeff.isCR()) {
            if (!head.isDMIndirect() || (!head.isCR() && head.isReg())) {
              throw new SyntaxException("ALLPASS with CR coeff must have indirect CR or constant HEAD reference e.g. (r6) or (200).", stmt);
            }
            if (!tail.isDMIndirect() || (!tail.isCR() && tail.isReg())) {
              throw new SyntaxException("ALLPASS with CR coeff must have indirect CR or constant TAIL reference e.g. (r6) or (200).", stmt);
            }
            let opCode = head.isReg() ? "aprr" : "apr";
            return (
              this.rebuildStatement(opCode + "a" + Toon.SEP1 + coeff.getOpText() + "," + tail.getOpText(), stmt, null, 0) + "\n" +
              this.rebuildStatement(opCode + "b" + Toon.SEP1 + coeff.getOpText() + "," + head.getOpText(), stmt, null, 0)
            );
          }

          if (!coeff.isReg()) {
            if (!head.isDMIndirect() || (head.isReg())) {
              throw new SyntaxException("ALLPASS with constant coeff must have indirect constant HEAD reference e.g. (200).", stmt);
            }
            if (!tail.isDMIndirect() || (tail.isReg())) {
              throw new SyntaxException("ALLPASS with constant coeff must have indirect constant TAIL reference e.g. (200).", stmt);
            }

            return (
              this.rebuildStatement("apa" + Toon.SEP1 + coeff.getOpText() + "," + tail.getOpText(), stmt, null, 0) + "\n" +
              this.rebuildStatement("apb" + Toon.SEP1 + coeff.getOpText() + "," + head.getOpText(), stmt, null, 0)
            );
          }

          throw new SyntaxException("ALLPASS has invalid args, '<coeff>,<head>,<tail>' must be of the allowed types.", stmt);
        }

        if (!left.isAcc32()) {
          throw new SyntaxException(`The function '${func}' targets only ACC32. Left side of assignment must be 'ACC32'.`, stmt);
        }

        func = Toon.inferFunc(func, op1, op2, stmt);

        if (!op1.isPlain()) throw new SyntaxException(`Left operand for function '${func}' does not support indirectin or modifiers.`, stmt);

        return this.rebuildStatement(func + Toon.SEP1 + op1.getOpText() + "," + op2.getOpText(), stmt, tokenList, 5);
      }

      if ((tokenCnt >= 4) && Toon.Ops2ArgAcc64Set.has(tokenList[3].toLowerCase())) {
        let func = tokenList[3].toLowerCase();
        if (tokenCnt < 5) throw new SyntaxException(`Invalid assignment, missing expected operand after '${func}'.`, stmt);
        let op1 = new Operand(tokenList[2]);
        let op2 = new Operand(tokenList[4]);

        if (!left.isAcc64()) throw new SyntaxException(`Target of assignment for '${func}' function must be ACC64.`, stmt);
        if (!left.isPlain()) throw new SyntaxException("This assignment operation does not support indirection or modifiers on ACC64.", stmt);

        func = Toon.inferFunc(func, op1, op2, stmt);

        if (func === "macid" || func === "machid") {
          if (op1.isReg()) throw new SyntaxException(`Left operand for function '${func}' cannot be a register, immediate constant value is required.`, stmt);
        } else {
          if (!op1.isCR()) throw new SyntaxException(`Left operand for function '${func}' must be a CR.`, stmt);
        }

        if (func === "macrd" || func === "macid" || func === "machrd" || func === "machid") {
          if (!op2.isDMIndirect()) throw new SyntaxException(`Right operand for function '${func}' is delay memory indirect constant, must be enclosed in parens.`, stmt);
        }

        return this.rebuildStatement(func + Toon.SEP1 + op1.getOpText() + "," + op2.getOpText(), stmt, tokenList, 5);
      }

      if (left.isReg() && right.isReg()) {
        let opCode = null;

        if (!left.isModified() && !left.isIndirect() && !right.isModified() && !right.isIndirect()) {
          let codeLeft = left.isCR() ? 'c' : (left.isMR() ? 'm' : 's');
          let codeRight = right.isCR() ? 'c' : (right.isMR() ? 'm' : 's');
          opCode = "cpy_" + codeLeft + codeRight;
        }

        if (!left.isModified() && !left.isIndirect() && !right.isModified() && right.isMRIndirect()) {
          if (!left.isCR() || !right.isCR()) throw new SyntaxException("Left and right sides of indirect MR assignment must be a CR.", stmt);
          opCode = "cpy_cmx";
        }

        if (!left.isModified() && !left.isIndirect() && !right.isModified() && right.isDMIndirect()) {
          if (!left.isCR() || !right.isCR()) throw new SyntaxException("Left and right sides of indirect delay memory assignment must be a CR.", stmt);
          opCode = "rddelx";
        }

        if (!left.isModified() && !left.isIndirect() && !right.isModified() && right.isAbsDMIndirect()) {
          if (!left.isCR() || !right.isCR()) throw new SyntaxException("Left and right sides of absolute indirect delay memory assignment must be a CR.", stmt);
          opCode = "rddirx";
        }

        if (!left.isModified() && left.isDMIndirect() && !right.isModified() && !right.isIndirect()) {
          if (!left.isCR() || !right.isCR()) throw new SyntaxException("Left and right sides of indirect delay memory assignment must be a CR.", stmt);
          opCode = "wrdelx";
        }

        if (!left.isModified() && left.isAbsDMIndirect() && !right.isModified() && !right.isIndirect()) {
          if (!left.isCR() || !right.isCR()) throw new SyntaxException("Left and right sides of absolute indirect delay memory assignment must be a CR.", stmt);
          opCode = "wrdirx";
        }

        if (opCode === null) throw new SyntaxException("Invalid register-to-register assigment statement.", stmt);

        return this.rebuildStatement(opCode + Toon.SEP1 + left.getOpText() + "," + right.getOpText(), stmt, tokenList, 3);
      }

      if (left.isCR()) {
        let opCode = null;

        if (left.isModUpper() && !left.isIndirect() && !right.isModified() && !right.isIndirect()) {
          opCode = "wrdld";
        }

        if (!left.isModified() && !left.isIndirect() && !right.isModified() && right.isDMIndirect()) {
          opCode = "rddel";
        }

        if (right.getText() === "0") {
          if (!left.isAcc32()) {
            throw new SyntaxException("Assigment of zero is supported only for ACC32.", stmt);
          }
          opCode = "xor";
          right = left;
        }

        if (opCode === null) throw new SyntaxException("Invalid NonRegister-to-CR assigment statement.", stmt);
        return this.rebuildStatement(opCode + Toon.SEP1 + left.getOpText() + "," + right.getOpText(), stmt, tokenList, 3);
      }

      if (right.isCR()) {
        if (!left.isModified() && left.isDMIndirect() && !right.isModified() && !right.isIndirect()) {
          return this.rebuildStatement("wrdel" + Toon.SEP1 + left.getOpText() + "," + right.getOpText(), stmt, tokenList, 3);
        }
        throw new SyntaxException("Invalid CR-to-NonRegister assignment statement.", stmt);
      }

      throw new SyntaxException("Invalid assignment statement, function or operand types are not recognized.", stmt);
    }

    return stmt.getFullText();
  }

  asmToToon(s) {
    let stmt = new Stmt(s, 0, "");

    let tokenList = Util.split(stmt.getText(), "\\p{Space}+", 2);
    let tokenCnt = tokenList.length;
    if (tokenCnt < 2) return s;

    let opcode = tokenList[0].trim().toLowerCase();
    let opList = Util.split(tokenList[1].trim(), ",", 2);
    let op1 = opList.length > 0 ? opList[0].trim() : "";
    let op2 = opList.length > 1 ? opList[1].trim() : "";

    if (Toon.ToonableCopySet.has(opcode)) {
      switch (opcode) {
        case "cpy_cmx":
          op2 = "[" + op2 + "]";
          break;
        case "wrdld":
          op1 = op1 + ".U";
          break;
        case "rdacc64u":
          op2 = "ACC64.U";
          break;
        case "rdacc64l":
          op2 = "ACC64.L";
          break;
        case "ldacc64u":
          op2 = op1;
          op1 = "ACC64.U";
          break;
        case "ldacc64l":
          op2 = op1;
          op1 = "ACC64.L";
          break;
        case "sat64":
          op2 = "ACC64.SAT";
          break;
        case "rddel":
        case "rddelx":
        case "rddirx":
          op2 = "(" + op2 + ")";
          if (opcode === "rddirx") op2 = "#" + op2;
          break;
        case "wrdel":
        case "wrdelx":
        case "wrdirx":
          op1 = "(" + op1 + ")";
          if (opcode === "wrdirx") op1 = "#" + op1;
          break;
        case "interp":
          if (op2 === "0") {
            op2 = "INTERP (" + op1 + ")";
          } else {
            op2 = "INTERP (" + op1 + "+" + op2 + ")";
          }
          op1 = "ACC32";
          break;
      }

      return this.rebuildStatement(op1 + Toon.SEP3 + "= " + op2, stmt, null, 0);
    }

    if (Toon.ToonableUnarySet.has(opcode)) {
      return this.rebuildStatement("ACC32" + Toon.SEP3 + "= " + opcode + " " + op1, stmt, null, 0);
    }

    if (Toon.ToonableOpsSet.has(opcode)) {
      let target = "ACC32";
      let equals = "=";

      switch (opcode) {
        case "andi": opcode = "and"; break;
        case "ori": opcode = "or"; break;
        case "xori": opcode = "xor"; break;
        case "slr": opcode = "sl"; break;
        case "slsr": opcode = "sls"; break;
        case "srr": opcode = "sr"; break;
        case "srar": opcode = "sra"; break;
        case "addi": opcode = "add"; break;
        case "addsi": opcode = "adds"; break;
        case "multrr": opcode = "mult"; break;
        case "multri": opcode = "mult"; break;
        case "macrr": opcode = "macr"; break;
        case "macri": opcode = "macr"; break;
        case "macrd": opcode = "macd"; break;
        case "macid": opcode = "macd"; break;
        case "machrr": opcode = "machr"; break;
        case "machri": opcode = "machr"; break;
        case "machrd": opcode = "machd"; break;
        case "machid": opcode = "machd"; break;
      }

      switch (opcode) {
        case "macrr":
        case "macri":
        case "macr":
        case "macrd":
        case "macid":
        case "macd":
        case "machrr":
        case "machri":
        case "machr":
        case "machrd":
        case "machid":
        case "machd":
          target = "ACC64";
          equals = "+=";
          break;
      }

      switch (opcode) {
        case "macrd":
        case "macid":
        case "macd":
        case "machrd":
        case "machid":
        case "machd":
          op2 = "(" + op2 + ")";
          break;
      }

      return this.rebuildStatement(target + Toon.SEP3 + equals + " " + op1 + " " + opcode + " " + op2, stmt, null, 0);
    }

    if (Toon.ToonableBranchSet.has(opcode)) {
      switch (opcode) {
        case "jgez": opcode = ">=0"; break;
        case "jneg": opcode = "<0"; break;
        case "jnz": opcode = "!=0"; break;
        case "jz": opcode = "=0"; break;
        case "jzc": opcode = "!=ACC32.SIGN"; break;
      }

      if (opcode === "jmp") {
        return this.rebuildStatement("GOTO " + op1, stmt, null, 0);
      }

      return this.rebuildStatement("IF " + op1 + " " + opcode + " GOTO " + op2, stmt, null, 0);
    }

    return s;
  }

  static inferFunc(f, op1, op2, context) {
    f = f.toLowerCase();

    if (!op2.isReg()) {
      switch (f) {
        case "+": f = "addi"; break;
        case "add": f = "addi"; break;
        case "++": f = "addsi"; break;
        case "adds": f = "addsi"; break;
        case "|": f = "ori"; break;
        case "or": f = "ori"; break;
        case "&": f = "andi"; break;
        case "and": f = "andi"; break;
        case "^": f = "xori"; break;
        case "xor": f = "xori"; break;
        case "mult": f = "multri"; break;
        case "*": f = "multri"; break;
        case "sl": f = "sl"; break;
        case "<<": f = "sl"; break;
        case "<<<": f = "sls"; break;
        case "sr": f = "sr"; break;
        case ">>": f = "sr"; break;
        case ">>>": f = "sra"; break;
        case "macr": f = "macri"; break;
        case "machr": f = "machri"; break;
      }

      switch (f) {
        case "multrr":
        case "slsr":
        case "srr":
        case "srar":
        case "macrr":
        case "machrr":
          throw new SyntaxException(`Right operand '${op2.getOpText()}' is not a core register as required by instruction '${f}'`, context);
      }
    } else {
      switch (f) {
        case "+": f = "add"; break;
        case "++": f = "adds"; break;
        case "-": f = "sub"; break;
        case "--": f = "subs"; break;
        case "*": f = "multrr"; break;
        case "mult": f = "multrr"; break;
        case "<<": f = "slr"; break;
        case "sl": f = "slr"; break;
        case "<<<": f = "slsr"; break;
        case "sls": f = "slsr"; break;
        case ">>": f = "srr"; break;
        case "sr": f = "srr"; break;
        case ">>>": f = "srar"; break;
        case "sra": f = "srar"; break;
        case "|": f = "or"; break;
        case "&": f = "and"; break;
        case "^": f = "xor"; break;
        case "macd": f = "macrd"; break;
        case "macr": f = "macrr"; break;
        case "machd": f = "machrd"; break;
        case "machr": f = "machrr"; break;
      }

      switch (f) {
        case "addi":
        case "addsi":
        case "ori":
        case "andi":
        case "xori":
        case "multri":
        case "sl":
        case "sls":
        case "sr":
        case "sra":
        case "macri":
        case "macid":
          throw new SyntaxException(`Right operand is a register, but instruction '${f}' requires immediate (constant) value.`, context);
      }
    }

    if (f === "macid" || f === "machid") {
      if (op1.isReg()) throw new SyntaxException(`Instruction '${f}' requires immedidate (const) left operand, but '${op1.getOpText()}' is a register.`, context);
    } else if (f === "macrd" || f === "machrd") {
      if (!op1.isReg()) throw new SyntaxException(`Instruction '${f}' requires register left operand, but '${op1.getOpText()}' is not register.`, context);
    } else if (f === "macd") {
      f = op1.isReg() ? "macrd" : "macid";
    } else if (f === "machd") {
      f = op1.isReg() ? "machrd" : "machid";
    }

    return f;
  }
}

