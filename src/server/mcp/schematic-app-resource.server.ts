export const SCHEMATIC_APP_RESOURCE_URI =
  "ui://circuit-sim/schematic/v1.html"

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app"

/**
 * Dependency-free MCP App view for one render_schematic result.
 *
 * Circuit data stays on the server. The view receives a pinned resource URI,
 * reads that immutable SVG through the MCP Apps bridge, and owns only temporary
 * presentation state such as zoom.
 */
export const SCHEMATIC_APP_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Circuit Sim schematic</title>
    <style>
      :root {
        color-scheme: light dark;
        --card-bg: #f7f8fa;
        --panel-bg: #ffffff;
        --text: #17191c;
        --muted: #626a73;
        --border: #d9dde3;
        --control-bg: #ffffff;
        --control-hover: #eef1f4;
        --accent: #287a4b;
        --danger: #a23b32;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      :root[data-theme="dark"] {
        --card-bg: #17191c;
        --panel-bg: #0e1012;
        --text: #f2f4f6;
        --muted: #aab1ba;
        --border: #343940;
        --control-bg: #22262b;
        --control-hover: #2d3339;
        --accent: #76c893;
        --danger: #ff9b91;
      }

      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        min-width: 0;
        background: transparent;
        color: var(--text);
      }

      body { padding: 1px; }

      .card {
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--card-bg);
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px 10px;
      }

      .heading { min-width: 0; }

      .eyebrow {
        margin: 0 0 2px;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      h1 {
        overflow: hidden;
        margin: 0;
        font-size: 15px;
        font-weight: 650;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .controls {
        display: flex;
        flex: 0 0 auto;
        gap: 5px;
      }

      button {
        min-width: 32px;
        height: 30px;
        padding: 0 9px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--control-bg);
        color: var(--text);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      button:hover { background: var(--control-hover); }
      button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      button:disabled { cursor: default; opacity: .45; }

      .viewport {
        position: relative;
        min-height: 230px;
        max-height: 560px;
        margin: 0 10px;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: #ffffff;
        overscroll-behavior: contain;
      }

      .stage {
        display: grid;
        min-width: 100%;
        min-height: 228px;
        place-items: start;
      }

      .schematic {
        display: block;
        max-width: none;
        user-select: none;
        -webkit-user-drag: none;
      }

      .state {
        position: absolute;
        inset: 0;
        display: grid;
        padding: 28px;
        place-items: center;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
        text-align: center;
      }

      .state[data-kind="error"] { color: var(--danger); }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px 11px;
        color: var(--muted);
        font-size: 11px;
      }

      .metadata {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .open-button { flex: 0 0 auto; height: 28px; }
      [hidden] { display: none !important; }

      @media (max-width: 520px) {
        .header { align-items: flex-start; }
        .viewport { min-height: 200px; }
        .stage { min-height: 198px; }
        .footer { align-items: flex-start; flex-direction: column; }
      }

      @media (prefers-reduced-motion: reduce) {
        * { scroll-behavior: auto !important; }
      }
    </style>
  </head>
  <body>
    <main class="card" aria-labelledby="schematic-title">
      <header class="header">
        <div class="heading">
          <p class="eyebrow">Circuit Sim</p>
          <h1 id="schematic-title">Circuit schematic</h1>
        </div>
        <div class="controls" aria-label="Schematic zoom controls">
          <button id="zoom-out" type="button" aria-label="Zoom out" disabled>−</button>
          <button id="fit" type="button" disabled>Fit</button>
          <button id="zoom-in" type="button" aria-label="Zoom in" disabled>+</button>
        </div>
      </header>
      <section id="viewport" class="viewport" aria-label="Rendered circuit schematic">
        <div id="stage" class="stage">
          <img id="schematic" class="schematic" alt="" draggable="false" hidden>
        </div>
        <div id="state" class="state" role="status" aria-live="polite">
          Connecting to the circuit renderer…
        </div>
      </section>
      <footer class="footer">
        <span id="metadata" class="metadata">Waiting for a pinned snapshot</span>
        <button id="open" class="open-button" type="button" hidden>
          Open viewer
        </button>
      </footer>
    </main>

    <script>
      (() => {
        "use strict";

        const PROTOCOL_VERSION = "2026-01-26";
        const MAX_RESOURCE_URI_LENGTH = 2048;
        const MAX_SVG_BYTES = 1000000;
        const MAX_SVG_BASE64_LENGTH = 1400000;
        const MIN_SCALE = 0.2;
        const MAX_SCALE = 3;

        const viewport = document.getElementById("viewport");
        const stage = document.getElementById("stage");
        const image = document.getElementById("schematic");
        const state = document.getElementById("state");
        const title = document.getElementById("schematic-title");
        const metadata = document.getElementById("metadata");
        const zoomOut = document.getElementById("zoom-out");
        const fit = document.getElementById("fit");
        const zoomIn = document.getElementById("zoom-in");
        const openButton = document.getElementById("open");

        const pending = new Map();
        let nextRequestId = 1;
        let connected = false;
        let disposed = false;
        let loadVersion = 0;
        let naturalWidth = 960;
        let naturalHeight = 540;
        let scale = 1;
        let browserUrl;
        let resizeObserver;
        let resizeFrame;

        const isRecord = (value) =>
          typeof value === "object" && value !== null && !Array.isArray(value);

        const post = (message) => {
          if (!disposed) window.parent.postMessage(message, "*");
        };

        const notify = (method, params) => {
          post({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
        };

        const request = (method, params) => {
          if (disposed) return Promise.reject(new Error("The schematic view is closed."));
          const id = nextRequestId++;
          return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
              pending.delete(id);
              reject(new Error("The host did not answer " + method + "."));
            }, 15000);
            pending.set(id, { resolve, reject, timer });
            post({ jsonrpc: "2.0", id, method, params });
          });
        };

        const respond = (id, result) => {
          post({ jsonrpc: "2.0", id, result });
        };

        const failRequest = (id, code, message) => {
          post({ jsonrpc: "2.0", id, error: { code, message } });
        };

        const showState = (message, kind) => {
          state.textContent = message;
          state.dataset.kind = kind || "status";
          state.hidden = false;
        };

        const clearState = () => {
          state.hidden = true;
          state.textContent = "";
          delete state.dataset.kind;
        };

        const boundedText = (value, fallback, maximum) =>
          typeof value === "string" && value.length > 0 && value.length <= maximum
            ? value
            : fallback;

        const safeHttpUrl = (value) => {
          if (typeof value !== "string" || value.length > MAX_RESOURCE_URI_LENGTH) return;
          try {
            const parsed = new URL(value);
            return parsed.protocol === "https:" || parsed.protocol === "http:"
              ? parsed.href
              : undefined;
          } catch {
            return undefined;
          }
        };

        const parseDimension = (value, fallback) =>
          Number.isInteger(value) && value >= 1 && value <= 4096 ? value : fallback;

        const readVisual = (toolResult) => {
          if (!isRecord(toolResult)) throw new Error("The render result is missing.");
          if (toolResult.isError === true) {
            const block = Array.isArray(toolResult.content)
              ? toolResult.content.find((item) => isRecord(item) && item.type === "text")
              : undefined;
            throw new Error(boundedText(block && block.text, "Circuit rendering failed.", 512));
          }
          const structured = toolResult.structuredContent;
          if (!isRecord(structured) || !Array.isArray(structured.visuals)) {
            throw new Error("The render result has no schematic metadata.");
          }
          if (structured.visuals.length !== 1 || !isRecord(structured.visuals[0])) {
            throw new Error("The render result must identify exactly one schematic.");
          }
          const visual = structured.visuals[0];
          if (visual.kind !== "schematic" || visual.mimeType !== "image/svg+xml") {
            throw new Error("The render result is not a Circuit Sim schematic.");
          }
          if (
            typeof visual.uri !== "string" ||
            visual.uri.length > MAX_RESOURCE_URI_LENGTH ||
            !visual.uri.startsWith("circuit-sim://") ||
            !visual.uri.endsWith(".svg")
          ) {
            throw new Error("The schematic resource identity is invalid.");
          }
          const dimensions = isRecord(visual.dimensions) ? visual.dimensions : {};
          const snapshot = isRecord(visual.snapshot) ? visual.snapshot : {};
          return {
            uri: visual.uri,
            caption: boundedText(visual.caption, "Circuit schematic", 256),
            alt: boundedText(visual.alt, "Rendered circuit schematic", 512),
            width: parseDimension(dimensions.width, 960),
            height: parseDimension(dimensions.height, 540),
            browserUrl: safeHttpUrl(visual.browserUrl),
            snapshotId: boundedText(snapshot.snapshotId, "unknown", 256),
            circuitHash: boundedText(snapshot.circuitHash, "unknown", 256),
            focus: boundedText(visual.focus, "all", MAX_RESOURCE_URI_LENGTH),
            warnings: [
              ...(Array.isArray(visual.warnings) ? visual.warnings : []),
              ...(Array.isArray(visual.ercWarnings) ? visual.ercWarnings : []),
            ].filter((item) => typeof item === "string").slice(0, 64),
          };
        };

        const utf8ToBase64 = (text) => {
          const bytes = new TextEncoder().encode(text);
          if (bytes.byteLength > MAX_SVG_BYTES) throw new Error("The schematic SVG is too large.");
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 32768) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          }
          return btoa(binary);
        };

        const decodeBase64 = (encoded) => {
          if (
            typeof encoded !== "string" ||
            encoded.length === 0 ||
            encoded.length > MAX_SVG_BASE64_LENGTH ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
          ) {
            throw new Error("The schematic resource has invalid SVG data.");
          }
          const binary = atob(encoded);
          if (binary.length > MAX_SVG_BYTES) throw new Error("The schematic SVG is too large.");
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        };

        const validateSvg = (svgText) => {
          const documentResult = new DOMParser().parseFromString(svgText, "image/svg+xml");
          if (documentResult.querySelector("parsererror")) {
            throw new Error("The schematic resource is not valid SVG.");
          }
          const root = documentResult.documentElement;
          if (!root || root.localName !== "svg") {
            throw new Error("The schematic resource has no SVG root.");
          }
          if (documentResult.querySelector("script, foreignObject, iframe, object, embed, image, link")) {
            throw new Error("The schematic resource contains unsupported active content.");
          }
          for (const element of documentResult.querySelectorAll("*")) {
            for (const attribute of element.attributes) {
              const name = attribute.name.toLowerCase();
              const value = attribute.value.toLowerCase();
              if (
                name.startsWith("on") ||
                name === "href" ||
                name === "xlink:href" ||
                (name === "style" && (value.includes("url(") || value.includes("@import")))
              ) {
                throw new Error("The schematic resource contains an unsafe SVG attribute.");
              }
            }
          }
          for (const styleElement of documentResult.querySelectorAll("style")) {
            const css = (styleElement.textContent || "").toLowerCase();
            if (css.includes("url(") || css.includes("@import")) {
              throw new Error("The schematic resource contains an unsafe stylesheet.");
            }
          }
        };

        const readSvg = async (uri) => {
          const result = await request("resources/read", { uri });
          if (!isRecord(result) || !Array.isArray(result.contents)) {
            throw new Error("The host returned no schematic resource.");
          }
          const content = result.contents.find(
            (item) => isRecord(item) && item.uri === uri && item.mimeType === "image/svg+xml",
          );
          if (!isRecord(content)) throw new Error("The pinned schematic resource is unavailable.");
          const encoded = typeof content.blob === "string"
            ? content.blob
            : typeof content.text === "string"
              ? utf8ToBase64(content.text)
              : undefined;
          if (encoded === undefined) throw new Error("The schematic resource has no SVG body.");
          const svgText = decodeBase64(encoded);
          validateSvg(svgText);
          return encoded;
        };

        const applyScale = (nextScale) => {
          scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
          const width = Math.max(1, Math.round(naturalWidth * scale));
          const height = Math.max(1, Math.round(naturalHeight * scale));
          image.style.width = width + "px";
          image.style.height = height + "px";
          stage.style.width = width + "px";
          stage.style.height = height + "px";
          zoomOut.disabled = scale <= MIN_SCALE;
          zoomIn.disabled = scale >= MAX_SCALE;
        };

        const fitSchematic = () => {
          const available = Math.max(100, viewport.clientWidth - 24);
          applyScale(Math.min(1.5, available / naturalWidth));
          viewport.scrollTo({ left: 0, top: 0 });
        };

        const renderToolResult = async (toolResult) => {
          const version = ++loadVersion;
          try {
            const visual = readVisual(toolResult);
            title.textContent = visual.caption;
            image.alt = visual.alt;
            showState("Loading the pinned schematic…");
            const encoded = await readSvg(visual.uri);
            if (version !== loadVersion || disposed) return;
            naturalWidth = visual.width;
            naturalHeight = visual.height;
            image.src = "data:image/svg+xml;base64," + encoded;
            image.hidden = false;
            zoomOut.disabled = false;
            fit.disabled = false;
            zoomIn.disabled = false;
            browserUrl = visual.browserUrl;
            openButton.hidden = browserUrl === undefined;
            const shortHash = visual.circuitHash === "unknown"
              ? "unknown circuit"
              : visual.circuitHash.slice(0, 12);
            const focusLabel = visual.focus === "all" ? "whole circuit" : "focused view";
            const warningLabel = visual.warnings.length === 0
              ? ""
              : " · " + visual.warnings.length + " warning" + (visual.warnings.length === 1 ? "" : "s");
            metadata.textContent = shortHash + " · " + focusLabel + warningLabel;
            clearState();
            requestAnimationFrame(fitSchematic);
          } catch (error) {
            if (version !== loadVersion || disposed) return;
            image.hidden = true;
            fit.disabled = true;
            zoomOut.disabled = true;
            zoomIn.disabled = true;
            openButton.hidden = true;
            metadata.textContent = "Schematic unavailable";
            showState(error instanceof Error ? error.message : "The schematic could not be displayed.", "error");
          }
        };

        const applyHostContext = (context) => {
          if (!isRecord(context)) return;
          if (context.theme === "dark" || context.theme === "light") {
            document.documentElement.dataset.theme = context.theme;
          }
          const styles = isRecord(context.styles) ? context.styles : undefined;
          const variables = styles && isRecord(styles.variables) ? styles.variables : undefined;
          if (variables) {
            for (const [name, value] of Object.entries(variables)) {
              if (name.startsWith("--") && name.length <= 128 && typeof value === "string" && value.length <= 256) {
                document.documentElement.style.setProperty(name, value);
              }
            }
          }
        };

        const dispose = () => {
          if (disposed) return;
          disposed = true;
          loadVersion++;
          if (resizeObserver) resizeObserver.disconnect();
          if (resizeFrame) cancelAnimationFrame(resizeFrame);
          for (const entry of pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(new Error("The schematic view was closed."));
          }
          pending.clear();
        };

        window.addEventListener("message", (event) => {
          if (event.source !== window.parent) return;
          const message = event.data;
          if (!isRecord(message) || message.jsonrpc !== "2.0") return;

          if (message.method === undefined && message.id !== undefined && pending.has(message.id)) {
            const entry = pending.get(message.id);
            pending.delete(message.id);
            clearTimeout(entry.timer);
            if (isRecord(message.error)) {
              entry.reject(new Error(boundedText(message.error.message, "The host rejected the request.", 512)));
            } else {
              entry.resolve(message.result);
            }
            return;
          }

          if (message.method === "ui/notifications/tool-result") {
            void renderToolResult(message.params);
            return;
          }
          if (message.method === "ui/notifications/host-context-changed") {
            applyHostContext(message.params);
            return;
          }
          if (message.method === "ping" && message.id !== undefined) {
            respond(message.id, {});
            return;
          }
          if (message.method === "ui/resource-teardown" && message.id !== undefined) {
            respond(message.id, {});
            dispose();
            return;
          }
          if (message.id !== undefined && typeof message.method === "string") {
            failRequest(message.id, -32601, "Method not found");
          }
        }, { passive: true });

        zoomOut.addEventListener("click", () => applyScale(scale / 1.2));
        zoomIn.addEventListener("click", () => applyScale(scale * 1.2));
        fit.addEventListener("click", fitSchematic);
        openButton.addEventListener("click", async () => {
          if (!connected || browserUrl === undefined) return;
          try {
            const result = await request("ui/open-link", { url: browserUrl });
            if (isRecord(result) && result.isError === true) {
              throw new Error("The host did not open the circuit viewer.");
            }
          } catch (error) {
            showState(error instanceof Error ? error.message : "The viewer link could not be opened.", "error");
          }
        });

        const connect = async () => {
          try {
            const result = await request("ui/initialize", {
              appInfo: { name: "Circuit Sim schematic", version: "1.0.0" },
              appCapabilities: { availableDisplayModes: ["inline"] },
              protocolVersion: PROTOCOL_VERSION,
            });
            if (!isRecord(result)) throw new Error("The host returned an invalid initialization result.");
            applyHostContext(result.hostContext);
            notify("ui/notifications/initialized");
            connected = true;

            if (typeof ResizeObserver === "function") {
              const sendSize = () => {
                if (resizeFrame) cancelAnimationFrame(resizeFrame);
                resizeFrame = requestAnimationFrame(() => {
                  const rect = document.documentElement.getBoundingClientRect();
                  notify("ui/notifications/size-changed", {
                    width: Math.min(1200, Math.max(1, Math.ceil(rect.width))),
                    height: Math.min(760, Math.max(1, Math.ceil(document.documentElement.scrollHeight))),
                  });
                });
              };
              resizeObserver = new ResizeObserver(sendSize);
              resizeObserver.observe(document.documentElement);
              resizeObserver.observe(document.body);
              sendSize();
            }
          } catch (error) {
            showState(error instanceof Error ? error.message : "The MCP App could not connect.", "error");
          }
        };

        void connect();
      })();
    </script>
  </body>
</html>`
