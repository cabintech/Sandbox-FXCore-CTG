/**
 * @author Mark McMillan
 * Copyright (c) Cabintech Global LLC
 *
 * Wrapper for a Map<String,Object> which provides safe ways to get
 * strings, lists, and submaps from the Map. The getXXX methods will
 * never return null, but will return empty strings, lists, or maps
 * if the given key does not exist or if the value is of the wrong type.
 *
 * This can be useful when there is no important distinction between a
 * missing value and an empty value as it eliminates the need for null
 * checks by callers. Callers can safely assume that a value is always
 * returned, never null.
 *
 * The get...byPath() methods allow getting data from submaps (and lists) by
 * specifying the path of keys (and array indexes). get...byPath2() allows
 * navigation by paths from a single delimited string (e.g. key1/key2/key3).
 *
 * This is usually used as a wrapper around an existing map, but the
 * default ctor will create a HashMap and wrap it (allowing this class
 * to be used in Json deserialization).
 * @author Mark
 *
 * @param <String>
 * @param <Object>
 */
export class SafeMap extends Map {

	static PATH_DELIM = "/";

	/**
	 * If no map is supplied, a (non-concurrent) HashMap is created and wrapped.
	 *
	 * Creates a new, empty SafeMap backed by a ConcurrentHashMap.
	 * @param concurrent
	 *
	 * Creates a new SafeMap backed by the given Map, which must have String type keys.
	 * @param map
	 *
	 * Creates and initializes the content of a new SafeMap. The argument values must
	 * be key-value pairs (there must be an even number of args). All even number args
	 * (0,2,4,..) must be of type String or they will be converted to Strings.
	 * @param initKeyValues
	 */
	constructor(...args) {
		super();

		if (args.length === 0) {
			// Default constructor
			return;
		}

		if (args.length === 1 && typeof args[0] === 'boolean') {
			// Overload: SafeMap(boolean concurrent)
			return;
		}

		if (args.length === 1 && (args[0] instanceof Map || typeof args[0] === 'object')) {
			// Overload: SafeMap(Map<String,? extends Object> map) or plain object
			const inputMap = args[0];
			if (inputMap instanceof Map) {
				for (const [key, value] of inputMap.entries()) {
					this.set(String(key), value);
				}
			} else {
				for (const key of Object.keys(inputMap)) {
					this.set(key, inputMap[key]);
				}
			}
			return;
		}

		if (args.length >= 2) {
			// Overload: SafeMap(Object key1, Object value1, Object... initKeyValues)
			for (let i = 0; i < args.length; i += 2) {
				if (i + 1 < args.length) {
					this.set(String(args[i]), args[i + 1]);
				}
			}
		}
	}

	/**
	 * Recursive method to walk the hierarchy and return a string from the last element.
	 * If the full path to the last element does not exist, null is returned.
	 * @param curr
	 * @param pos
	 * @param path
	 * @return
	 */
	_byPath(curr, pos, ...path) {
		// Prior level did not exist in the map
		if (curr == null) return null;

		const isIndex = path[pos].charAt(0) >= '0' && path[pos].charAt(0) <= '9';

		if (pos === path.length - 1) {
			// This is the last element, return it's content to the caller
			if (isIndex) {
				return Array.isArray(curr) ? curr[parseInt(path[pos], 10)] : null;
			}
			if (curr instanceof Map) {
				return curr.get(path[pos]);
			}
			return curr[path[pos]];
		}

		// Move one level down the hierarchy either through a list index or map element
		// by recursive call
		if (isIndex) {
			const nextElem = Array.isArray(curr) ? curr[parseInt(path[pos], 10)] : null;
			return this._byPath(nextElem, pos + 1, ...path);
		}

		const nextElem = (curr instanceof Map) ? curr.get(path[pos]) : curr[path[pos]];
		return this._byPath(nextElem, pos + 1, ...path);
	}

	/*
	 * TEST MAIN
	 */
	static main(args = []) {
		try {
			const m = new SafeMap();
			console.log("result = '" + m.getStrByPath2("pa/pb") + "'");
		} catch (t) {
			console.error(t);
		}
	}

	/*
	 * If the given object is a SafeMap it is returned as-is. If it is a Map then
	 * new SafeMap is returned which wraps it. If it is neither type, an empty
	 * SafeMap is returned.
	 */
	_makeSafe(obj) {
		if (obj instanceof SafeMap) {
			return obj;
		}
		if (obj instanceof Map || (typeof obj === 'object' && obj !== null)) {
			return new SafeMap(obj);
		}
		return new SafeMap();
	}

	/**
	 * Returns a string from the map/array hierarchy by following the given
	 * path through the map/array levels. Each entry in the path is either
	 * the name of a map key, or a numeric list index. The result is the final
	 * element of the path's toString() method result.
	 *
	 * if the full path does not exist, an empty string is returned.
	 *
	 * String firstname = order.getStrByPath("customer","contacts","0","firstname")
	 * @param path
	 * @return
	 */
	getStrByPath(...path) {
		const obj = this._byPath(this, 0, ...path);
		if (obj == null) return "";
		return String(obj);
	}

	/**
	 * Returns a string from the map/array hierarchy by following the given
	 * path through the map/array levels. The path is a "/" separated list of
	 * entry names. Each entry in the path is either
	 * the name of a map key, or a numeric list index. The result is the
	 * toString() result on the final element of the path.
	 *
	 * If the full path does not exist, an empty string is returned.
	 *
	 * This cannot be used if a key name contains the "/" character. In that
	 * case the getStrByPath(...) must be used.
	 *
	 * This is a more readable API than getStrByPath(...) when the path is
	 * a constant string.
	 *
	 * String firstname = order.getStrByPath2("customer/contacts/0/firstname")
	 * @param path
	 * @return
	 */
	getStrByPath2(path) {
		const parts = path.split(SafeMap.PATH_DELIM);
		return this.getStrByPath(...parts);
	}

	/**
	 * Returns a map by navigation from this map through a set of keys
	 * provided as individual strings. Each string represents either a string
	 * key, or if of the form "[nnnn]" is represents an index in a list. For
	 * example, getMapByPathList("car", "suspension", "tires", "0", "brake-type")
	 * @param path
	 * @return
	 */
	getMapByPathList(...path) {
		return this._makeSafe(this._byPath(this, 0, ...path));
	}

	getMapByDelimPath(path) {
		const parts = path.split(SafeMap.PATH_DELIM);
		return this._makeSafe(this._byPath(this, 0, ...parts));
	}

	/**
	 * Returns a non-null string for the given key. If the value is not a string
	 * its toString() method result is returned. If the key does not exist or
	 * its value is null then an empty string is returned.
	 * @param key
	 * @return
	 */
	getStr(key, def = "") {
		const v = this.get(key);
		if (v == null) return def;
		return String(v);
	}

	/**
	 * Returns a list of generic <String,Object> maps - a representation
	 * of a JSON array that contains a list of JSON name/value objects.
	 * If the given key does not exist an empty map is returned.
	 *
	 * If the value of the key is a list it is assumed to be of
	 * type <String,Object> but this is not verified.
	 *
	 * Use the getListOfSafeMaps() method to get the list as a set
	 * of SafeMap objects.
	 * @param key
	 * @return
	 */
	getListOfMaps(key) {
		let v = this.get(key);
		if (v == null) {
			// If the key did not exist, create empty list, add to the map, and return it.
			v = [];
			this.set(key, v);
		}

		if (Array.isArray(v)) {
			return v;
		}

		// A value existed in the map for this key, but it is
		// not a List. Return an empty, unmodifiable list. We do
		// not replace the existing value in the map.
		return Object.freeze([]);
	}

	/**
	 * Returns a List of Maps. If the maps are not of type
	 * SafeMap, they are wrapped in new SafeMap objects
	 * before the list is returned.
	 * @param key
	 * @return
	 */
	getListOfSafeMaps(key) {
		let v = this.get(key);

		if (v == null) {
			v = [];
			this.set(key, v);
		}

		if (Array.isArray(v)) {
			for (let i = 0; i < v.length; i++) {
				if (!(v[i] instanceof SafeMap)) {
					v[i] = new SafeMap(v[i]);
				}
			}
			return v;
		}

		// The existing value is not a List, leave it there and
		// return an empty, unmodifiable list.
		return Object.freeze([]);
	}

	/**
	 * Returns a list of Strings for the given key. If the key does
	 * not exist or is not a list, an empty list is returned. If the
	 * key does exist and its value is a list, it is assumed to be
	 * a list of <String> (the content of the list is not verified).
	 * @param key
	 * @return
	 */
	getListOfStrings(key) {
		let v = this.get(key);
		if (v == null) {
			v = [];
			this.set(key, v);
		}

		if (Array.isArray(v)) {
			return v;
		}

		// Value was not a List, leave it in the map and return
		// an empty, unmodifiable list
		return Object.freeze([]);
	}

	/**
	 * Returns the map from the given key. If the map is already
	 * a SafeMap it is returned as-is, otherwise it is wrapped
	 * in a new SafeMap. If the key does not exist or the value is
	 * not a map, an empty map is returned.
	 * @param key
	 * @return
	 */
	getMap(key) {
		return this._makeSafe(this.get(key));
	}

	/**v7.15
	 * Returns an integer for the given key. If the value does not exist
	 * or is not of type Integer then zero is returned.
	 * If the value is a string an attempt is made to convert to double,
	 * if that fails, the 0 is returned.
	 * @param key
	 * @return
	 */
	getInt(key) {
		const v = this.get(key);
		if (v == null) return 0;
		if (typeof v === 'number') return Math.trunc(v);
		if (typeof v === 'string') {
			const parsed = parseInt(v, 10);
			return isNaN(parsed) ? 0 : parsed;
		}
		return 0;
	}

	/**v11.00
	 * Returns a long for the given key. If the value does not exist
	 * or is not of type Long or Integer then zero is returned.
	 * If the value is a string an attempt is made to convert to long,
	 * if that fails, the 0 is returned.
	 * @param key
	 * @return
	 */
	getLong(key) {
		const v = this.get(key);
		if (v == null) return 0;
		if (typeof v === 'number' || typeof v === 'bigint') return Number(v);
		if (typeof v === 'string') {
			const parsed = parseInt(v, 10);
			return isNaN(parsed) ? 0 : parsed;
		}
		return 0;
	}

	/**v8.41
	 * Returns a boolean for the given key. If the value does not exist
	 * or is not of type Boolean, FALSE is returned. Note this does not
	 * attempt to interpret string values (e.g 'true/false' or 'T/F, etc).
	 * @param key
	 * @return
	 */
	getBool(key) {
		const v = this.get(key);
		if (v == null) return false;
		if (typeof v === 'boolean') return v;
		return false;
	}

	/**v8.10
	 * Returns a double for the given key. If the value does not exist
	 * or is not of type Integer, Double or Float then zero is returned.
	 * If the value is a string an attempt is made to convert to double,
	 * if that fails, the 0.0 is returned.
	 * @param key
	 * @return
	 */
	getDouble(key) {
		const v = this.get(key);
		if (v == null) return 0.0;
		if (typeof v === 'number') return v;
		if (typeof v === 'string') {
			const parsed = parseFloat(v);
			return isNaN(parsed) ? 0.0 : parsed;
		}
		return 0.0;
	}

	/**
	 * Alias method for map size compatibility.
	 */
	containsKey(key) {
		return this.has(key);
	}

	containsValue(value) {
		for (const v of this.values()) {
			if (v === value) return true;
		}
		return false;
	}

	put(key, value) {
		return this.set(String(key), value);
	}

	putAll(mapOrObj) {
		if (mapOrObj instanceof Map) {
			for (const [k, v] of mapOrObj.entries()) {
				this.set(String(k), v);
			}
		} else if (typeof mapOrObj === 'object' && mapOrObj !== null) {
			for (const k of Object.keys(mapOrObj)) {
				this.set(k, mapOrObj[k]);
			}
		}
	}

	remove(key) {
		const prev = this.get(key);
		this.delete(key);
		return prev;
	}

	toString() {
		const entries = [];
		for (const [k, v] of this.entries()) {
			entries.push(`${k}=${v}`);
		}
		return `{${entries.join(', ')}}`;
	}

//	public String toJson() throws JsonProcessingException {
//		// Run the Jackson mapper
//		ObjectMapper m = new ObjectMapper();
//		m.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS); // Write dates in ISO-8601 (readable) format
//		return m.writeValueAsString(this);
//	}
//
//	public static SafeMap fromJson(String json) throws JsonParseException, JsonMappingException, IOException {
//		return new ObjectMapper().readValue(json, SafeMap.class);
//	}

}