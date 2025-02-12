import { DynamicTool } from "@langchain/core/tools";
function basicAnalysis(input) {
    return `Analyzing: ${input}`;
}
export function getTools() {
    return [
        new DynamicTool({
            name: "BasicAnalysis",
            description: "Analyze a given query and provide insights",
            func: async (input) => basicAnalysis(input),
        }),
    ];
}
