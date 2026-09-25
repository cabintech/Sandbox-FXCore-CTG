class Ctx {
  constructor(sourceFile) {
    this.sourceFile = sourceFile;
    this.sourceLine = 0;
  }
}

export class SourceContext {
  static contextStack = [];

  static startFile(fileName) {
    SourceContext.contextStack.push(new Ctx(fileName));
  }

  static endFile() {
    SourceContext.contextStack.pop();
  }

  static atLine(lineNum) {
    if (SourceContext.contextStack.length === 0) {
      console.log("Internal error, context stack is unexpectedly empty");
    } else {
      SourceContext.contextStack[SourceContext.contextStack.length - 1].sourceLine = lineNum;
    }
  }

  static dumpContext() {
    console.log("Source context:");
    if (SourceContext.contextStack.length === 0) {
      console.log("  (none)");
    } else {
      for (const ctx of SourceContext.contextStack) {
        console.log(`  ${ctx.sourceFile} at line ${ctx.sourceLine}`);
      }
    }
  }
}