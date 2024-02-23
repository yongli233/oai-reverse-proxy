import fs from "fs";
import { config } from "./config";
import { escapeHtml, getServerTitle } from "./info-page";
import type { ServiceInfo } from "./service-info";
import { getLastNImages } from "./shared/file-storage/image-history";
import { MODEL_FAMILY_SERVICE } from "./shared/models";
import { getUserPublicInfo } from "./shared/users/user-store";

export const getUsersData = () => {
  if (config.gatekeeper === "user_token") return getUserPublicInfo();
};

export const getRecentImages = () => {
  if (config.allowedModelFamilies.includes("dall-e") && config.showRecentImages) {
    return getLastNImages(config.numberOfImages)
      .reverse()
      .map(({ prompt, url }) => ({
        thumbUrl: url.replace(/\.png$/, "_t.jpg"),
        escapedPrompt: escapeHtml(prompt),
      }));
  }
};

export const renderCustomPage = (info: ServiceInfo) => {
  const title = getServerTitle();

  const userPublicData = getUserPublicInfo();
  const recentImages = getRecentImages();

  let customPage = fs
    .readFileSync("./public/info.html", "utf-8")
    // Info
    .replaceAll("{uptime}", info.uptime.toString())
    .replaceAll("{title}", title)
    .replaceAll("{status}", info.status ?? "")
    .replaceAll("{build}", info.build)

    // Proompts
    .replaceAll("{proompts:total}", info.proomptsTotal?.toString() ?? "0")
    .replaceAll("{proompts:start}", info.proompts?.toString() ?? "0")
    .replaceAll("{proompts:now}", info.proomptersNow?.toString() ?? "0")

    // Tookens
    .replaceAll("{tokens:total}", info.tookensTotal?.toString() ?? "0 tokens ($0.00)")
    .replaceAll("{tokens:start}", info.tookens ?? "0 tokens ($0.00)")

    // Keys
    .replaceAll("{key:openai}", info.openaiKeys?.toString() ?? "0")
    .replaceAll("{key:openaiOrg}", info.openaiOrgs?.toString() ?? "0")
    .replaceAll("{key:claude}", info.anthropicKeys?.toString() ?? "0")
    .replaceAll("{key:aws-claude}", info.awsKeys?.toString() ?? "0")
    .replaceAll("{key:google-ai}", info["google-aiKeys"]?.toString() ?? "0")

    // TODO: Automate this
    // Turbo
    .replaceAll("{turbo:usage}", info.turbo?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{turbo:active}", info.turbo?.activeKeys?.toString() ?? "0")
    .replaceAll("{turbo:trial}", info.turbo?.trialKeys?.toString() ?? "0")
    .replaceAll("{turbo:revoked}", info.turbo?.revokedKeys?.toString() ?? "0")
    .replaceAll("{turbo:overQuota}", info.turbo?.overQuotaKeys?.toString() ?? "0")
    .replaceAll("{turbo:inQueue}", info.turbo?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{turbo:waitTime}", info.turbo?.estimatedQueueTime ?? "No wait")

    // GPT 4
    .replaceAll("{gpt4:usage}", info.gpt4?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{gpt4:active}", info.gpt4?.activeKeys?.toString() ?? "0")
    .replaceAll("{gpt4:trial}", info.gpt4?.trialKeys?.toString() ?? "0")
    .replaceAll("{gpt4:revoked}", info.gpt4?.revokedKeys?.toString() ?? "0")
    .replaceAll("{gpt4:overQuota}", info.gpt4?.overQuotaKeys?.toString() ?? "0")
    .replaceAll("{gpt4:inQueue}", info.gpt4?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{gpt4:waitTime}", info.gpt4?.estimatedQueueTime ?? "No wait")

    // GPT 4 Turbo
    .replaceAll("{gpt4-turbo:usage}", info["gpt4-turbo"]?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{gpt4-turbo:active}", info["gpt4-turbo"]?.activeKeys?.toString() ?? "0")
    .replaceAll("{gpt4-turbo:trial}", info["gpt4-turbo"]?.trialKeys?.toString() ?? "0")
    .replaceAll("{gpt4-turbo:revoked}", info["gpt4-turbo"]?.revokedKeys?.toString() ?? "0")
    .replaceAll("{gpt4-turbo:overQuota}", info["gpt4-turbo"]?.overQuotaKeys?.toString() ?? "0")
    .replaceAll("{gpt4-turbo:inQueue}", info["gpt4-turbo"]?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{gpt4-turbo:waitTime}", info["gpt4-turbo"]?.estimatedQueueTime ?? "No wait")

    // GPT 4-32k
    .replaceAll("{gpt4-32k:usage}", info["gpt4-32k"]?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{gpt4-32k:active}", info["gpt4-32k"]?.activeKeys?.toString() ?? "0")
    .replaceAll("{gpt4-32k:trial}", info["gpt4-32k"]?.trialKeys?.toString() ?? "0")
    .replaceAll("{gpt4-32k:revoked}", info["gpt4-32k"]?.revokedKeys?.toString() ?? "0")
    .replaceAll("{gpt4-32k:overQuota}", info["gpt4-32k"]?.overQuotaKeys?.toString() ?? "0")
    .replaceAll("{gpt4-32k:inQueue}", info["gpt4-32k"]?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{gpt4-32k:waitTime}", info["gpt4-32k"]?.estimatedQueueTime ?? "No wait")

    // Dall-e
    .replaceAll("{dall-e:usage}", info["dall-e"]?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{dall-e:active}", info["dall-e"]?.activeKeys?.toString() ?? "0")
    .replaceAll("{dall-e:trial}", info["dall-e"]?.trialKeys?.toString() ?? "0")
    .replaceAll("{dall-e:revoked}", info["dall-e"]?.revokedKeys?.toString() ?? "0")
    .replaceAll("{dall-e:overQuota}", info["dall-e"]?.overQuotaKeys?.toString() ?? "0")
    .replaceAll("{dall-e:inQueue}", info["dall-e"]?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{dall-e:waitTime}", info["dall-e"]?.estimatedQueueTime ?? "No wait")

    .replaceAll("{dall-e:recentImages}", JSON.stringify(recentImages ?? []))

    // Gemini
    .replaceAll("{gemini-pro:usage}", info["gemini-pro"]?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{gemini-pro:active}", info["gemini-pro"]?.activeKeys?.toString() ?? "0")
    .replaceAll("{gemini-pro:inQueue}", info["gemini-pro"]?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{gemini-pro:waitTime}", info["gemini-pro"]?.estimatedQueueTime ?? "No wait")

    // Claude
    .replaceAll("{claude:usage}", info.claude?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{claude:active}", info.claude?.activeKeys?.toString() ?? "0")
    .replaceAll("{claude:pozzed}", info.claude?.prefilledKeys?.toString() ?? "0")
    .replaceAll("{claude:overQuota}", info.claude?.overQuotaKeys?.toString() ?? "0")
    .replaceAll("{claude:revoked}", info.claude?.revokedKeys?.toString() ?? "0")
    .replaceAll("{claude:inQueue}", info.claude?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{claude:waitTime}", info.claude?.estimatedQueueTime ?? "No wait")

    // AWS Claude
    .replaceAll("{aws-claude:usage}", info["aws-claude"]?.usage ?? "0 tokens ($0.00)")
    .replaceAll("{aws-claude:active}", info["aws-claude"]?.activeKeys?.toString() ?? "0")
    .replaceAll("{aws-claude:inQueue}", info["aws-claude"]?.proomptersInQueue?.toString() ?? "0")
    .replaceAll("{aws-claude:waitTime}", info["aws-claude"]?.estimatedQueueTime ?? "No wait")

    // Config
    .replaceAll("{config:gatekeeper}", info.config.gatekeeper)
    .replaceAll("{config:logging}", info.config.promptLogging ?? "false")
    .replaceAll("{config:allowAwsLogging}", info.config.allowAwsLogging ?? "false")
    .replaceAll("{config:rejectMessage}", info.config.rejectMessage)
    .replaceAll("{config:modelRateLimit}", info.config.textModelRateLimit)
    .replaceAll("{config:textModelRateLimit}", info.config.textModelRateLimit)
    .replaceAll("{config:imageModelRateLimit}", info.config.imageModelRateLimit)
    .replaceAll("{config:maxOutputTokensOpenAI}", info.config.maxOutputTokensOpenAI)
    .replaceAll("{config:maxOutputTokensAnthropic}", info.config.maxOutputTokensAnthropic)
    .replaceAll("{config:maxContextTokensOpenAI}", info.config.maxContextTokensOpenAI)
    .replaceAll("{config:maxContextTokensAnthropic}", info.config.maxContextTokensAnthropic)

    // User Public Data
    .replaceAll(
      "{user:publicData}",
      JSON.stringify(userPublicData ?? [], (_, value) => (typeof value === "string" ? value.replace(/\r|\n/g, "") : value))
    );

  // Endpoints
  for (let [key, value] of Object.entries(info.endpoints)) {
    // ! Backward compatibility, will remove later on
    if (key === "anthropic") key = "claude";
    else if (key === "openai-image") key = "dall-e";

    customPage = customPage.replaceAll(`{endpoint:${key}}`, value ?? "Not available");
  }

  // Tokens Quota
  for (const [key, value] of Object.entries(info.config.tokenQuota)) {
    customPage = customPage.replaceAll(`{tokenQuota:${key}}`, value);
  }

  // Estimated
  for (const _model of Object.keys(MODEL_FAMILY_SERVICE)) {
    const model = _model as keyof typeof MODEL_FAMILY_SERVICE;
    customPage = customPage.replaceAll(`{${model}:estimated}`, info[model]?.estimatedQueueTime ?? "No wait");
  }

  return customPage;
};
