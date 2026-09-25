import { Constants } from './Constants.js';

/**
 * Represents a macro parameter (definition argument, or invocation argument value).
 * Encapsulates the value of the argument and any indicated direction (DIR_XXXX).
 */
export class MacroParm {
  constructor(string = "", direction = Constants.DIR_ANY) {
    this.string = string;
    this.dir = direction;
  }

  getString() {
    return this.string;
  }

  getDirection() {
    return this.dir;
  }
}