import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { WebContainer } from "@webcontainer/api";

import { buildFileTree, getFilePath } from "../utils/file-tree";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

import { useFiles } from "@/features/projects/hooks/use-files";
import { se } from "date-fns/locale";

// Instância singleton WebContaine
let webContainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

const getWebContainer = async (): Promise<WebContainer> => {
	if (webContainerInstance) {
		return webContainerInstance;
	}

	if (!bootPromise) {
		bootPromise = WebContainer.boot({ coep: "credentialless" });
	}

	webContainerInstance = await bootPromise;
	return webContainerInstance;
};

const tearDownWebContainer = () => {
	if (webContainerInstance) {
		webContainerInstance.teardown();
		webContainerInstance = null;
	}
	bootPromise = null;
};

interface UseWebContainerProps {
	projectId: Id<"projects">;
	enabled: boolean;
	settings?: {
		installCommand?: string;
		devCommand?: string;
	};
}

export const useWebContainer = ({
	projectId,
	enabled,
	settings,
}: UseWebContainerProps) => {
	const [status, setStatus] = useState<
		"idle" | "booting" | "installing" | "running" | "error"
	>("idle");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [restartKey, setRestartKey] = useState(0);
	const [terminalOutput, setTerminalOutput] = useState("");

	const containerRef = useRef<WebContainer | null>(null);
	const hasStartedRef = useRef(false);

	// Buscar arquivos do Convex (atualização automática de alterações)
	const files = useQuery(api.files.getFiles, { projectId });

	// Iniciar boot e mount
	useEffect(() => {
		if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
			return;
		}
		hasStartedRef.current = true;

		const start = async () => {
			try {
				setStatus("booting");
				setError(null);
				setTerminalOutput("");

				const appendOutput = (data: string) => {
					setTerminalOutput((prev) => prev + data);
				};

				const container = await getWebContainer();
				containerRef.current = container;

				const fileTree = buildFileTree(files);
				await container.mount(fileTree);

				container.on("server-ready", (_port, url) => {
					setPreviewUrl(url);
					setStatus("running");
				});

				setStatus("installing");

				// Analisar comando de instalação (padrão: npm install)
				const installCmd = settings?.installCommand || "npm install";
				const [installBin, ...installArgs] = installCmd.split(" ");
				appendOutput(`$ ${installCmd}\n`);
				const installProcess = await container.spawn(installBin, installArgs);

				installProcess.output.pipeTo(
					new WritableStream({
						write(data) {
							appendOutput(data);
						},
					}),
				);

				const installExitCode = await installProcess.exit;
				if (installExitCode !== 0) {
					throw new Error(`${installCmd} failed with code ${installExitCode}`);
				}

				// Analisar comando dev (padrão: npm run dev)
				const devCmd = settings?.devCommand || "npm run dev";
				const [devBin, ...devArgs] = devCmd.split(" ");
				appendOutput(`\n$ ${devCmd}\n`);
				const devProcess = await container.spawn(devBin, devArgs);
				devProcess.output.pipeTo(
					new WritableStream({
						write(data) {
							appendOutput(data);
						},
					}),
				);
			} catch (error) {
				setError(error instanceof Error ? error.message : "Unknown error");
				setStatus("error");
			}
		};

		start();
	}, [
		enabled,
		files,
		restartKey,
		settings?.devCommand,
		settings?.installCommand,
	]);

	// sincronizar a mudança do arquivo (hot-reload)
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !files || status !== "running") return;

		const fileMap = new Map(files.map((f) => [f._id, f]));

		for (const file of files) {
			if (file.type !== "file" || file.storageId || !file.content) continue;

			const filePath = getFilePath(file, fileMap);
			container.fs.writeFile(filePath, file.content);
		}
	}, [files, status]);

	// Resetar quando estiver desabilitado
	useEffect(() => {
		if (!enabled) {
			hasStartedRef.current = false;
			setStatus("idle");
			setPreviewUrl(null);
			setError(null);
		}
	}, [enabled]);

	// Reiniciar todo o processo do WebContainer
	const restart = useCallback(() => {
		tearDownWebContainer();
		containerRef.current = null;
		hasStartedRef.current = false;
		setStatus("idle");
		setPreviewUrl(null);
		setError(null);
		setRestartKey((k) => k + 1);
	}, []);

	return {
		status,
		previewUrl,
		error,
		restart,
		terminalOutput,
	};
};
