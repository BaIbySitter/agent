import express from 'express';
import dotenv from 'dotenv';
import routes from './api/routes.js';
import { AnalysisAgent } from './agent/agent.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize the agent
const agent = new AnalysisAgent(
  process.env.OPENAI_API_KEY!,
  process.env.AGENT_PRIVATE_KEY!,
  process.env.RPC_URL!,
);
// Initialize the agent before setting it
app.locals.agent = agent;

// Routes
app.use('/api/v1', routes);

const startServer = async () => {
  try {
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 