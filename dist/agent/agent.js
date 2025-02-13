import { ChatOpenAI } from "@langchain/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { getTools } from './tools.js';
import Safe, { EthersAdapter } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import SafeApiKit from '@safe-global/api-kit';
export class AnalysisAgent {
    apiKey;
    agentPrivateKey;
    rpcUrl;
    model;
    agent;
    safe;
    safeApiKit;
    aiAnalysis = "";
    constructor(apiKey, agentPrivateKey, rpcUrl) {
        this.apiKey = apiKey;
        this.agentPrivateKey = agentPrivateKey;
        this.rpcUrl = rpcUrl;
        this.model = new ChatOpenAI({
            modelName: "gpt-3.5-turbo",
            temperature: 0,
            openAIApiKey: apiKey,
        });
        // Initialize SafeApiKit
        this.safeApiKit = new SafeApiKit.default({
            //   txServiceUrl: 'https://safe-transaction.arbitrum.gnosis.io',
            chainId: 42161n // Arbitrum
        });
    }
    async initialize(safeAddress) {
        const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
        const signer = new ethers.Wallet(this.agentPrivateKey, provider);
        const ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: signer
        });
        // Initialize Safe instance
        this.safe = await Safe.default.create({
            ethAdapter,
            safeAddress
        });
        const tools = getTools();
        this.agent = await initializeAgentExecutorWithOptions(tools, this.model, { agentType: "chat-conversational-react-description", verbose: true });
    }
    async getPendingTransactions(safeAddress) {
        try {
            console.log('Fetching pending transactions for Safe:', safeAddress);
            const pendingTxs = await this.safeApiKit.getPendingTransactions(safeAddress);
            console.log('API Response:', pendingTxs);
            return pendingTxs.results;
        }
        catch (error) {
            if (error.message === 'Not Found') {
                console.log(`No pending transactions found for Safe: ${safeAddress}`);
                return [];
            }
            console.error('Full error:', error);
            throw error;
        }
    }
    async signAndExecuteTransaction(txRequest, pendingTx) {
        try {
            console.log('Signing transaction:', pendingTx.safeTxHash);
            // Sign the transaction hash
            const signature = await this.safe.signTransactionHash(pendingTx.safeTxHash);
            console.log('Generated signature:', signature);
            // Format the confirmation properly
            const signatureResponse = await this.safeApiKit.confirmTransaction(pendingTx.safeTxHash, signature.data // Just send the signature data directly
            );
            console.log('Confirmation response:', signatureResponse);
            // Check if we can execute
            const threshold = await this.safe.getThreshold();
            const signatures = await this.safeApiKit.getTransactionConfirmations(pendingTx.safeTxHash);
            console.log('Threshold:', threshold);
            console.log('Current signatures:', signatures.count);
            if (signatures.count >= threshold) {
                // Execute the transaction
                const executeTxResponse = await this.safe.executeTransaction(pendingTx);
                const receipt = await executeTxResponse.transactionResponse?.wait();
                console.log('Transaction executed:', receipt);
                return { signature: signature.data, receipt };
            }
            return { signature: signature.data, receipt: null };
        }
        catch (error) {
            console.error('Detailed error:', error);
            throw error;
        }
    }
    async signExistingTransaction(txRequest) {
        let signature = null;
        let agent_reason = "";
        try {
            await this.initialize(txRequest.safeAddress);
            // Get pending transactions
            const pendingTxs = await this.getPendingTransactions(txRequest.safeAddress);
            if (pendingTxs.length === 0) {
                agent_reason = "No pending transactions found for this Safe";
                return { signature: null, agent_reason };
            }
            const pendingTx = pendingTxs[0]; // Get first pending transaction
            // Process based on status
            if (txRequest.status === 'blocked') {
                agent_reason = `Transaction rejected: ${txRequest.bot_reason}`;
                return { signature: null, agent_reason };
            }
            if (txRequest.status === 'approved') {
                const { signature: sig, receipt } = await this.signAndExecuteTransaction(txRequest, pendingTx);
                signature = receipt?.transactionHash || sig;
                agent_reason = `Transaction approved: ${txRequest.bot_reason}`;
                return { signature, agent_reason };
            }
            // For warning status, analyze with AI first
            if (txRequest.status === 'warning') {
                const shouldSign = await this.analyzeSafeTransaction(txRequest);
                if (shouldSign) {
                    const { signature: sig, receipt } = await this.signAndExecuteTransaction(txRequest, pendingTx);
                    signature = receipt?.transactionHash || sig;
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
