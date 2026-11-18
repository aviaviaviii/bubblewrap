import { PostHog } from "posthog-node";

const env = (key: string) => process.env[key] ?? (import.meta.env[key] as string | undefined);

let posthogLogs: PostHog | null | undefined;
let shutdownHandlerRegistered = false;

function missingConfigurationWarning(variable: string) {
  console.warn(
    `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`,
  );
}

function getPostHogLogs() {
  if (posthogLogs !== undefined) return posthogLogs;

  const apiKey = env("PUBLIC_POSTHOG_PROJECT_TOKEN");
  const host = env("PUBLIC_POSTHOG_HOST");
  if (!apiKey || !host) {
    if (!import.meta.env.PROD) {
      missingConfigurationWarning(!apiKey ? "PUBLIC_POSTHOG_PROJECT_TOKEN" : "PUBLIC_POSTHOG_HOST");
    }
    posthogLogs = null;
    return posthogLogs;
  }

  posthogLogs = new PostHog(apiKey, {
    host,
    logs: { serviceName: "bubblewrap-admin-api" },
  });

  if (!shutdownHandlerRegistered) {
    shutdownHandlerRegistered = true;
    process.once("SIGTERM", () => {
      void posthogLogs?.shutdown(2000).catch(() => {});
    });
  }

  return posthogLogs;
}

export function logAdminOperation(body: string, attributes?: Record<string, string>) {
  getPostHogLogs()?.logger.info(body, attributes);
}

export function warnAdminOperation(body: string, attributes?: Record<string, string>) {
  getPostHogLogs()?.logger.warn(body, attributes);
}
