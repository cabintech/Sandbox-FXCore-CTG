export class IfStmtRecord {
  constructor(startedAt, condition, elseLabel, endLabel, elseTaken = false) {
    this.startedAt = startedAt;
    this.condition = condition;
    this.elseLabel = elseLabel;
    this.endLabel = endLabel;
    this.elseTaken = elseTaken;
  }

  isElseTaken() {
    return this.elseTaken;
  }
}