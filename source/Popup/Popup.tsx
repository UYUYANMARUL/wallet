import * as React from "react";
import { browser } from "webextension-polyfill-ts";
import { ethers } from "ethers";

interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
}

interface ApiResponse {
  success: boolean;
  response?: string;
  tools?: Tool[];
  resources?: Resource[];
  connected?: boolean;
  result?: any;
  error?: string;
}

interface WalletInfo {
  address: string;
  balance: string;
  privateKey: string;
}

interface Token {
  symbol: string;
  name: string;
  balance: string;
  address: string;
}

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: Date;
  status: "pending" | "confirmed" | "failed";
}

const Popup: React.FC = () => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputMessage, setInputMessage] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [privateKey, setPrivateKey] = React.useState("");
  const [showSettings, setShowSettings] = React.useState(false);
  const [tools, setTools] = React.useState<Tool[]>([]);
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [isConnected, setIsConnected] = React.useState(false);
  const [showToolsPanel, setShowToolsPanel] = React.useState(false);

  // Wallet states
  const [walletInfo, setWalletInfo] = React.useState<WalletInfo | null>(null);
  const [activeTab, setActiveTab] = React.useState<
    "wallet" | "send" | "swap" | "chat"
  >("wallet");
  const [walletSection, setWalletSection] = React.useState<
    "tokens" | "nfts" | "history"
  >("tokens");
  const [tokens, setTokens] = React.useState<Token[]>([]);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [showWalletDetails, setShowWalletDetails] = React.useState(false);
  const [sendToAddress, setSendToAddress] = React.useState("");
  const [sendAmount, setSendAmount] = React.useState("");

  React.useEffect(() => {
    loadApiKey();
    loadMCPData();
    initializeWallet();
  }, []);

  const initializeWallet = async (): Promise<void> => {
    try {
      const result = await browser.storage.sync.get(["privateKey"]);

      if (result.privateKey) {
        setPrivateKey(result.privateKey);
        await loadWalletInfo(result.privateKey);
      } else {
        // Generate new wallet
        const wallet = ethers.Wallet.createRandom();
        const newPrivateKey = wallet.privateKey;

        await browser.storage.sync.set({ privateKey: newPrivateKey });
        setPrivateKey(newPrivateKey);
        await loadWalletInfo(newPrivateKey);
      }
    } catch (error) {
      console.error("Failed to initialize wallet:", error);
    }
  };

  const loadWalletInfo = async (privKey: string): Promise<void> => {
    try {
      const wallet = new ethers.Wallet(privKey);
      const address = wallet.address;

      // For demo purposes, we'll use a mock provider
      // In production, you'd connect to a real provider like Infura
      const balance = "0.5234"; // Mock balance

      setWalletInfo({
        address,
        balance,
        privateKey: privKey,
      });

      // Mock tokens
      setTokens([
        {
          symbol: "ETH",
          name: "Ethereum",
          balance: "0.5234",
          address: "0x...",
        },
        {
          symbol: "USDC",
          name: "USD Coin",
          balance: "100.00",
          address: "0x...",
        },
        {
          symbol: "LINK",
          name: "Chainlink",
          balance: "25.75",
          address: "0x...",
        },
      ]);

      // Mock transactions
      setTransactions([
        {
          hash: "0x1234...",
          from: address,
          to: "0x5678...",
          value: "0.1",
          timestamp: new Date(),
          status: "confirmed",
        },
        {
          hash: "0x5678...",
          from: "0x9abc...",
          to: address,
          value: "0.05",
          timestamp: new Date(Date.now() - 86400000),
          status: "confirmed",
        },
      ]);
    } catch (error) {
      console.error("Failed to load wallet info:", error);
    }
  };

  const loadApiKey = async (): Promise<void> => {
    try {
      const result = await browser.storage.sync.get(["openaiApiKey"]);
      if (result.openaiApiKey) {
        setApiKey(result.openaiApiKey);
      }
    } catch (error) {
      console.error("Failed to load API key:", error);
    }
  };

  const loadMCPData = async (): Promise<void> => {
    try {
      const [toolsResponse, resourcesResponse] = await Promise.all([
        browser.runtime.sendMessage({
          action: "getTools",
        }) as Promise<ApiResponse>,
        browser.runtime.sendMessage({
          action: "getResources",
        }) as Promise<ApiResponse>,
      ]);

      if (toolsResponse.success && toolsResponse.tools) {
        setTools(toolsResponse.tools);
        setIsConnected(toolsResponse.connected || false);
      }

      if (resourcesResponse.success && resourcesResponse.resources) {
        setResources(resourcesResponse.resources);
      }
    } catch (error) {
      console.error("Failed to load MCP data:", error);
    }
  };

  const saveApiKey = async (): Promise<void> => {
    try {
      const response = (await browser.runtime.sendMessage({
        action: "setApiKey",
        apiKey,
      })) as ApiResponse;

      if (response.success) {
        setShowSettings(false);
        addMessage("API key saved successfully!", "assistant");
      } else {
        addMessage("Failed to save API key", "assistant");
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      addMessage("Failed to save API key", "assistant");
    }
  };

  const connectToMCP = async (): Promise<void> => {
    try {
      const response = (await browser.runtime.sendMessage({
        action: "connectMCP",
      })) as ApiResponse;
      if (response.success) {
        setIsConnected(true);
        addMessage("Connected to MCP server!", "assistant");
        await loadMCPData();
      } else {
        addMessage("Failed to connect to MCP server", "assistant");
      }
    } catch (error) {
      console.error("Failed to connect to MCP:", error);
      addMessage("Error connecting to MCP server", "assistant");
    }
  };

  const addMessage = (text: string, sender: "user" | "assistant"): void => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const sendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    addMessage(userMessage, "user");
    setIsLoading(true);

    try {
      const response = (await browser.runtime.sendMessage({
        action: "sendMessage",
        message: userMessage,
      })) as ApiResponse;

      if (response.success && response.response) {
        addMessage(response.response, "assistant");
      } else {
        addMessage(
          "Sorry, there was an error processing your message.",
          "assistant",
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      addMessage(
        "Sorry, there was an error sending your message.",
        "assistant",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTransaction = async (): Promise<void> => {
    if (!sendToAddress || !sendAmount || !walletInfo) return;

    try {
      setIsLoading(true);
      // Mock transaction sending
      const newTransaction: Transaction = {
        hash: "0x" + Math.random().toString(16).substr(2, 8) + "...",
        from: walletInfo.address,
        to: sendToAddress,
        value: sendAmount,
        timestamp: new Date(),
        status: "pending",
      };

      setTransactions((prev) => [newTransaction, ...prev]);
      setSendToAddress("");
      setSendAmount("");

      // Simulate confirmation after 3 seconds
      setTimeout(() => {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.hash === newTransaction.hash
              ? { ...tx, status: "confirmed" as const }
              : tx,
          ),
        );
      }, 3000);
    } catch (error) {
      console.error("Error sending transaction:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const callTool = async (toolName: string, args: any = {}): Promise<void> => {
    try {
      setIsLoading(true);
      const response = (await browser.runtime.sendMessage({
        action: "callTool",
        toolName,
        args,
      })) as ApiResponse;

      if (response.success && response.result) {
        const result = JSON.parse(response.result.content[0].text);
        addMessage(
          `Tool "${toolName}" result: ${JSON.stringify(result, null, 2)}`,
          "assistant",
        );
      } else {
        addMessage(`Failed to call tool "${toolName}"`, "assistant");
      }
    } catch (error) {
      console.error("Error calling tool:", error);
      addMessage(`Error calling tool "${toolName}"`, "assistant");
    } finally {
      setIsLoading(false);
    }
  };

  const readResource = async (uri: string): Promise<void> => {
    try {
      setIsLoading(true);
      const response = (await browser.runtime.sendMessage({
        action: "readResource",
        uri,
      })) as ApiResponse;

      if (response.success && response.result) {
        const content = response.result.contents[0].text;
        addMessage(`Resource "${uri}" content: ${content}`, "assistant");
      } else {
        addMessage(`Failed to read resource "${uri}"`, "assistant");
      }
    } catch (error) {
      console.error("Error reading resource:", error);
      addMessage(`Error reading resource "${uri}"`, "assistant");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  if (showSettings) {
    return (
      <div className="w-96 bg-gray-900 text-white min-h-screen">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">Settings</h3>
          <button
            className="text-gray-400 hover:text-white text-xl leading-none"
            onClick={() => setShowSettings(false)}
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="apiKey"
              className="block text-sm font-medium text-gray-300"
            >
              OpenAI API Key:
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your OpenAI API key"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              onClick={saveApiKey}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-gray-900 text-white min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold">Wallet Assistant</h2>
        <div className="flex items-center space-x-3">
          <div
            className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-full ${
              isConnected
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            ></span>
            <span>MCP</span>
          </div>
          <button
            className="text-gray-400 hover:text-white text-lg transition-colors"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Wallet Profile Section */}
      {walletInfo && (
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl">
              👤
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span
                  className="text-sm text-gray-300 cursor-pointer hover:text-white transition-colors"
                  onClick={() => copyToClipboard(walletInfo.address)}
                >
                  {formatAddress(walletInfo.address)}
                </span>
                <button
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                  onClick={() => copyToClipboard(walletInfo.address)}
                >
                  📋
                </button>
              </div>
              <div className="space-y-1">
                <div className="text-xl font-bold">
                  {walletInfo.balance} ETH
                </div>
                <div className="text-sm text-gray-400">≈ $1,234.56</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              className={`py-2 px-3 rounded-lg font-medium transition-colors ${
                activeTab === "send"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
              onClick={() => setActiveTab("send")}
            >
              Send
            </button>
            <button
              className={`py-2 px-3 rounded-lg font-medium transition-colors ${
                activeTab === "swap"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
              onClick={() => setActiveTab("swap")}
            >
              Swap
            </button>
            <button
              className={`py-2 px-3 rounded-lg font-medium transition-colors ${
                activeTab === "chat"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 flex flex-col">
        {activeTab === "send" && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <button
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setActiveTab("wallet")}
              >
                ← Back
              </button>
              <h3 className="font-semibold">Send ETH</h3>
              <div></div>
            </div>
            <div className="flex-1 p-4 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  To Address:
                </label>
                <input
                  type="text"
                  value={sendToAddress}
                  onChange={(e) => setSendToAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Amount (ETH):
                </label>
                <input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.0"
                  step="0.001"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
                onClick={handleSendTransaction}
                disabled={!sendToAddress || !sendAmount || isLoading}
              >
                {isLoading ? "Sending..." : "Send Transaction"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "swap" && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <button
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setActiveTab("wallet")}
              >
                ← Back
              </button>
              <h3 className="font-semibold">Swap Tokens</h3>
              <div></div>
            </div>
            <div className="flex-1 p-4 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  From:
                </label>
                <select className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option>ETH</option>
                  <option>USDC</option>
                  <option>LINK</option>
                </select>
              </div>
              <div className="flex justify-center py-2">
                <div className="text-2xl text-gray-400">⇅</div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  To:
                </label>
                <select className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option>USDC</option>
                  <option>ETH</option>
                  <option>LINK</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Amount:
                </label>
                <input
                  type="number"
                  placeholder="0.0"
                  step="0.001"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors">
                Swap Tokens
              </button>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <button
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setActiveTab("wallet")}
              >
                ← Back
              </button>
              <h3 className="font-semibold">Chat Assistant</h3>
              <button
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setShowToolsPanel(!showToolsPanel)}
                title="Show Tools & Resources"
              >
                🔧
              </button>
            </div>

            {showToolsPanel && (
              <div className="border-b border-gray-700 bg-gray-800 p-4 space-y-4 max-h-64 overflow-y-auto">
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-300">Available Tools</h4>
                  {tools.length === 0 ? (
                    <p className="text-sm text-gray-500">No tools available</p>
                  ) : (
                    <div className="space-y-2">
                      {tools.map((tool) => (
                        <div
                          key={tool.name}
                          className="bg-gray-700 rounded-lg p-3"
                        >
                          <div className="font-medium text-sm">{tool.name}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {tool.description}
                          </div>
                          <button
                            onClick={() => callTool(tool.name)}
                            className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs px-3 py-1 rounded transition-colors"
                            disabled={isLoading}
                          >
                            Call
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-gray-300">
                    Available Resources
                  </h4>
                  {resources.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No resources available
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {resources.map((resource) => (
                        <div
                          key={resource.uri}
                          className="bg-gray-700 rounded-lg p-3"
                        >
                          <div className="font-medium text-sm">
                            {resource.name}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {resource.uri}
                          </div>
                          {resource.description && (
                            <div className="text-xs text-gray-500 mt-1">
                              {resource.description}
                            </div>
                          )}
                          <button
                            onClick={() => readResource(resource.uri)}
                            className="mt-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-xs px-3 py-1 rounded transition-colors"
                            disabled={isLoading}
                          >
                            Read
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!isConnected && (
                  <div className="pt-2">
                    <button
                      onClick={connectToMCP}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg transition-colors"
                    >
                      Connect to MCP Server
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="mb-2">Welcome to your wallet assistant!</p>
                  <p className="text-sm">
                    Ask me about your transactions, balances, or crypto
                    questions.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          message.sender === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-100"
                        }`}
                      >
                        <div className="text-sm">{message.text}</div>
                        <div className="text-xs opacity-70 mt-1">
                          {formatTimestamp(message.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-gray-100 max-w-xs px-4 py-2 rounded-lg">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-700">
              <div className="flex space-x-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about your wallet..."
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {isLoading ? "⏳" : "📤"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Section Navigation - Only show on wallet tab */}
        {activeTab === "wallet" && (
          <div className="border-t border-gray-700">
            <div className="flex bg-gray-800">
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  walletSection === "tokens"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
                onClick={() => setWalletSection("tokens")}
              >
                Tokens
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  walletSection === "nfts"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
                onClick={() => setWalletSection("nfts")}
              >
                NFTs
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  walletSection === "history"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
                onClick={() => setWalletSection("history")}
              >
                History
              </button>
            </div>

            <div className="p-4 max-h-64 overflow-y-auto">
              {walletSection === "tokens" && (
                <div className="space-y-3">
                  {tokens.map((token) => (
                    <div
                      key={token.symbol}
                      className="flex items-center p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-lg mr-3">
                        🪙
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{token.symbol}</div>
                        <div className="text-sm text-gray-400">
                          {token.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{token.balance}</div>
                        <div className="text-sm text-gray-400">
                          {token.symbol}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {walletSection === "nfts" && (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">🖼️</div>
                  <p className="text-gray-400">No NFTs found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Your NFT collection will appear here
                  </p>
                </div>
              )}

              {walletSection === "history" && (
                <div className="space-y-3">
                  {transactions.map((tx) => (
                    <div
                      key={tx.hash}
                      className="flex items-center p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mr-3 ${
                          tx.from === walletInfo?.address
                            ? "bg-red-900 text-red-300"
                            : "bg-green-900 text-green-300"
                        }`}
                      >
                        {tx.from === walletInfo?.address ? "📤" : "📥"}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm">
                          <span className="text-gray-400">
                            {tx.from === walletInfo?.address
                              ? "To: "
                              : "From: "}
                          </span>
                          <span className="font-mono">
                            {formatAddress(
                              tx.from === walletInfo?.address ? tx.to : tx.from,
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatTimestamp(tx.timestamp)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-medium ${
                            tx.from === walletInfo?.address
                              ? "text-red-400"
                              : "text-green-400"
                          }`}
                        >
                          {tx.from === walletInfo?.address ? "-" : "+"}
                          {tx.value} ETH
                        </div>
                        <div
                          className={`text-xs px-2 py-1 rounded-full ${
                            tx.status === "confirmed"
                              ? "bg-green-900 text-green-300"
                              : tx.status === "pending"
                                ? "bg-yellow-900 text-yellow-300"
                                : "bg-red-900 text-red-300"
                          }`}
                        >
                          {tx.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Popup;
