/**
  * Copyright (c) Cabintech Global LLC
  *
  * This class exactly replicates Java 
  *    new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
  * 
  * Not only are lookup methods case-insensitive on the key,
  * but the keys stay in their original case. This works for
  * added entries or entries taken from another Map on the ctor.
  * 
  *
  * const m = new CaseInsensitiveMap();
  * m.set("Hello", "Goodbye");
  * 
  * console.log("Get of 'hello':",m.get("hello"));	// Prints 'Goodbye'
  * console.log("Get of 'HELLO':",m.get("HELLO"));	// Prints 'Goodbye'
  * console.log("Map entries: ",[...m.entries()]); 	// Prints original 'Hello' mixed case key
  *
  * // Build insensitive map from existing map
  * const regularMap = new Map();
  * regularMap.set("Stop", "Go");
  *
  * const m2 = new CaseInsensitiveMap(regularMap);
  * console.log("Get of 'STOP':",m2.get("STOP"));	// Prints 'Go'
 */

export class CaseInsensitiveMap extends Map {
  // Maps lowercased keys to their original case keys
  #caseMap = new Map();

  constructor(iterable) {
    // 1. Initialize an empty native Map first
    super();

    // 2. Safely feed the existing data through our overridden set() method
    if (iterable) {
      for (const [key, value] of iterable) {
        this.set(key, value);
      }
    }
  }

  set(key, value) {
    if (typeof key === 'string') {
      const lowerKey = key.toLowerCase();
      
      // If the key already exists in some casing, use the original casing
      if (this.#caseMap.has(lowerKey)) {
        const originalKey = this.#caseMap.get(lowerKey);
        return super.set(originalKey, value);
      }
      
      // If it's a completely new key, save the original casing reference
      this.#caseMap.set(lowerKey, key);
    }
    return super.set(key, value);
  }

  get(key) {
    if (typeof key === 'string') {
      const originalKey = this.#caseMap.get(key.toLowerCase());
      return super.get(originalKey);
    }
    return super.get(key);
  }

  has(key) {
    if (typeof key === 'string') {
      return this.#caseMap.has(key.toLowerCase());
    }
    return super.has(key);
  }

  delete(key) {
    if (typeof key === 'string') {
      const lowerKey = key.toLowerCase();
      if (this.#caseMap.has(lowerKey)) {
        const originalKey = this.#caseMap.get(lowerKey);
        this.#caseMap.delete(lowerKey);
        return super.delete(originalKey);
      }
      return false;
    }
    return super.delete(key);
  }

  clear() {
    this.#caseMap.clear();
    super.clear();
  }
}

