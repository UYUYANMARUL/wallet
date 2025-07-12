import { browser } from "webextension-polyfill-ts";
import OpenAI from "openai";
import { z } from "zod";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

// Simple validation schemas
const SwapSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.number().positive(),
  slippage: z.number().min(0).max(1).default(0.005),
});

const SendSchema = z.object({
  token: z.string(),
  amount: z.number().positive(),
  recipient: z.string(),
});

interface Token {
  symbol: string;
  name: string;
  balance: number;
}

interface Pool {
  tokenA: string;
  tokenB: string;
  reserveA: number;
  reserveB: number;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
}

interface MCPMessage {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: any;
  result?: any;
  error?: any;
}

interface MessageRequest {
  action: string;
  message?: string;
  apiKey?: string;
  toolName?: string;
  args?: any;
  uri?: string;
}

class SwapSendMCPClient {
  private openai: OpenAI;
  private messageId = 0;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private isConnected = false;
  private tokens: Token[] = [];
  private pools: Pool[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: "",
      dangerouslyAllowBrowser: true,
    });

    this.initializeData();
    this.initializeApiKey();
  }

  private initializeData() {
    // User token balances
    this.tokens = [
      { symbol: "ETH", name: "Ethereum", balance: 5.5 },
      { symbol: "USDC", name: "USD Coin", balance: 10000 },
      { symbol: "USDT", name: "Tether", balance: 5000 },
      { symbol: "WBTC", name: "Wrapped Bitcoin", balance: 0.15 },
      { symbol: "UNI", name: "Uniswap", balance: 250 },
      { symbol: "LINK", name: "Chainlink", balance: 100 },
    ];

    // Liquidity pools (x * y = k)
    this.pools = [
      { tokenA: "ETH", tokenB: "USDC", reserveA: 1000, reserveB: 2400000 },
      { tokenA: "ETH", tokenB: "USDT", reserveA: 800, reserveB: 1920000 },
      { tokenA: "WBTC", tokenB: "ETH", reserveA: 50, reserveB: 1400 },
      { tokenA: "UNI", tokenB: "ETH", reserveA: 10000, reserveB: 350 },
      { tokenA: "LINK", tokenB: "ETH", reserveA: 5000, reserveB: 300 },
      { tokenA: "USDC", tokenB: "USDT", reserveA: 500000, reserveB: 500000 },
    ];
  }

  private async initializeApiKey() {
    try {
      const result = await browser.storage.sync.get(["openaiApiKey"]);
      if (result.openaiApiKey) {
        this.openai = new OpenAI({
          apiKey: result.openaiApiKey,
          dangerouslyAllowBrowser: true,
        });
      }
    } catch (error) {
      console.error("Failed to initialize API key:", error);
    }
  }

  async setApiKey(apiKey: string) {
    await browser.storage.sync.set({ openaiApiKey: apiKey });
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async connectToMCPServer(): Promise<boolean> {
    try {
      const initResponse = await this.sendMCPMessage("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "swap-send-client", version: "1.0.0" },
      });

      if (initResponse.result) {
        await this.sendMCPMessage("notifications/initialized", {}, true);

        const toolsResponse = await this.sendMCPMessage("tools/list", {});
        this.tools = toolsResponse.result?.tools || [];

        const resourcesResponse = await this.sendMCPMessage(
          "resources/list",
          {},
        );
        this.resources = resourcesResponse.result?.resources || [];

        this.isConnected = true;
        console.log("🔄 Connected to Swap & Send MCP Server");

        return true;
      }
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
    }

    return false;
  }

  private async sendMCPMessage(
    method: string,
    params: any = {},
    isNotification = false,
  ): Promise<any> {
    const message: MCPMessage = {
      jsonrpc: "2.0",
      method,
      params,
      id: isNotification ? undefined : this.messageId++,
    };

    return this.simulateMCPResponse(message);
  }

  private async simulateMCPResponse(message: MCPMessage): Promise<any> {
    switch (message.method) {
      case "initialize":
        return {
          result: {
            protocolVersion: "2025-03-26",
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true },
            },
            serverInfo: {
              name: "Swap & Send Server",
              version: "1.0.0",
              description: "Simple token swap and send functionality",
            },
          },
        };

      case "tools/list":
        return {
          result: {
            tools: [
              {
                name: "swap",
                description: "Swap tokens using AMM (x*y=k) formula",
                inputSchema: {
                  type: "object",
                  properties: {
                    tokenIn: {
                      type: "string",
                      description: "Input token symbol (e.g., ETH, USDC)",
                    },
                    tokenOut: {
                      type: "string",
                      description: "Output token symbol (e.g., ETH, USDC)",
                    },
                    amountIn: {
                      type: "number",
                      description: "Amount of input token to swap",
                    },
                    slippage: {
                      type: "number",
                      description:
                        "Slippage tolerance (0.005 = 0.5%, default: 0.005)",
                    },
                  },
                  required: ["tokenIn", "tokenOut", "amountIn"],
                },
              },
              {
                name: "send",
                description: "Send tokens to a recipient address",
                inputSchema: {
                  type: "object",
                  properties: {
                    token: {
                      type: "string",
                      description: "Token symbol to send (e.g., ETH, USDC)",
                    },
                    amount: {
                      type: "number",
                      description: "Amount of tokens to send",
                    },
                    recipient: {
                      type: "string",
                      description: "Recipient wallet address",
                    },
                  },
                  required: ["token", "amount", "recipient"],
                },
              },
              {
                name: "getBalances",
                description: "Get current token balances",
                inputSchema: {
                  type: "object",
                  properties: {},
                },
              },
            ],
          },
        };

      case "resources/list":
        return {
          result: {
            resources: [
              {
                uri: "wallet://balances",
                name: "Token Balances",
                description: "Current wallet token balances",
              },
              {
                uri: "dex://pools",
                name: "Liquidity Pools",
                description: "Available liquidity pools for swapping",
              },
            ],
          },
        };

      case "tools/call":
        return this.simulateToolCall(message.params);

      case "resources/read":
        return this.simulateResourceRead(message.params);

      default:
        return { result: {} };
    }
  }

  private async simulateToolCall(params: any): Promise<any> {
    try {
      switch (params.name) {
        case "swap":
          return this.handleSwap(params.arguments);

        case "send":
          return this.handleSend(params.arguments);

        case "getBalances":
          return this.handleGetBalances();

        default:
          return {
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "Tool not found" }),
                },
              ],
            },
          };
      }
    } catch (error) {
      return {
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error",
              }),
            },
          ],
        },
      };
    }
  }

  private handleSwap(args: any) {
    const { tokenIn, tokenOut, amountIn, slippage = 0.005 } = args;

    // Validate inputs
    const tokenInData = this.tokens.find((t) => t.symbol === tokenIn);
    const tokenOutData = this.tokens.find((t) => t.symbol === tokenOut);

    if (!tokenInData) {
      throw new Error(`Token ${tokenIn} not found`);
    }
    if (!tokenOutData) {
      throw new Error(`Token ${tokenOut} not found`);
    }
    if (tokenInData.balance < amountIn) {
      throw new Error(
        `Insufficient ${tokenIn} balance. Available: ${tokenInData.balance}`,
      );
    }

    // Find liquidity pool
    const pool = this.pools.find(
      (p) =>
        (p.tokenA === tokenIn && p.tokenB === tokenOut) ||
        (p.tokenA === tokenOut && p.tokenB === tokenIn),
    );

    if (!pool) {
      throw new Error(`No liquidity pool found for ${tokenIn}/${tokenOut}`);
    }

    // Determine swap direction
    const isTokenAToB = pool.tokenA === tokenIn;
    const reserveIn = isTokenAToB ? pool.reserveA : pool.reserveB;
    const reserveOut = isTokenAToB ? pool.reserveB : pool.reserveA;

    // AMM swap calculation: x * y = k
    const fee = 0.003; // 0.3% fee
    const amountInWithFee = amountIn * (1 - fee);
    const amountOut =
      (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);

    // Apply slippage protection
    const minimumAmountOut = amountOut * (1 - slippage);

    // Update balances
    tokenInData.balance -= amountIn;
    tokenOutData.balance += amountOut;

    // Update pool reserves
    if (isTokenAToB) {
      pool.reserveA += amountIn;
      pool.reserveB -= amountOut;
    } else {
      pool.reserveB += amountIn;
      pool.reserveA -= amountOut;
    }

    const swapResult = {
      success: true,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: Math.round(amountOut * 1000000) / 1000000,
      minimumAmountOut: Math.round(minimumAmountOut * 1000000) / 1000000,
      slippage,
      fee: amountIn * fee,
      priceImpact: ((amountIn / reserveIn) * 100).toFixed(4) + "%",
      newBalances: {
        [tokenIn]: tokenInData.balance,
        [tokenOut]: tokenOutData.balance,
      },
      txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      timestamp: new Date().toISOString(),
    };

    return {
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(swapResult),
          },
        ],
      },
    };
  }

  private handleSend(args: any) {
    const { token, amount, recipient } = args;

    // Validate inputs
    const tokenData = this.tokens.find((t) => t.symbol === token);
    if (!tokenData) {
      throw new Error(`Token ${token} not found`);
    }

    if (tokenData.balance < amount) {
      throw new Error(
        `Insufficient ${token} balance. Available: ${tokenData.balance}`,
      );
    }

    if (!recipient || recipient.length < 10) {
      throw new Error("Invalid recipient address");
    }

    // Execute send
    tokenData.balance -= amount;

    const sendResult = {
      success: true,
      token,
      amount,
      recipient,
      remainingBalance: tokenData.balance,
      txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      timestamp: new Date().toISOString(),
      gasUsed: Math.floor(Math.random() * 50000) + 21000, // Random gas between 21k-71k
    };

    return {
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(sendResult),
          },
        ],
      },
    };
  }

  private handleGetBalances() {
    return {
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              balances: this.tokens,
              totalTokens: this.tokens.length,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      },
    };
  }

  private async simulateResourceRead(params: any): Promise<any> {
    switch (params.uri) {
      case "wallet://balances":
        return {
          result: {
            contents: [
              {
                uri: "wallet://balances",
                text: JSON.stringify(this.tokens),
              },
            ],
          },
        };

      case "dex://pools":
        return {
          result: {
            contents: [
              {
                uri: "dex://pools",
                text: JSON.stringify(this.pools),
              },
            ],
          },
        };

      default:
        return {
          result: {
            error: { code: -32602, message: "Resource not found" },
          },
        };
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    const response = await this.sendMCPMessage("tools/call", {
      name,
      arguments: args,
    });

    return response.result;
  }

  async readResource(uri: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    const response = await this.sendMCPMessage("resources/read", { uri });
    return response.result;
  }

  async processMessage(message: string): Promise<string> {
    try {
      const openaiTools: ChatCompletionTool[] = this.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content:
            "You are a helpful DeFi assistant with access to swap and send tools. You can help users swap tokens using AMM pools, send tokens to recipients, and check balances. Always be clear about transaction details and risks.",
        },
        {
          role: "user",
          content: message,
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        tool_choice: "auto",
      });

      const responseMessage = completion.choices[0].message;

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolCall = responseMessage.tool_calls[0];
        const toolResult = await this.callTool(
          toolCall.function.name,
          JSON.parse(toolCall.function.arguments),
        );

        const followUpMessages: ChatCompletionMessageParam[] = [
          ...messages,
          responseMessage,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult.content[0].text),
          },
        ];

        const followUpCompletion = await this.openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: followUpMessages,
        });

        return (
          followUpCompletion.choices[0].message.content ||
          "Sorry, I could not process your request."
        );
      }

      return (
        responseMessage.content || "Sorry, I could not process your request."
      );
    } catch (error) {
      console.error("Error processing message:", error);
      return "Sorry, there was an error processing your request.";
    }
  }

  getAvailableTools(): MCPTool[] {
    return this.tools;
  }

  getAvailableResources(): MCPResource[] {
    return this.resources;
  }

  isServerConnected(): boolean {
    return this.isConnected;
  }
}

// Global MCP client instance
const mcpClient = new SwapSendMCPClient();

// Extension lifecycle
browser.runtime.onInstalled.addListener(async (): Promise<void> => {
  console.log("🦄 Swap & Send MCP Extension installed");
  await mcpClient.connectToMCPServer();
});

// Message handling from popup
interface MessageRequest {
  action: string;
  message?: string;
  apiKey?: string;
  toolName?: string;
  args?: any;
  uri?: string;
}

interface MessageResponse {
  success: boolean;
  response?: any;
  tools?: any[];
  resources?: any[];
  connected?: boolean;
  result?: any;
  error?: string;
}

browser.runtime.onMessage.addListener(
  async (request: MessageRequest, sender: any): Promise<MessageResponse> => {
    try {
      switch (request.action) {
        case "sendMessage":
          if (!request.message) {
            return { success: false, error: "No message provided" };
          }
          const response = await mcpClient.processMessage(request.message);
          return { success: true, response };

        case "setApiKey":
          if (!request.apiKey) {
            return { success: false, error: "No API key provided" };
          }
          await mcpClient.setApiKey(request.apiKey);
          return { success: true };

        case "getTools":
          return {
            success: true,
            tools: mcpClient.getAvailableTools(),
            connected: mcpClient.isServerConnected(),
          };

        case "getResources":
          return {
            success: true,
            resources: mcpClient.getAvailableResources(),
            connected: mcpClient.isServerConnected(),
          };

        case "connectMCP":
          const connected = await mcpClient.connectToMCPServer();
          return { success: connected };

        case "callTool":
          if (!request.toolName) {
            return { success: false, error: "No tool name provided" };
          }
          const toolResult = await mcpClient.callTool(
            request.toolName,
            request.args || {},
          );
          return { success: true, result: toolResult };

        case "readResource":
          if (!request.uri) {
            return { success: false, error: "No URI provided" };
          }
          const resourceResult = await mcpClient.readResource(request.uri);
          return { success: true, result: resourceResult };

        default:
          return { success: false, error: "Unknown action" };
      }
    } catch (error) {
      console.error("Background script error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  },
);

export { SwapSendMCPClient };
