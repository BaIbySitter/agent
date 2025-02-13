import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import { z } from 'zod';
import { AnalysisAgent } from '../agent/agent.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const router = Router();

// Check if environment variables are set
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const TransactionRequestSchema = z.object({
  status: z.enum(['blocked', 'approved', 'warning']),
  bot_reason: z.string(),
  reason: z.string(),
  txpayload: z.any(),
  safeAddress: z.string(),
  erc20TokenAddress: z.string(),
});

router.post('/analyze-transaction', async (req, res) => {
  try {
    const txRequest = TransactionRequestSchema.parse(req.body);
    const agent = req.app.locals.agent as AnalysisAgent;

    const { signature, agent_reason } = await agent.signExistingTransaction(txRequest);

    // Store in Supabase
    const { data, error } = await supabase
      .from('live_chat')
      .insert({
        owner: 'AI_agent',
        wallet: txRequest.safeAddress,
        messages: `Transaction Analysis - Status: ${signature ? "signed" : "not signed"}\nReason: ${txRequest.reason}\nAI Response: ${agent_reason}\nPayload: ${JSON.stringify(txRequest.txpayload)}`,
        timestamp: new Date().toISOString()
      });

    if (error) {
      console.error('Supabase error:', error);
    }

    res.json({ 
      status: signature ? "signed" : "not signed",
      agent_reason: agent_reason,
      signature: signature,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get('/health', (_, res) => {
  res.json({ status: 'healthy' });
});

export default router; 