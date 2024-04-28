import {DOMParser} from "@xmldom/xmldom";
import {parse} from "parse5";
import xmlserializer from "xmlserializer";
import xpath from "xpath";

export type DomQuery = {
    dom: Document;
    query: (query: string, root?: Node) => Element | null;
    queryAll: (query: string, root?: Node) => Array<Element>;
    queryText: (query: string, root?: Node) => string | null;
    queryAllText: (query: string, root?: Node) => Array<string>;
};

export const parseHTMLToDom = (content: string) => {
    const rawDom = parse(content);
    const xhtml = xmlserializer
        .serializeToString(rawDom)
        .replace(/ xmlns=["'][^"']+["']/g, "");
    return new DOMParser().parseFromString(xhtml);
};

const textFromNode = (
    node: Node | null | string | number | boolean,
): string | null => {
    return typeof node === "string" ||
        typeof node === "number" ||
        typeof node === "boolean"
        ? String(node)
        : xpath.isTextNode(node) || xpath.isAttribute(node)
          ? node.nodeValue
          : xpath.isElement(node)
              ? node.textContent
              : null;
};

export const parseHTMLForXPath = (content: string): DomQuery => {
    const dom = parseHTMLToDom(content);
    const query = (query: string, root: Node = dom): Element | null => {
        const results = xpath.select(query, root, true);
        return xpath.isElement(results) ? results : null;
    };
    const queryAll = (query: string, root: Node = dom): Array<Element> => {
        const results = xpath.select(query, root, false);
        const resultsArray = Array.isArray(results) ? results : [results];
        return resultsArray.filter((node) =>
            xpath.isElement(node),
        ) as Element[];
    };
    const queryText = (query: string, root: Node = dom): string | null => {
        return textFromNode(xpath.select(query, root, true));
    };
    const queryAllText = (query: string, root: Node = dom): Array<string> => {
        const results = xpath.select(query, root, false);
        const resultsArray = Array.isArray(results) ? results : [results];
        return resultsArray
            .map(textFromNode)
            .filter((text) => text !== null) as string[];
    };

    return {
        dom,
        query,
        queryAll,
        queryText,
        queryAllText,
    };
};
