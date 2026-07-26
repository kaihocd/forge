const RESET = "\x1b[0m";

function paint(open: string, text: string) {
  return `${open}${text}${RESET}`;
}

export function red(text: string) {
  return paint("\x1b[31m", text);
}

export function okTag() {
  return paint("\x1b[42m\x1b[30m", " OK ");
}

export function skipTag() {
  return paint("\x1b[43m\x1b[30m", " SKIP ");
}

export function errTag() {
  return paint("\x1b[41m\x1b[37m", " ERR ");
}
