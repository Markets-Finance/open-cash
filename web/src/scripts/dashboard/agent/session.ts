import { createToolbox, defaultLimits, runTool, type ToolOutcome } from "shared";
import { info } from "../../hl";
import { session } from "../state";

export const toolbox = createToolbox(info, defaultLimits, session.trader?.address);

export function run(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  return runTool(name, args, toolbox);
}
