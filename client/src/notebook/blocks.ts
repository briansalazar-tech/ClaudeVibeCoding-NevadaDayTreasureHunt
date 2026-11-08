/** The lines of a page as the notebook shows them: an outline of bullets, headings, quotes. */
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'quote'; text: string }
  | { type: 'bullet'; depth: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'blank' };

export function parseBlocks(body: string): Block[] {
  return body.split('\n').map((line): Block => {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading)
      return { type: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! };
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) return { type: 'quote', text: quote[1]! };
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const indent = bullet[1]!.replace(/\t/g, '  ').length;
      return { type: 'bullet', depth: Math.floor(indent / 2), text: bullet[2]! };
    }
    return line.trim() ? { type: 'para', text: line } : { type: 'blank' };
  });
}
