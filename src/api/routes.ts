import { Router } from 'express';
import { z } from 'zod';
import { AnalysisAgent } from '../agent/agent.js';

const router = Router();

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