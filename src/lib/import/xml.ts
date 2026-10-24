type XmlText = { type: "text"; value: string };
export type XmlElement = {
  type: "element";
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
};
type XmlNode = XmlText | XmlElement;

const MAX_XML_NODES = 100_000;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function skipSpace(xml: string, i: number): number {
  while (i < xml.length && /\s/.test(xml[i]!)) i += 1;
  return i;
}

function readName(xml: string, i: number): { name: string; next: number } | null {
  if (i >= xml.length || !/[A-Za-z_:]/.test(xml[i]!)) return null;
  const start = i;
  i += 1;
  while (i < xml.length && /[\w:.-]/.test(xml[i]!)) i += 1;
  return { name: xml.slice(start, i), next: i };
}

function readQuoted(
  xml: string,
  i: number,
  quote: string,
): { value: string; next: number } | null {
  const end = xml.indexOf(quote, i);
  if (end === -1) return null;
  return { value: xml.slice(i, end), next: end + 1 };
}

/** Nesting walker; CDATA and comments are not treated as markup. */
export function parseXml(xml: string): XmlElement {
  const root: XmlNode[] = [];
  const stack: XmlElement[] = [
    { type: "element", name: "#root", attrs: {}, children: root },
  ];
  let i = 0;
  let nodes = 0;

  const pushText = (value: string, decode: boolean) => {
    if (!value) return;
    const current = stack[stack.length - 1];
    if (!current || nodes >= MAX_XML_NODES) return;
    nodes += 1;
    current.children.push({
      type: "text",
      value: decode ? decodeXml(value) : value,
    });
  };

  while (i < xml.length && nodes < MAX_XML_NODES) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      pushText(xml.slice(i), true);
      break;
    }
    if (lt > i) pushText(xml.slice(i, lt), true);

    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) {
        pushText(xml.slice(lt + 9), false);
        break;
      }
      pushText(xml.slice(lt + 9, end), false);
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      const end = xml.indexOf(">", lt + 2);
      i = end === -1 ? xml.length : end + 1;
      continue;
    }

    const isEnd = xml.startsWith("</", lt);
    const named = readName(xml, lt + (isEnd ? 2 : 1));
    if (!named) {
      pushText("<", false);
      i = lt + 1;
      continue;
    }

    if (isEnd) {
      const close = xml.indexOf(">", named.next);
      if (close === -1) break;
      const name = named.name.toLowerCase();
      const current = stack[stack.length - 1];
      if (current && current.name === name && stack.length > 1) stack.pop();
      i = close + 1;
      continue;
    }

    let cursor = skipSpace(xml, named.next);
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    let closed = false;
    while (cursor < xml.length) {
      cursor = skipSpace(xml, cursor);
      if (xml.startsWith("/>", cursor)) {
        selfClosing = true;
        closed = true;
        cursor += 2;
        break;
      }
      if (xml[cursor] === ">") {
        closed = true;
        cursor += 1;
        break;
      }
      const attr = readName(xml, cursor);
      if (!attr) {
        cursor += 1;
        continue;
      }
      cursor = skipSpace(xml, attr.next);
      if (xml[cursor] !== "=") {
        attrs[attr.name] = "";
        continue;
      }
      cursor = skipSpace(xml, cursor + 1);
      const quote = xml[cursor];
      if (quote === '"' || quote === "'") {
        const quoted = readQuoted(xml, cursor + 1, quote);
        if (!quoted) {
          cursor = xml.length;
          break;
        }
        attrs[attr.name] = decodeXml(quoted.value);
        cursor = quoted.next;
      } else {
        const start = cursor;
        while (cursor < xml.length && !/[\s/>]/.test(xml[cursor]!)) cursor += 1;
        attrs[attr.name] = decodeXml(xml.slice(start, cursor));
      }
    }

    if (!closed) break;

    const element: XmlElement = {
      type: "element",
      name: named.name.toLowerCase(),
      attrs,
      children: [],
    };
    const current = stack[stack.length - 1];
    if (current && nodes < MAX_XML_NODES) {
      nodes += 1;
      current.children.push(element);
    }
    if (!selfClosing) stack.push(element);
    i = cursor;
  }

  return stack[0]!;
}

export function xmlElements(node: XmlElement, name?: string): XmlElement[] {
  return node.children.filter((child): child is XmlElement => {
    if (child.type !== "element") return false;
    return name ? child.name === name : true;
  });
}

export function xmlChild(
  node: XmlElement | undefined,
  name: string,
): XmlElement | undefined {
  if (!node) return undefined;
  return xmlElements(node, name)[0];
}

export function xmlText(node: XmlElement | undefined): string {
  if (!node) return "";
  const parts: string[] = [];
  const walk = (el: XmlElement) => {
    for (const child of el.children) {
      if (child.type === "text") parts.push(child.value);
      else walk(child);
    }
  };
  walk(node);
  return parts.join("").trim();
}
