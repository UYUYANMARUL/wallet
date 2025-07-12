import { browser } from "webextension-polyfill-ts";

class ChatIntegration {
  private isInitialized = false;
  private chatButton: HTMLElement | null = null;
  private chatContainer: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    if (this.isInitialized) return;

    // Wait for page to load
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        this.setupChatIntegration(),
      );
    } else {
      this.setupChatIntegration();
    }

    this.isInitialized = true;
  }

  private setupChatIntegration() {
    // Look for common chat input patterns
    this.detectChatInputs();

    // Add floating chat button
    this.addFloatingChatButton();

    // Listen for dynamic content changes
    this.observePageChanges();
  }

  private detectChatInputs() {
    const chatSelectors = [
      'input[type="text"]',
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]',
      ".chat-input",
      ".message-input",
      "#chat-input",
      '[placeholder*="message"]',
      '[placeholder*="chat"]',
      '[placeholder*="type"]',
    ];

    chatSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (this.isChatInput(element as HTMLElement)) {
          this.enhanceChatInput(element as HTMLElement);
        }
      });
    });
  }

  private isChatInput(element: HTMLElement): boolean {
    const text = element.textContent?.toLowerCase() || "";
    const placeholder =
      element.getAttribute("placeholder")?.toLowerCase() || "";
    const id = element.id.toLowerCase();
    const className = element.className.toLowerCase();

    const chatKeywords = [
      "chat",
      "message",
      "comment",
      "reply",
      "post",
      "input",
    ];

    return chatKeywords.some(
      (keyword) =>
        text.includes(keyword) ||
        placeholder.includes(keyword) ||
        id.includes(keyword) ||
        className.includes(keyword),
    );
  }

  private enhanceChatInput(inputElement: HTMLElement) {
    // Skip if already enhanced
    if (inputElement.dataset.mcpEnhanced) return;

    inputElement.dataset.mcpEnhanced = "true";

    // Add MCP button next to input
    const mcpButton = document.createElement("button");
    mcpButton.innerHTML = "🤖";
    mcpButton.title = "Enhance with MCP Assistant";
    mcpButton.style.cssText = `
      position: absolute;
      right: 5px;
      top: 50%;
      transform: translateY(-50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      color: white;
      cursor: pointer;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: transform 0.2s;
    `;

    mcpButton.addEventListener("mouseenter", () => {
      mcpButton.style.transform = "translateY(-50%) scale(1.1)";
    });

    mcpButton.addEventListener("mouseleave", () => {
      mcpButton.style.transform = "translateY(-50%) scale(1)";
    });

    mcpButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.enhanceMessage(inputElement);
    });

    // Position the button
    const parent = inputElement.parentElement;

    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.position === "static") {
        parent.style.position = "relative";
      }
      parent.appendChild(mcpButton);
    }
  }

  private async enhanceMessage(inputElement: HTMLElement) {
    const currentText = this.getInputValue(inputElement);

    if (!currentText.trim()) {
      this.showTooltip(inputElement, "Please type a message first");
      return;
    }

    try {
      // Show loading indicator
      this.showLoadingIndicator(inputElement);

      // Send message to background script for MCP processing
      const response = await browser.runtime.sendMessage({
        action: "sendMessage",
        message: `Enhance this message for better communication: "${currentText}"`,
      });

      if (response.success) {
        this.setInputValue(inputElement, response.response);
        this.showTooltip(inputElement, "Message enhanced!", "success");
      } else {
        this.showTooltip(inputElement, "Enhancement failed", "error");
      }
    } catch (error) {
      console.error("Error enhancing message:", error);
      this.showTooltip(inputElement, "Error occurred", "error");
    } finally {
      this.hideLoadingIndicator(inputElement);
    }
  }

  private getInputValue(element: HTMLElement): string {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return (element as HTMLInputElement).value;
    } else if (element.contentEditable === "true") {
      return element.textContent || "";
    }
    return "";
  }

  private setInputValue(element: HTMLElement, value: string) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      (element as HTMLInputElement).value = value;
      // Trigger input event to notify the page
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (element.contentEditable === "true") {
      element.textContent = value;
      // Trigger input event for contenteditable
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  private showLoadingIndicator(inputElement: HTMLElement) {
    const loader = document.createElement("div");
    loader.className = "mcp-loading-indicator";
    loader.innerHTML = "⏳";
    loader.style.cssText = `
      position: absolute;
      right: 40px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10001;
      animation: pulse 1s infinite;
    `;

    const parent = inputElement.parentElement;
    if (parent) {
      parent.appendChild(loader);
    }
  }

  private hideLoadingIndicator(inputElement: HTMLElement) {
    const parent = inputElement.parentElement;
    if (parent) {
      const loader = parent.querySelector(".mcp-loading-indicator");
      if (loader) {
        loader.remove();
      }
    }
  }

  private showTooltip(
    element: HTMLElement,
    message: string,
    type: "info" | "success" | "error" = "info",
  ) {
    const tooltip = document.createElement("div");
    tooltip.className = "mcp-tooltip";
    tooltip.textContent = message;

    const bgColor =
      type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#007bff";

    tooltip.style.cssText = `
      position: absolute;
      bottom: -40px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 10002;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: fadeInOut 3s forwards;
    `;

    const parent = element.parentElement;
    if (parent) {
      parent.appendChild(tooltip);
      setTimeout(() => tooltip.remove(), 3000);
    }
  }

  private addFloatingChatButton() {
    if (this.chatButton) return;

    this.chatButton = document.createElement("div");
    this.chatButton.innerHTML = "💬";
    this.chatButton.title = "Open MCP Chat Assistant";
    this.chatButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-size: 24px;
      transition: all 0.3s ease;
      user-select: none;
    `;

    this.chatButton.addEventListener("mouseenter", () => {
      if (this.chatButton) {
        this.chatButton.style.transform = "scale(1.1)";
        this.chatButton.style.boxShadow = "0 6px 16px rgba(0,0,0,0.4)";
      }
    });

    this.chatButton.addEventListener("mouseleave", () => {
      if (this.chatButton) {
        this.chatButton.style.transform = "scale(1)";
        this.chatButton.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      }
    });

    this.chatButton.addEventListener("click", () => {
      this.toggleChatContainer();
    });

    document.body.appendChild(this.chatButton);
    this.addCSSAnimations();
  }

  private toggleChatContainer() {
    if (this.chatContainer) {
      this.chatContainer.remove();
      this.chatContainer = null;
      return;
    }

    this.createChatContainer();
  }

  private createChatContainer() {
    this.chatContainer = document.createElement("div");
    this.chatContainer.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 400px;
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 10001;
      border: 1px solid #e0e0e0;
      overflow: hidden;
      animation: slideUp 0.3s ease;
    `;

    const iframe = document.createElement("iframe");
    iframe.src = browser.runtime.getURL("popup.html");
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 12px;
    `;

    this.chatContainer.appendChild(iframe);
    document.body.appendChild(this.chatContainer);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "×";
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0,0,0,0.1);
      border: none;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      cursor: pointer;
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: #666;
    `;

    closeBtn.addEventListener("click", () => {
      this.toggleChatContainer();
    });

    this.chatContainer.appendChild(closeBtn);
  }

  private addCSSAnimations() {
    if (document.getElementById("mcp-animations")) return;

    const style = document.createElement("style");
    style.id = "mcp-animations";
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
      
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
        20% { opacity: 1; transform: translateX(-50%) translateY(0); }
        80% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      }
      
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
  }

  private observePageChanges() {
    const observer = new MutationObserver(() => {
      // Debounce the detection to avoid excessive calls
      setTimeout(() => this.detectChatInputs(), 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

// Initialize chat integration
console.log("🤖 MCP Chat Integration loaded");
new ChatIntegration();

export {};
