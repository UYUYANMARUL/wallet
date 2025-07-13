import { browser } from "webextension-polyfill-ts";
import OpenAI from "openai";
import { z } from "zod";
import tokens from "./tokens.json";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  Contract,
  formatUnits,
  JsonRpcProvider,
  parseUnits,
  Wallet,
} from "ethers";
import routerAbi from "./router_abi.json";

const ERC20_ABI = [
  // Read-only functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",

  // State-changing functions
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

const RPC_URL = "https://spicy-rpc.chiliz.com";
const CONTRACT_ADDRESS = "0x94448122c3F4276CDFA8C190249da4C1c736eEab";

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
      { symbol: "CHZ", name: "Chiliz", balance: 5.5 },
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

  private async handleSwap(args: any) {
    const { tokenIn, tokenOut, amountIn, slippage = 0.005 } = args;
    const { privateKey } = await browser.storage.sync.get(["privateKey"]);
    const provider = new JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(privateKey, provider);
    const router = new Contract(CONTRACT_ADDRESS, routerAbi, wallet);

    // Validate inputs
    const tokenInData = tokens.find((t) => t.symbol === tokenIn);
    const tokenOutData = tokens.find((t) => t.symbol === tokenOut);

    if (!tokenInData) {
      throw new Error(`Token ${tokenIn} not found`);
    }
    if (!tokenOutData) {
      throw new Error(`Token ${tokenOut} not found`);
    }

    // Get current balance from blockchain
    let currentBalance;
    const isEthIn = tokenIn === "ETH" || tokenIn === "WETH";

    if (isEthIn) {
      // Get ETH balance
      const ethBalance = await provider.getBalance(wallet.address);
      currentBalance = parseFloat(formatUnits(ethBalance, 18));
    } else {
      // Get ERC20 token balance
      // const tokenContract = new Contract(
      //   tokenInData.address,
      //   ERC20_ABI,
      //   wallet,
      // );
      // const tokenBalance = await tokenContract.balanceOf(wallet.address);
      // const decimals = await tokenContract.decimals();
      // currentBalance = parseFloat(formatUnits(tokenBalance, decimals));
    }

    // if (currentBalance < amountIn) {
    //   throw new Error(
    //     `Insufficient ${tokenIn} balance. Available: ${currentBalance}, Requested: ${amountIn}`,
    //   );
    // }

    const inToken = tokens.find((token) => token.symbol == tokenIn);
    const outToken = tokens.find((token) => token.symbol == tokenOut);
    const inputTokenAddress = inToken?.address;
    const outputTokenAddress = outToken?.address;

    if (!inputTokenAddress) {
      throw new Error(`Token ${tokenIn} not found`);
    }
    if (!outputTokenAddress) {
      throw new Error(`Token ${tokenOut} not found`);
    }

    const to = wallet.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

    // Check if we're dealing with ETH
    const isEthOut = tokenOut === "ETH" || tokenOut === "WETH";

    let tx;

    if (isEthIn && !isEthOut) {
      // ETH to Token swap
      const parsedAmountIn = parseUnits(amountIn.toString(), 18); // ETH has 18 decimals

      // Get output token decimals for amountOutMin calculation
      const outTokenContract = new Contract(
        outputTokenAddress,
        ERC20_ABI,
        wallet,
      );
      const outDecimals = await outTokenContract.decimals();

      let amountOutMin;
      try {
        amountOutMin = parseUnits("0.001", outDecimals);
      } catch (error) {
        console.log("Decimal error, setting amountOutMin to 0");
        amountOutMin = 0n;
      }

      const path = [inputTokenAddress, outputTokenAddress];
      const isTokenInWrapped = false;
      const receiveUnwrappedToken = false;

      tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        isTokenInWrapped,
        receiveUnwrappedToken,
        to,
        deadline,
        { value: parsedAmountIn },
      );
    } else if (!isEthIn && isEthOut) {
      // Token to ETH swap
      const erc20 = new Contract(inputTokenAddress, ERC20_ABI, wallet);
      const decimals = await erc20.decimals();
      const parsedAmountIn = parseUnits(amountIn.toString(), decimals);

      // Check and approve token spending if needed
      const allowance = await erc20.allowance(wallet.address, CONTRACT_ADDRESS);
      if (allowance < parsedAmountIn) {
        console.log("Approving token spending...");
        const approveTx = await erc20.approve(CONTRACT_ADDRESS, parsedAmountIn);
        await approveTx.wait();
      }

      let amountOutMin;
      try {
        amountOutMin = parseUnits("0.001", 18); // ETH has 18 decimals
      } catch (error) {
        console.log("Decimal error, setting amountOutMin to 0");
        amountOutMin = 0n;
      }

      const path = [inputTokenAddress, outputTokenAddress];
      const isTokenInWrapped = false;
      const receiveUnwrappedToken = true; // We want to receive ETH, not WETH

      tx = await router.swapExactTokensForETH(
        parsedAmountIn,
        amountOutMin,
        path,
        isTokenInWrapped,
        receiveUnwrappedToken,
        to,
        deadline,
      );
    } else if (!isEthIn && !isEthOut) {
      // Token to Token swap (your original logic)
      const erc20 = new Contract(inputTokenAddress, ERC20_ABI, wallet);
      const decimals = await erc20.decimals();
      const parsedAmountIn = parseUnits(amountIn.toString(), decimals);

      // Check and approve token spending if needed
      const allowance = await erc20.allowance(wallet.address, CONTRACT_ADDRESS);
      if (allowance < parsedAmountIn) {
        console.log("Approving token spending...");
        const approveTx = await erc20.approve(CONTRACT_ADDRESS, parsedAmountIn);
        await approveTx.wait();
      }

      let amountOutMin;
      try {
        amountOutMin = parseUnits("0.001", decimals);
      } catch (error) {
        console.log("Decimal error, setting amountOutMin to 0");
        amountOutMin = 0n;
      }

      const path = [inputTokenAddress, outputTokenAddress];
      const isTokenInWrapped = false;
      const receiveUnwrappedToken = false;

      tx = await router.swapExactTokensForTokens(
        parsedAmountIn,
        amountOutMin,
        path,
        isTokenInWrapped,
        receiveUnwrappedToken,
        to,
        deadline,
      );
    } else {
      // ETH to ETH (shouldn't happen, but just in case)
      throw new Error("Cannot swap ETH to ETH");
    }

    console.log("Swap transaction sent! Tx hash:", tx.hash);
    const res = await tx.wait();

    const swapResult = {
      success: true,
      tokenIn,
      tokenOut,
      amountIn,
      tx: res,
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
  private async handleSend(args: any) {
    const { token, amount, recipient } = args;
    const { privateKey } = await browser.storage.sync.get(["privateKey"]);
    const provider = new JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(privateKey, provider);

    // Validate inputs
    const tokenData = tokens.find((t) => t.symbol === token);
    if (!tokenData) {
      throw new Error(`Token ${token} not found`);
    }
    // if (tokenData.balance < amount) {
    //   throw new Error(
    //     `Insufficient ${token} balance. Available: ${tokenData.balance}`,
    //   );
    // }
    if (!recipient || recipient.length < 10) {
      throw new Error("Invalid recipient address");
    }

    console.log(token);

    // Find token in the tokens array
    const tokenInfo = tokens.find((t) => t.symbol == token);

    console.log(tokenInfo);
    if (!tokenInfo) {
      throw new Error(`Token ${token} not found in tokens list`);
    }

    let tx;
    let decimals;

    // Check if it's a native token (ETH, BNB, etc.)
    const isNativeToken =
      tokenInfo.address === "0x0000000000000000000000000000000000000000" ||
      tokenInfo.address.toLowerCase() ===
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    if (isNativeToken) {
      // Handle native token transfer
      decimals = 18; // Native tokens typically have 18 decimals
      const parsedAmount = parseUnits(amount.toString(), decimals);

      tx = await wallet.sendTransaction({
        to: recipient,
        value: parsedAmount,
      });
    } else {
      // Handle ERC20 token transfer
      const erc20 = new Contract(tokenInfo.address, ERC20_ABI, wallet);
      decimals = await erc20.decimals();
      const parsedAmount = parseUnits(amount.toString(), decimals);

      tx = await erc20.transfer(recipient, parsedAmount);
    }

    console.log("Send transaction submitted! Tx hash:", tx.hash);

    // Wait for transaction confirmation
    const res = await tx.wait();

    const sendResult = {
      success: true,
      token,
      amount,
      recipient,
      tx: res,
      txHash: res.hash,
      timestamp: new Date().toISOString(),
      gasUsed: res.gasUsed?.toString() || "0",
      isNativeToken,
      scanner: "https://testnet.chiliscan.com/",
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
