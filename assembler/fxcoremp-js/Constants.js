/**
 * Common constants for the FXCoreMP project code.
 *
 * Copyright (c) Cabintech Global LLC
 */

// v1.1 - Added optional 'direction' indicators on macro arguments
//        Added optional TOON statement syntax (Target Of Operation Notation)

export const Constants = Object.freeze({
  VERSION: "__VERSION__", // Replaced during build with the current version number

  DIR_ANY: 0,
  DIR_IN: 1,
  DIR_OUT: 2,
  DIR_INOUT: 3,

  DIR_ANY_TEXT: "=",
  DIR_IN_TEXT: "<=",
  DIR_OUT_TEXT: "=>",
  DIR_INOUT_TEXT: "<=>"
});