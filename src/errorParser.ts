import { ErrorCategory } from './types';

// Pattern definitions
//
// Each rule maps a set of keyword / regex patterns to an ErrorCategory.
// Rules are evaluated **top-to-bottom**; the first match wins.
// Put narrow patterns (null-reference) before broad ones (compilation-error).

interface CategoryRule {
  category: ErrorCategory;
  /** At least one pattern must match (case-insensitive substring). */
  patterns: string[];
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  // Null / undefined access
  {
    category: 'null-reference',
    patterns: [
      'nullpointerexception',
      'typeerror: null',
      'undefined is not',
      'cannot read properties of null',
      'cannot read properties of undefined',
      'nonetype',
    ],
  },
  // Syntax / parse errors
  {
    category: 'syntax-error',
    patterns: [
      'syntaxerror',
      'indentationerror',
      'taberror',
      'unexpected token',
      "';' expected",
      'illegal start',
    ],
  },
  // Type mismatches
  {
    category: 'type-error',
    patterns: [
      'typeerror',
      'type mismatch',
      'incompatible types',
      'cannot convert',
      'unsupported operand type',
    ],
  },
  // Missing imports / modules
  {
    category: 'import-error',
    patterns: [
      'importerror',
      'modulenotfounderror',
      'classnotfoundexception',
      'no module named',
      'cannot resolve symbol',
      'cannot find module',
    ],
  },
  // Dictionary / attribute lookups
  {
    category: 'key-error',
    patterns: [
      'keyerror',
      'key not found',
      'has no attribute',
      'attributeerror',
      'nameerror',
      'indexerror',
    ],
  },
  // Build / compilation failures
  {
    category: 'compilation-error',
    patterns: [
      'cannot find symbol',
      'compilation failed',
      'build failed',
      'fatal error',
    ],
  },
  // Runtime exceptions
  {
    category: 'runtime-error',
    patterns: [
      'runtimeerror',
      'zerodivisionerror',
      'valueerror',
      'filenotfounderror',
      'recursionerror',
      'assertionerror',
      'exception in thread',
      'arrayindexoutofboundsexception',
      'stackoverflowerror',
      'arithmeticexception',
      'classcastexception',
      'numberformatexception',
      'exception',
      'traceback',
    ],
  },
];

// Public API

/**
 * Classify an error message into a known category.
 *
 * Categories are checked in priority order so that specific patterns
 * (e.g. `NullPointerException`) match before generic ones (`exception`).
 *
 * @returns The best-matching `ErrorCategory`, or `'generic'` as fallback.
 */
export function parseErrorCategory(errorText: string): ErrorCategory {
  if (!errorText) {
    return 'generic';
  }

  const text = errorText.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => text.includes(pattern))) {
      return rule.category;
    }
  }

  return 'generic';
}
