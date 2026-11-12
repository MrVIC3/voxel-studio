/** Small arithmetic parser for numeric fields. No evaluation of JavaScript or identifiers. */
export function parseNumber(expression: string): number | null {
  const input = expression.trim().toLowerCase().replaceAll(',', '.');
  if (!input || input.length > 120) return null;
  let at = 0,
    depth = 0;
  const space = () => {
    while (/\s/.test(input[at] || '') && at < input.length) at++;
  };
  const atom = (): number => {
    space();
    if (++depth > 20) throw Error('Too many parentheses');
    let result: number;
    if (input[at] === '+' || input[at] === '-') {
      const negative = input[at++] === '-';
      result = atom() * (negative ? -1 : 1);
    } else if (input[at] === '(') {
      at++;
      result = sum();
      space();
      if (input[at++] !== ')') throw Error('Unclosed expression');
    } else if (input.slice(at, at + 2) === 'pi') {
      at += 2;
      result = Math.PI;
    } else {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/.exec(input.slice(at));
      if (!match) throw Error('Invalid number');
      at += match[0].length;
      result = Number(match[0]);
    }
    depth--;
    return result;
  };
  const product = (): number => {
    let result = atom();
    space();
    while (input[at] === '*' || input[at] === '/') {
      const op = input[at++],
        next = atom();
      result = op === '*' ? result * next : result / next;
      space();
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    space();
    while (input[at] === '+' || input[at] === '-') {
      const op = input[at++],
        next = product();
      result = op === '+' ? result + next : result - next;
      space();
    }
    return result;
  };
  try {
    const result = sum();
    space();
    return at === input.length && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
