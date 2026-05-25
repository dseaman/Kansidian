// Pure writer for SweetClaude bold-key markdown artifacts.
// Surgical splice: replaces only the leading enum portion of a `**Field:** …`
// line. Annotations after ' (', ' —', or ' - ' are preserved byte-identical.
// No `obsidian` imports.

import { extractEnum } from "./parser";

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function updateBoldKeyEnum(
	content: string,
	field: string,
	newEnum: string,
): string {
	const lineRe = new RegExp(
		`^(\\*\\*${escapeRegex(field)}:\\*\\*\\s*)(.*)$`,
		"m",
	);
	const match = content.match(lineRe);
	if (!match) return content;

	const prefix = match[1]!;
	const value = match[2]!;
	const currentEnum = extractEnum(value);
	if (currentEnum === newEnum) return content;

	// Find the annotation delimiter (if any) in the original value, in the
	// same way the parser does. Everything from the delimiter onward is the
	// annotation and must be preserved verbatim.
	const delimiters = [" (", " —", " - "];
	let cut = value.length;
	for (const d of delimiters) {
		const i = value.indexOf(d);
		if (i !== -1 && i < cut) cut = i;
	}
	const annotation = value.slice(cut); // includes the leading space + delimiter

	const newValue = newEnum + annotation;
	const newLine = prefix + newValue;
	return content.replace(lineRe, newLine);
}
