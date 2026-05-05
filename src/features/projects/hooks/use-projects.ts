import { useQuery, useMutation } from "convex/react";

import { api } from "../../../..//convex/_generated/api";
import type { Id, Doc } from "../../../../convex/_generated/dataModel";

export const useProject = (projectId: Id<"projects">) => {
	return useQuery(api.projects.getById, { id: projectId });
};

export const useProjects = () => {
	return useQuery(api.projects.get);
};

export const useProjectsPartial = (limit: number) => {
	return useQuery(api.projects.getPartial, { limit });
};

export const useCreateProject = () => {
	return useMutation(api.projects.create).withOptimisticUpdate(
		(localStorage, args) => {
			const existingProjects = localStorage.getQuery(api.projects.get);
			if (existingProjects !== undefined) {
				const now = Date.now();
				const newProject = {
					_id: crypto.randomUUID() as Id<"projects">,
					_creationTime: now,
					name: args.name,
					ownerId: "anonymous",
					updatedAt: now,
				};
				localStorage.setQuery(api.projects.get, {}, [
					newProject,
					...existingProjects,
				]);
			}
		},
	);
};

export const useRenameProject = () => {
	return useMutation(api.projects.rename).withOptimisticUpdate(
		(localStorage, args) => {
			const existingProject = localStorage.getQuery(api.projects.getById, {
				id: args.id,
			});

			if (existingProject) {
				localStorage.setQuery(
					api.projects.getById,
					{ id: args.id },
					{
						...existingProject,
						name: args.name,
						updatedAt: Date.now(),
					},
				);
			}

			const existingProjects = localStorage.getQuery(api.projects.get);

			if (existingProjects) {
				localStorage.setQuery(
					api.projects.get,
					{},
					existingProjects.map((project) =>
						project._id === args.id
							? {
									...project,
									name: args.name,
									updatedAt: Date.now(),
								}
							: project,
					),
				);
			}
		},
	);
};

export const useUpdateProjectSettings = () => {
	// TODO: add optimistic mutation
	return useMutation(api.projects.updateSettings);
};
