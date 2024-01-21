import { ChunkWithoutID } from "../..";
import { countTokens } from "../../llm/countTokens";
import { basicChunker } from "./basic";

function cleanFragment(fragment: string): string {
  let originalFragment = fragment;
  // Remove leading and trailing whitespaces
  fragment = fragment.trim();

  // If there's a (, remove everything after it
  const parenIndex = fragment.indexOf("(");
  if (parenIndex !== -1) {
    fragment = fragment.slice(0, parenIndex);
  }

  // Remove all special characters except alphanumeric, hyphen, space, and underscore
  fragment = fragment.replace(/[^\w\d-\s]/g, "").trim();

  // Convert to lowercase
  fragment = fragment.toLowerCase();

  // Replace spaces with hyphens
  fragment = fragment.replace(/\s+/g, "-");

  console.log(`Fragment ${originalFragment} -> ${fragment}`);
  return fragment;
}

function cleanHeader(header: string): string {
  let originalHeader = header;
  // Remove leading and trailing whitespaces
  header = header.trim();

  // If there's a (, remove everything after it
  const parenIndex = header.indexOf("(");
  if (parenIndex !== -1) {
    header = header.slice(0, parenIndex);
  }

  // Remove all special characters except alphanumeric, hyphen, space, and underscore
  header = header.replace(/[^\w\d-\s]/g, "").trim();

  console.log(`Header ${originalHeader} -> ${header}`);
  return header;
}

export async function* markdownChunker(
  content: string,
  maxChunkSize: number,
  hLevel: number
): AsyncGenerator<ChunkWithoutID> {
  if (countTokens(content, "gpt-4") <= maxChunkSize) {
    yield {
      content,
      startLine: 0,
      endLine: content.split("\n").length,
    };
    return;
  } else if (hLevel > 4) {
    yield* basicChunker(content, maxChunkSize);
    return;
  }

  const h = "#".repeat(hLevel + 1) + " ";
  const lines = content.split("\n");
  const sections = [];

  let currentSectionStartLine = 0;
  let currentSection: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(h) || i === 0) {
      if (currentSection.length) {
        sections.push({
          header: currentSection[0],
          content: currentSection.slice(1).join("\n"),
          startLine: currentSectionStartLine,
          endLine: currentSectionStartLine + currentSection.length,
        });
      }
      currentSection = [lines[i]];
      currentSectionStartLine = i;
    } else {
      currentSection.push(lines[i]);
    }
  }

  if (currentSection.length) {
    sections.push({
      header: currentSection[0],
      content: currentSection.slice(1).join("\n"),
      startLine: currentSectionStartLine,
      endLine: currentSectionStartLine + currentSection.length,
    });
  }

  for (const section of sections) {
    for await (const chunk of markdownChunker(
      section.content,
      maxChunkSize - countTokens(section.header, "gpt-4"),
      hLevel + 1
    )) {
      yield {
        content: section.header + "\n" + chunk.content,
        startLine: section.startLine + chunk.startLine,
        endLine: section.startLine + chunk.endLine,
        otherMetadata: {
          fragment:
            chunk.otherMetadata?.fragment || cleanFragment(section.header),
          title: chunk.otherMetadata?.title || cleanHeader(section.header),
        },
      };
    }
  }
}

/**
 * Recursively chunks by header level (h1-h6)
 * The final chunk will always include all parent headers
 * TODO: Merge together neighboring chunks if their sum doesn't exceed maxChunkSize
 */
