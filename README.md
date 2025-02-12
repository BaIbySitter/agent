# AI BAIBYSITTER

An intelligent agent that analyzes and signs blockchain transactions based on predefined rules and AI-powered analysis.

## Overview

This agent serves as a smart transaction signer for Safe (formerly Gnosis Safe) multisig wallets. It analyzes transaction requests and decides whether to sign them based on:

1. **Primary Reason (Override Authority)**: The main justification for the transaction, which has final authority
2. **Status**: Can be 'approved', 'blocked', or 'warning'
3. **Firewall Check Results**: Initial security checks
4. **AI Analysis**: Deep analysis of the transaction context

## Key Features

- **Intelligent Analysis**: Uses GPT to analyze transaction context and payload
- **Override Authority**: Primary Reason can override security warnings if explicitly stated
- **Multi-status Support**:
  - `approved`: Signs immediately
  - `blocked`: Rejects immediately
  - `warning`: Triggers AI analysis

## API Endpoints

### POST /api/v1/analyze-transaction

Analyzes and potentially signs a transaction.

json
{
"status": "warning",
"bot_reason": "Unusual transaction pattern detected",
"reason": "Emergency fund transfer needed despite unusual pattern",
"txpayload": {
"to": "0x...",
"value": "1000000000000000000",
"data": "0x"
},
"safeAddress": "0x...",
"erc20TokenAddress": "0x..."
}


#### Response

json
{
"status": "signed",
"agent_reason": "YES. Despite unusual pattern, Primary Reason explicitly authorizes...",
"signature": "0x...",
"timestamp": "2024-02-12T21:13:10.943Z"
}


## Setup

1. Clone the repository
2. Install dependencies:

bash
npm install

3. Set up environment variables:
env
OPENAI_API_KEY=your_openai_key
AGENT_PRIVATE_KEY=your_private_key
ARBITRUM_RPC_URL=your_arbitrum_rpc_url

4. Start the server:
bash
npm start



## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key
- `AGENT_PRIVATE_KEY`: Private key for signing transactions
- `ARBITRUM_RPC_URL`: Arbitrum RPC URL

## Networks Supported

Currently supports:
- Arbitrum One (Chain ID: 42161)

## Security Considerations

- The Primary Reason has override authority - ensure it comes from a trusted source
- Private keys should be securely managed
- Regular monitoring of agent decisions is recommended

## License

MIT
