import { Extension } from "@codemirror/state";
import { showMinimap } from "@replit/codemirror-minimap";

const createMinimap = () => {
  const dom = document.createElement("div");
  return { dom };
};

export const minimap = (): Extension => {
  const minimapconst = showMinimap.compute(["doc"], () => {
    return {
      create: createMinimap,
    };
  });

  return minimapconst;
};
