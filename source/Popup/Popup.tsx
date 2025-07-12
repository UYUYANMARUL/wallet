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
      <div className="settings-container">
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="close-btn" onClick={() => setShowSettings(false)}>
            ×
          </button>
        </div>

        <div className="settings-content">
          <div className="form-group">
            <label htmlFor="apiKey">OpenAI API Key:</label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your OpenAI API key"
            />
          </div>

          <div className="button-group">
            <button onClick={saveApiKey} className="save-btn">
              Save
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="header">
        <h2>Wallet Assistant</h2>
        <div className="header-controls">
          <div
            className={`connection-status ${isConnected ? "connected" : "disconnected"}`}
          >
            {isConnected ? "🟢" : "🔴"} MCP
          </div>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Wallet Profile Section */}
      {walletInfo && (
        <div className="wallet-profile">
          <div className="profile-header">
            <div className="profile-icon">👤</div>
            <div className="profile-info">
              <div className="address-section">
                <span
                  className="address"
                  onClick={() => copyToClipboard(walletInfo.address)}
                >
                  {formatAddress(walletInfo.address)}
                </span>
                <button
                  className="copy-btn"
                  onClick={() => copyToClipboard(walletInfo.address)}
                >
                  📋
                </button>
              </div>
              <div className="balance">
                <span className="balance-amount">{walletInfo.balance} ETH</span>
                <span className="balance-usd">≈ $1,234.56</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              className={`action-btn ${activeTab === "send" ? "active" : ""}`}
              onClick={() => setActiveTab("send")}
            >
              Send
            </button>
            <button
              className={`action-btn ${activeTab === "swap" ? "active" : ""}`}
              onClick={() => setActiveTab("swap")}
            >
              Swap
            </button>
            <button
              className={`action-btn ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === "send" && (
        <div className="tab-content">
          <div className="tab-header">
            <button className="back-btn" onClick={() => setActiveTab("wallet")}>
              ← Back
            </button>
            <h3>Send ETH</h3>
          </div>
          <div className="send-section">
            <div className="form-group">
              <label>To Address:</label>
              <input
                type="text"
                value={sendToAddress}
                onChange={(e) => setSendToAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <div className="form-group">
              <label>Amount (ETH):</label>
              <input
                type="number"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                placeholder="0.0"
                step="0.001"
              />
            </div>
            <button
              className="send-transaction-btn"
              onClick={handleSendTransaction}
              disabled={!sendToAddress || !sendAmount || isLoading}
            >
              {isLoading ? "Sending..." : "Send Transaction"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "swap" && (
        <div className="tab-content">
          <div className="tab-header">
            <button className="back-btn" onClick={() => setActiveTab("wallet")}>
              ← Back
            </button>
            <h3>Swap Tokens</h3>
          </div>
          <div className="swap-section">
            <div className="swap-form">
              <div className="form-group">
                <label>From:</label>
                <select>
                  <option>ETH</option>
                  <option>USDC</option>
                  <option>LINK</option>
                </select>
              </div>
              <div className="swap-direction">⇅</div>
              <div className="form-group">
                <label>To:</label>
                <select>
                  <option>USDC</option>
                  <option>ETH</option>
                  <option>LINK</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount:</label>
                <input type="number" placeholder="0.0" step="0.001" />
              </div>
              <button className="swap-btn">Swap Tokens</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "chat" && (
        <div className="tab-content">
          <div className="tab-header">
            <button className="back-btn" onClick={() => setActiveTab("wallet")}>
              ← Back
            </button>
            <h3>Chat Assistant</h3>
            <button
              className="tools-btn"
              onClick={() => setShowToolsPanel(!showToolsPanel)}
              title="Show Tools & Resources"
            >
              🔧
            </button>
          </div>
          {showToolsPanel && (
            <div className="tools-panel">
              <div className="panel-section">
                <h4>Available Tools</h4>
                {tools.length === 0 ? (
                  <p className="no-items">No tools available</p>
                ) : (
                  <div className="tools-grid">
                    {tools.map((tool) => (
                      <div key={tool.name} className="tool-card">
                        <div className="tool-name">{tool.name}</div>
                        <div className="tool-description">
                          {tool.description}
                        </div>
                        <button
                          onClick={() => callTool(tool.name)}
                          className="tool-call-btn"
                          disabled={isLoading}
                        >
                          Call
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-section">
                <h4>Available Resources</h4>
                {resources.length === 0 ? (
                  <p className="no-items">No resources available</p>
                ) : (
                  <div className="resources-grid">
                    {resources.map((resource) => (
                      <div key={resource.uri} className="resource-card">
                        <div className="resource-name">{resource.name}</div>
                        <div className="resource-uri">{resource.uri}</div>
                        {resource.description && (
                          <div className="resource-description">
                            {resource.description}
                          </div>
                        )}
                        <button
                          onClick={() => readResource(resource.uri)}
                          className="resource-read-btn"
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
                <div className="connection-controls">
                  <button onClick={connectToMCP} className="connect-btn">
                    Connect to MCP Server
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="welcome-message">
                <p>Welcome to your wallet assistant!</p>
                <p>
                  Ask me about your transactions, balances, or crypto questions.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`message ${message.sender}`}>
                  <div className="message-content">
                    <div className="message-text">{message.text}</div>
                    <div className="message-time">
                      {formatTimestamp(message.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="message assistant loading">
                <div className="message-content">
                  <div className="message-text">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="input-container">
            <div className="input-wrapper">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your wallet..."
                disabled={isLoading}
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="send-btn"
              >
                {isLoading ? "⏳" : "📤"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Section Navigation - Only show on wallet tab */}
      {activeTab === "wallet" && (
        <div className="bottom-section">
          <div className="section-tabs">
            <button
              className={`tab ${walletSection === "tokens" ? "active" : ""}`}
              onClick={() => setWalletSection("tokens")}
            >
              Tokens
            </button>
            <button
              className={`tab ${walletSection === "nfts" ? "active" : ""}`}
              onClick={() => setWalletSection("nfts")}
            >
              NFTs
            </button>
            <button
              className={`tab ${walletSection === "history" ? "active" : ""}`}
              onClick={() => setWalletSection("history")}
            >
              History
            </button>
          </div>

          <div className="section-content">
            {walletSection === "tokens" && (
              <div className="tokens-list">
                {tokens.map((token) => (
                  <div key={token.symbol} className="token-item">
                    <div className="token-icon">🪙</div>
                    <div className="token-info">
                      <div className="token-symbol">{token.symbol}</div>
                      <div className="token-name">{token.name}</div>
                    </div>
                    <div className="token-balance">{token.balance}</div>
                  </div>
                ))}
              </div>
            )}

            {walletSection === "nfts" && (
              <div className="nfts-list">
                <p className="no-items">No NFTs found</p>
              </div>
            )}

            {walletSection === "history" && (
              <div className="history-list">
                {transactions.map((tx) => (
                  <div key={tx.hash} className="transaction-item">
                    <div className="tx-icon">
                      {tx.from === walletInfo?.address ? "📤" : "📥"}
                    </div>
                    <div className="tx-info">
                      <div className="tx-address">
                        {tx.from === walletInfo?.address ? "To" : "From"}:{" "}
                        {formatAddress(
                          tx.from === walletInfo?.address ? tx.to : tx.from,
                        )}
                      </div>
                      <div className="tx-time">
                        {formatTimestamp(tx.timestamp)}
                      </div>
                    </div>
                    <div className="tx-amount">
                      <span
                        className={
                          tx.from === walletInfo?.address ? "sent" : "received"
                        }
                      >
                        {tx.from === walletInfo?.address ? "-" : "+"}
                        {tx.value} ETH
                      </span>
                      <div className={`tx-status ${tx.status}`}>
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
  );
};

export default Popup;
