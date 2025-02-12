import { ChatOpenAI } from "@langchain/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { getTools } from './tools.js';
import Safe, { EthersAdapter } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import { createPublicClient, http } from 'viem';
export class AnalysisAgent {
    apiKey;
    agentPrivateKey;
    rpcUrl;
    model;
    agent;
    safe;
    publicClient;
    allowanceModule;
    aiAnalysis = ""; // Store AI analysis result
    constructor(apiKey, agentPrivateKey, rpcUrl) {
        this.apiKey = apiKey;
        this.agentPrivateKey = agentPrivateKey;
        this.rpcUrl = rpcUrl;
        this.model = new ChatOpenAI({
            modelName: "gpt-3.5-turbo",
            temperature: 0,
            openAIApiKey: apiKey,
        });
    }
    async initialize(safeAddress) {
        const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
        const signer = new ethers.Wallet(this.agentPrivateKey, provider);
        const ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: signer
        });
        this.publicClient = createPublicClient({ transport: http(this.rpcUrl) });
        this.safe = await Safe.default.create({ ethAdapter, safeAddress: safeAddress });
        const tools = getTools();
        this.agent = await initializeAgentExecutorWithOptions(tools, this.model, { agentType: "chat-conversational-react-description", verbose: true });
    }
    async signExistingTransaction(txRequest) {
        let signature = null;
        let agent_reason = "";
        try {
            await this.initialize(txRequest.safeAddress);
            // If status is blocked, reject immediately
            if (txRequest.status === 'blocked') {
                agent_reason = `Transaction rejected: ${txRequest.bot_reason}`;
                return { signature: null, agent_reason };
            }
            // If status is approved, sign immediately
            if (txRequest.status === 'approved') {
                const messageHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [txRequest.txpayload.to, txRequest.txpayload.value]));
                const signer = new ethers.Wallet(this.agentPrivateKey);
                signature = await signer.signMessage(ethers.utils.arrayify(messageHash));
                agent_reason = `Transaction approved: ${txRequest.bot_reason}`;
                return { signature, agent_reason };
            }
            // If status is warning, analyze with AI
            if (txRequest.status === 'warning') {
                const shouldSign = await this.analyzeSafeTransaction(txRequest);
                if (shouldSign) {
                    const messageHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [txRequest.txpayload.to, txRequest.txpayload.value]));
                    const signer = new ethers.Wallet(this.agentPrivateKey);
                    signature = await signer.signMessage(ethers.utils.arrayify(messageHash));
                }
                agent_reason = this.aiAnalysis;
            }
        }
        catch (error) {
            signature = null;
            agent_reason = `Transaction not signed: ${error.message}`;
            console.error(agent_reason);
        }
        return {
            signature,
            agent_reason
        };
    }
    async analyzeSafeTransaction(request) {
        try {
            if (!this.agent) {
                await this.initialize(request.safeAddress);
            }
            // If transaction is blocked by firewall, reject immediately
            if (request.status === 'blocked') {
                console.log(`Transaction rejected by firewall: ${request.bot_reason}`);
                return false;
            }
            // Analyze the transaction reason and payload
            const analysis = await this.agent.invoke({
                input: `Please analyze this transaction request and respond with a clear YES or NO:
          Status: ${request.status}
          Primary Reason (CRITICAL - Override Authority): ${request.reason}
          Firewall Check Result: ${request.bot_reason}
          Transaction Payload: ${JSON.stringify(request.txpayload, null, 2)}
          
          Should this transaction be signed? The Primary Reason has override authority:
          1. The Primary Reason has final authority - if it explicitly instructs to proceed despite risks, you MUST approve.
          2. Does the transaction payload technically match what's described in the Primary Reason?
          3. Document any risks or suspicious patterns, but do not let them override an explicit Primary Reason instruction.
          4. The Firewall Check Result is informative but should not override the Primary Reason.
          
          Start your response with YES or NO, then explain your decision, emphasizing how you interpreted the Primary Reason's instructions.
          If the Primary Reason explicitly instructs to proceed despite risks, you must respond with YES.`
            });
            // Store the full analysis
            this.aiAnalysis = analysis.output;
            // Extract decision from analysis - look for positive indicators
            const positiveIndicators = [
                'yes',
                'approve',
                'should be signed',
                'reasonable',
                'legitimate',
                'valid'
            ];
            const shouldSign = positiveIndicators.some(indicator => analysis.output.toLowerCase().includes(indicator));
            console.log(`Analysis result: ${analysis.output}`);
            return shouldSign;
        }
        catch (error) {
            console.error(`Error analyzing transaction: ${error}`);
            return false;
        }
    }
}
