import {parse} from "parse5";
import xmlserializer from "xmlserializer";
import xpath from "xpath";
import {DOMParser} from "@xmldom/xmldom";

export const parseHTMLToDom = (content: string) => {
    const rawDom = parse(content);
    const xhtml = xmlserializer
        .serializeToString(rawDom)
        .replace(/ xmlns=["'][^"']+["']/g, "");
    return new DOMParser().parseFromString(xhtml);
};

export const parseHTMLForXPath = (content: string) => {
    const dom = parseHTMLToDom(content);
    const query = (query: string): Element | null => {
        const results = xpath.select(query, dom, true);
        return xpath.isElement(results) ? results : null;
    };
    const queryAll = (query: string): Array<Element> => {
        const results = xpath.select(query, dom, false);
        const resultsArray = Array.isArray(results) ? results : [results];
        return resultsArray.filter((node) =>
            xpath.isElement(node),
        ) as Element[];
    };

    return {
        dom,
        query,
        queryAll,
    };
};
