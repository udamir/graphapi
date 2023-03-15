export type Maybe<T> = null | undefined | T;

export const mapRecord = <T, K>(record: Record<string, T>, iterator: (item: T, key: string, record: Record<string, T>) => K ) => {
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, iterator(item, key, record)])) 
}

// graphql-js internal function

export function isPrintableAsBlockString(value: string): boolean {
  if (value === '') {
    return true; // empty string is printable
  }

  let isEmptyLine = true;
  let hasIndent = false;
  let hasCommonIndent = true;
  let seenNonEmptyLine = false;

  for (let i = 0; i < value.length; ++i) {
    switch (value.codePointAt(i)) {
      case 0x0000:
      case 0x0001:
      case 0x0002:
      case 0x0003:
      case 0x0004:
      case 0x0005:
      case 0x0006:
      case 0x0007:
      case 0x0008:
      case 0x000b:
      case 0x000c:
      case 0x000e:
      case 0x000f:
        return false; // Has non-printable characters

      case 0x000d: //  \r
        return false; // Has \r or \r\n which will be replaced as \n

      case 10: //  \n
        if (isEmptyLine && !seenNonEmptyLine) {
          return false; // Has leading new line
        }
        seenNonEmptyLine = true;

        isEmptyLine = true;
        hasIndent = false;
        break;
      case 9: //   \t
      case 32: //  <space>
        hasIndent ||= isEmptyLine;
        break;
      default:
        hasCommonIndent &&= hasIndent;
        isEmptyLine = false;
    }
  }

  if (isEmptyLine) {
    return false; // Has trailing empty lines
  }

  if (hasCommonIndent && seenNonEmptyLine) {
    return false; // Has internal indent
  }

  return true;
}

/**
 * ```
 * WhiteSpace ::
 *   - "Horizontal Tab (U+0009)"
 *   - "Space (U+0020)"
 * ```
 * @internal
 */
export function isWhiteSpace(code: number): boolean {
  return code === 0x0009 || code === 0x0020;
}

// eslint-disable-next-line no-control-regex
const escapedRegExp = /[\x00-\x1f\x22\x5c\x7f-\x9f]/g;

function escapedReplacer(str: string): string {
  return escapeSequences[str.charCodeAt(0)];
}

// prettier-ignore
const escapeSequences = [
  '\\u0000', '\\u0001', '\\u0002', '\\u0003', '\\u0004', '\\u0005', '\\u0006', '\\u0007',
  '\\b',     '\\t',     '\\n',     '\\u000B', '\\f',     '\\r',     '\\u000E', '\\u000F',
  '\\u0010', '\\u0011', '\\u0012', '\\u0013', '\\u0014', '\\u0015', '\\u0016', '\\u0017',
  '\\u0018', '\\u0019', '\\u001A', '\\u001B', '\\u001C', '\\u001D', '\\u001E', '\\u001F',
  '',        '',        '\\"',     '',        '',        '',        '',        '',
  '',        '',        '',        '',        '',        '',        '',        '', // 2F
  '',        '',        '',        '',        '',        '',        '',        '',
  '',        '',        '',        '',        '',        '',        '',        '', // 3F
  '',        '',        '',        '',        '',        '',        '',        '',
  '',        '',        '',        '',        '',        '',        '',        '', // 4F
  '',        '',        '',        '',        '',        '',        '',        '',
  '',        '',        '',        '',        '\\\\',    '',        '',        '', // 5F
  '',        '',        '',        '',        '',        '',        '',        '',
  '',        '',        '',        '',        '',        '',        '',        '', // 6F
  '',        '',        '',        '',        '',        '',        '',        '',
  '',        '',        '',        '',        '',        '',        '',        '\\u007F',
  '\\u0080', '\\u0081', '\\u0082', '\\u0083', '\\u0084', '\\u0085', '\\u0086', '\\u0087',
  '\\u0088', '\\u0089', '\\u008A', '\\u008B', '\\u008C', '\\u008D', '\\u008E', '\\u008F',
  '\\u0090', '\\u0091', '\\u0092', '\\u0093', '\\u0094', '\\u0095', '\\u0096', '\\u0097',
  '\\u0098', '\\u0099', '\\u009A', '\\u009B', '\\u009C', '\\u009D', '\\u009E', '\\u009F',
];

export function printString(str: string): string {
  return `"${str.replace(escapedRegExp, escapedReplacer)}"`;
}

/**
 * Print a block string in the indented block form by adding a leading and
 * trailing blank line. However, if a block string starts with whitespace and is
 * a single-line, adding a leading blank line would strip that whitespace.
 *
 * graphql-js internal function
 */
export function printBlockString(
  value: string,
  options?: { minimize?: boolean },
): string {
  const escapedValue = value.replaceAll('"""', '\\"""');

  // Expand a block string's raw value into independent lines.
  const lines = escapedValue.split(/\r\n|[\n\r]/g);
  const isSingleLine = lines.length === 1;

  // If common indentation is found we can fix some of those cases by adding leading new line
  const forceLeadingNewLine =
    lines.length > 1 &&
    lines
      .slice(1)
      .every((line) => line.length === 0 || isWhiteSpace(line.charCodeAt(0)));

  // Trailing triple quotes just looks confusing but doesn't force trailing new line
  const hasTrailingTripleQuotes = escapedValue.endsWith('\\"""');

  // Trailing quote (single or double) or slash forces trailing new line
  const hasTrailingQuote = value.endsWith('"') && !hasTrailingTripleQuotes;
  const hasTrailingSlash = value.endsWith('\\');
  const forceTrailingNewline = hasTrailingQuote || hasTrailingSlash;

  const printAsMultipleLines =
    !options?.minimize &&
    // add leading and trailing new lines only if it improves readability
    (!isSingleLine ||
      value.length > 70 ||
      forceTrailingNewline ||
      forceLeadingNewLine ||
      hasTrailingTripleQuotes);

  let result = '';

  // Format a multi-line block quote to account for leading space.
  const skipLeadingNewLine = isSingleLine && isWhiteSpace(value.charCodeAt(0));
  if ((printAsMultipleLines && !skipLeadingNewLine) || forceLeadingNewLine) {
    result += '\n';
  }

  result += escapedValue;
  if (printAsMultipleLines || forceTrailingNewline) {
    result += '\n';
  }

  return '"""' + result + '"""';
}
