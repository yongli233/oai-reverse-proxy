/** This whole module kinda sucks */
import fs from "fs";
import express, { Router, Request, Response } from "express";
import showdown from "showdown";
import { config } from "./config";
import { buildInfo, ServiceInfo } from "./service-info";
import { getLastNImages } from "./shared/file-storage/image-history";
import { keyPool } from "./shared/key-management";
import { MODEL_FAMILY_SERVICE, ModelFamily } from "./shared/models";
import { withSession } from "./shared/with-session";
import { checkCsrfToken, injectCsrfToken } from "./shared/inject-csrf";
<<<<<<< HEAD
import { renderCustomPage } from "./custom-info";

const INFO_PAGE_TTL = 2000;
const MODEL_FAMILY_FRIENDLY_NAME: { [f in ModelFamily]: string } = {
  turbo: "GPT-3.5 Turbo",
  gpt4: "GPT-4",
  "gpt4-32k": "GPT-4 32k",
  "gpt4-turbo": "GPT-4 Turbo",
  "dall-e": "DALL-E",
  claude: "Claude",
=======

const INFO_PAGE_TTL = 2000;
const MODEL_FAMILY_FRIENDLY_NAME: { [f in ModelFamily]: string } = {
  "turbo": "GPT-3.5 Turbo",
  "gpt4": "GPT-4",
  "gpt4-32k": "GPT-4 32k",
  "gpt4-turbo": "GPT-4 Turbo",
  "dall-e": "DALL-E",
  "claude": "Claude (Sonnet)",
  "claude-opus": "Claude (Opus)",
>>>>>>> upstream/main
  "gemini-pro": "Gemini Pro",
  "mistral-tiny": "Mistral 7B",
  "mistral-small": "Mixtral Small", // Originally 8x7B, but that now refers to the older open-weight version. Mixtral Small is a newer closed-weight update to the 8x7B model.
  "mistral-medium": "Mistral Medium",
  "mistral-large": "Mistral Large",
<<<<<<< HEAD
  "aws-claude": "AWS Claude",
=======
  "aws-claude": "AWS Claude (Sonnet)",
>>>>>>> upstream/main
  "azure-turbo": "Azure GPT-3.5 Turbo",
  "azure-gpt4": "Azure GPT-4",
  "azure-gpt4-32k": "Azure GPT-4 32k",
  "azure-gpt4-turbo": "Azure GPT-4 Turbo",
};

const converter = new showdown.Converter();
const customGreeting = fs.existsSync("greeting.md")
  ? `\n## Server Greeting\n${fs.readFileSync("greeting.md", "utf8")}`
  : "";
let infoPageHtml: string | undefined;
let infoPageLastUpdated = 0;

<<<<<<< HEAD
export const getBaseUrl = (req: Request) => {
  const baseUrl =
    process.env.SPACE_ID && !req.get("host")?.includes("hf.space")
      ? getExternalUrlForHuggingfaceSpaceId(process.env.SPACE_ID)
      : req.protocol + "://" + req.get("host");

  return baseUrl;
};

=======
>>>>>>> upstream/main
export const handleInfoPage = (req: Request, res: Response) => {
  if (infoPageLastUpdated + INFO_PAGE_TTL > Date.now()) {
    return res.send(infoPageHtml);
  }

<<<<<<< HEAD
  const baseUrl = getBaseUrl(req);
  const isCustomPage = fs.existsSync("./public/info.html");

  const info = buildInfo(baseUrl + config.proxyEndpointRoute);
  infoPageHtml = isCustomPage ? renderCustomPage(info) : renderPage(info);
=======
  const baseUrl =
    process.env.SPACE_ID && !req.get("host")?.includes("hf.space")
      ? getExternalUrlForHuggingfaceSpaceId(process.env.SPACE_ID)
      : req.protocol + "://" + req.get("host");

  const info = buildInfo(baseUrl + config.proxyEndpointRoute);
  infoPageHtml = renderPage(info);
>>>>>>> upstream/main
  infoPageLastUpdated = Date.now();

  res.send(infoPageHtml);
};

export function renderPage(info: ServiceInfo) {
  const title = getServerTitle();
  const headerHtml = buildInfoPageHeader(info);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        background-color: #f0f0f0;
<<<<<<< HEAD
        padding: 1rem;
      }
			
=======
        padding: 1em;
      }
>>>>>>> upstream/main
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #222;
          color: #eee;
        }
        
        a:link, a:visited {
          color: #bbe;
        }
      }
    </style>
  </head>
  <body>
    ${headerHtml}
    <hr />
    <h2>Service Info</h2>
    <pre>${JSON.stringify(info, null, 2)}</pre>
    ${getSelfServiceLinks()}
  </body>
</html>`;
}

/**
 * If the server operator provides a `greeting.md` file, it will be included in
 * the rendered info page.
 **/
function buildInfoPageHeader(info: ServiceInfo) {
  const title = getServerTitle();
  // TODO: use some templating engine instead of this mess
  let infoBody = `# ${title}`;
  if (config.promptLogging) {
    infoBody += `\n## Prompt Logging Enabled
This proxy keeps full logs of all prompts and AI responses. Prompt logs are anonymous and do not contain IP addresses or timestamps.

[You can see the type of data logged here, along with the rest of the code.](https://gitgud.io/khanon/oai-reverse-proxy/-/blob/main/src/shared/prompt-logging/index.ts).

**If you are uncomfortable with this, don't send prompts to this proxy!**`;
  }

  if (config.staticServiceInfo) {
    return converter.makeHtml(infoBody + customGreeting);
  }

  const waits: string[] = [];

  for (const modelFamily of config.allowedModelFamilies) {
    const service = MODEL_FAMILY_SERVICE[modelFamily];

    const hasKeys = keyPool.list().some((k) => {
      return k.service === service && k.modelFamilies.includes(modelFamily);
    });

    const wait = info[modelFamily]?.estimatedQueueTime;
    if (hasKeys && wait) {
<<<<<<< HEAD
      waits.push(
        `**${MODEL_FAMILY_FRIENDLY_NAME[modelFamily] || modelFamily}**: ${wait}`
      );
=======
      waits.push(`**${MODEL_FAMILY_FRIENDLY_NAME[modelFamily] || modelFamily}**: ${wait}`);
>>>>>>> upstream/main
    }
  }

  infoBody += "\n\n" + waits.join(" / ");

  infoBody += customGreeting;

  infoBody += buildRecentImageSection();

  return converter.makeHtml(infoBody);
}

function getSelfServiceLinks() {
  if (config.gatekeeper !== "user_token") return "";
  return `<footer style="font-size: 0.8em;"><hr /><a target="_blank" href="/user/lookup">Check your user token info</a></footer>`;
}

<<<<<<< HEAD
export function getServerTitle() {
=======
function getServerTitle() {
>>>>>>> upstream/main
  // Use manually set title if available
  if (process.env.SERVER_TITLE) {
    return process.env.SERVER_TITLE;
  }

  // Huggingface
  if (process.env.SPACE_ID) {
    return `${process.env.SPACE_AUTHOR_NAME} / ${process.env.SPACE_TITLE}`;
  }

  // Render
  if (process.env.RENDER) {
    return `Render / ${process.env.RENDER_SERVICE_NAME}`;
  }

  return "OAI Reverse Proxy";
}

function buildRecentImageSection() {
  if (
    !config.allowedModelFamilies.includes("dall-e") ||
    !config.showRecentImages
  ) {
    return "";
  }

  let html = `<h2>Recent DALL-E Generations</h2>`;
  const recentImages = getLastNImages(12).reverse();
  if (recentImages.length === 0) {
    html += `<p>No images yet.</p>`;
    return html;
  }

  html += `<div style="display: flex; flex-wrap: wrap;" id="recent-images">`;
  for (const { url, prompt } of recentImages) {
    const thumbUrl = url.replace(/\.png$/, "_t.jpg");
    const escapedPrompt = escapeHtml(prompt);
    html += `<div style="margin: 0.5em;" class="recent-image">
<a href="${url}" target="_blank"><img src="${thumbUrl}" title="${escapedPrompt}" alt="${escapedPrompt}" style="max-width: 150px; max-height: 150px;" /></a>
</div>`;
  }
  html += `</div>`;

  return html;
}

<<<<<<< HEAD
export function escapeHtml(unsafe: string) {
=======
function escapeHtml(unsafe: string) {
>>>>>>> upstream/main
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getExternalUrlForHuggingfaceSpaceId(spaceId: string) {
  try {
    const [username, spacename] = spaceId.split("/");
    return `https://${username}-${spacename.replace(/_/g, "-")}.hf.space`;
  } catch (e) {
    return "";
  }
}

<<<<<<< HEAD
function checkIfUnlocked(
  req: Request,
  res: Response,
  next: express.NextFunction
) {
=======
function checkIfUnlocked(req: Request, res: Response, next: express.NextFunction) {
>>>>>>> upstream/main
  if (config.serviceInfoPassword?.length && !req.session?.unlocked) {
    return res.redirect("/unlock-info");
  }
  next();
}

const infoPageRouter = Router();
if (config.serviceInfoPassword?.length) {
  infoPageRouter.use(
    express.json({ limit: "1mb" }),
    express.urlencoded({ extended: true, limit: "1mb" })
  );
  infoPageRouter.use(withSession);
  infoPageRouter.use(injectCsrfToken, checkCsrfToken);
<<<<<<< HEAD
  infoPageRouter.post("/unlock-info", (req, res) => {
    if (req.body.password !== config.serviceInfoPassword) {
      return res.status(403).send("Incorrect password");
    }
    req.session!.unlocked = true;
    res.redirect("/");
  });
=======
  infoPageRouter.post(
    "/unlock-info",
    (req, res) => {
      if (req.body.password !== config.serviceInfoPassword) {
        return res.status(403).send("Incorrect password");
      }
      req.session!.unlocked = true;
      res.redirect("/");
    },
  );
>>>>>>> upstream/main
  infoPageRouter.get("/unlock-info", (_req, res) => {
    if (_req.session?.unlocked) return res.redirect("/");

    res.send(`
      <form method="post" action="/unlock-info">
        <h1>Unlock Service Info</h1>
        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}" />
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Unlock</button>
      </form>
    `);
  });
  infoPageRouter.use(checkIfUnlocked);
}
infoPageRouter.get("/", handleInfoPage);
infoPageRouter.get("/status", (req, res) => {
  res.json(buildInfo(req.protocol + "://" + req.get("host"), false));
});
export { infoPageRouter };
