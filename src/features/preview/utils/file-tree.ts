import { FileSystemTree } from "@webcontainer/api";
import type { Id, Doc } from "../../../../convex/_generated/dataModel";

type FileDoc = Doc<"files">;

/**
 * Converter arquivos Convex em FileSystemTree aninhado para WebContainer
 */

export const buildFileTree = (files: FileDoc[]): FileSystemTree => {
	const tree: FileSystemTree = {};
	const fileMap = new Map(files.map((f) => [f._id, f]));

	// Gerar o caminho até o diretório/arquivo atual
	const getPath = (file: FileDoc): string[] => {
		const parts: string[] = [file.name];
		let parentId = file.parentId;

		while (parentId) {
			const parent = fileMap.get(parentId);
			if (!parent) break;
			parts.unshift(parent.name);
			parentId = parent.parentId;
		}

		return parts;
	};

	for (const file of files) {
		const pathParts = getPath(file);
		let current = tree;

		for (let i = 0; i < pathParts.length; i++) {
			const part = pathParts[i];
			const isLast = i === pathParts.length - 1;

			if (isLast) {
				if (file.type === "folder") {
					current[part] = { directory: {} };
				} else if (!file.storageId && file.content !== undefined) {
					current[part] = { file: { contents: file.content } };
				}
			} else {
				if (!current[part]) {
					current[part] = { directory: {} };
				}
				const node = current[part];
				if ("directory" in node) {
					current = node.directory;
				}
			}
		}
	}

	return tree;
};

/**
 * Obter o caminho completo para um arquivo percorrendo a cadeia pai
 */

export const getFilePath = (
	file: FileDoc,
	fileMap: Map<Id<"files">, FileDoc>,
): string => {
	const parts: string[] = [file.name];
	let parentId = file.parentId;

	while (parentId) {
		const parent = fileMap.get(parentId);
		if (!parent) break;
		parts.unshift(parent.name);
		parentId = parent.parentId;
	}

	return parts.join("/");
};
